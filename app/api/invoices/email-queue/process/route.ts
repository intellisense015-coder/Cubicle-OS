import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderInvoiceEmailHtml } from "@/lib/invoice-email-html";
import { createInvoicePdfAttachment } from "@/lib/server-invoice-pdf";
import { resolveEmailSender, sendResendEmail, validEmail } from "@/lib/server-email";

export const runtime = "nodejs";

const maxAttempts = 5;
const retryDelaysMinutes = [5, 30, 120, 720];
const invoiceColumns = "id,invoice_number,account_name,currency,period_start,issue_date,due_date,subtotal,tax_enabled,tax_amount,sales_tax_enabled,sales_tax_amount,total_amount,payment_status,member_id";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : request.headers.get("x-cron-secret") || "";
  return supplied === secret;
}

function nextRetry(attempt: number) {
  const minutes = retryDelaysMinutes[Math.min(Math.max(attempt - 1, 0), retryDelaysMinutes.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function markFailure(admin: any, row: any, message: string) {
  const attempt = Number(row.attempt_count || 1);
  const terminal = attempt >= maxAttempts;
  await admin.from("invoice_email_queue").update({
    status: terminal ? "failed" : "queued",
    next_attempt_at: terminal ? null : nextRetry(attempt),
    last_error: message.slice(0, 2000),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (terminal) await admin.from("invoices").update({ email_status: "failed" }).eq("id", row.invoice_id);
  return terminal;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const admin = serviceClient();
    const now = new Date().toISOString();
    const { data: candidates, error: queueError } = await admin
      .from("invoice_email_queue")
      .select("id,invoice_id,delivery_kind,recipient_email,subject,payload,status,attempt_count,scheduled_for,next_attempt_at,created_by,updated_at")
      .in("status", ["queued", "processing"])
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20);
    if (queueError) throw queueError;

    const results: Array<Record<string, unknown>> = [];
    for (const candidate of candidates || []) {
      const staleProcessing = candidate.status === "processing" && Date.now() - new Date(candidate.updated_at || candidate.scheduled_for).getTime() > 15 * 60_000;
      if (candidate.status === "processing" && !staleProcessing) continue;
      if (candidate.status === "queued" && candidate.next_attempt_at && String(candidate.next_attempt_at) > now) continue;
      const attempt = Number(candidate.attempt_count || 0) + 1;
      const { data: claimed, error: claimError } = await admin
        .from("invoice_email_queue")
        .update({ status: "processing", attempt_count: attempt, next_attempt_at: null, updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("status", candidate.status)
        .select("id,invoice_id,delivery_kind,recipient_email,attempt_count,created_by")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      try {
        const { data: invoice, error: invoiceError } = await admin.from("invoices").select(invoiceColumns).eq("id", candidate.invoice_id).maybeSingle();
        if (invoiceError) throw invoiceError;
        if (!invoice) throw new Error("Invoice not found.");
        if (String(invoice.payment_status || "").toLowerCase() === "paid") {
          await admin.from("invoice_email_queue").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", claimed.id);
          results.push({ invoice: invoice.invoice_number, status: "skipped_paid" });
          continue;
        }

        const { data: member, error: memberError } = await admin.from("members").select("member_name,email").eq("id", invoice.member_id).maybeSingle();
        if (memberError) throw memberError;
        const recipientEmail = String(member?.email || candidate.recipient_email || "").trim().toLowerCase();
        if (!validEmail(recipientEmail)) throw new Error("The client does not have a valid email address.");
        const { data: items, error: itemError } = await admin.from("invoice_items").select("description,quantity,unit_price,line_total").eq("invoice_id", invoice.id).order("sort_order", { ascending: true });
        if (itemError) throw itemError;

        const emailInput = {
          memberName: member?.member_name || invoice.account_name,
          invoiceNumber: invoice.invoice_number,
          billingPeriod: invoice.period_start,
          dueDate: invoice.due_date,
          currency: invoice.currency,
          items: (items || []).map((item) => ({ description: item.description, amount: item.line_total })),
          subtotal: invoice.subtotal,
          salesTaxEnabled: invoice.sales_tax_enabled === true,
          salesTaxAmount: invoice.sales_tax_amount,
          whtEnabled: invoice.tax_enabled === true,
          whtAmount: invoice.tax_amount,
          totalAmount: invoice.total_amount,
        };
        const attachment = createInvoicePdfAttachment({ ...emailInput, accountName: invoice.account_name, issueDate: invoice.issue_date });
        const sender = resolveEmailSender({ actorName: "The Cubicle" });
        const activity = claimed.created_by
          ? await admin.from("activity_log").insert({ action: "invoice.email_reminder", entity_type: "invoice", entity_id: invoice.id, actor_user_id: claimed.created_by, recipient_email: recipientEmail, delivery_status: "pending", metadata: { invoice_number: invoice.invoice_number, delivery_kind: candidate.delivery_kind, sender: sender.from, attachment_filename: attachment.filename } }).select("id").maybeSingle()
          : { data: null, error: null };
        const emailResult = await sendResendEmail({ from: sender.from, replyTo: sender.replyTo, to: [recipientEmail], subject: `Invoice ${invoice.invoice_number} from The Cubicle`, html: renderInvoiceEmailHtml(emailInput), attachments: [{ filename: attachment.filename, content: attachment.content }] });
        if (activity.data?.id) await admin.from("activity_log").update({ delivery_status: "sent", completed_at: new Date().toISOString(), metadata: { invoice_number: invoice.invoice_number, delivery_kind: candidate.delivery_kind, provider: "resend", provider_message_id: emailResult?.id || null, sender: sender.from, attachment_filename: attachment.filename } }).eq("id", activity.data.id);
        await admin.from("invoice_email_queue").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: emailResult?.id || null, last_error: null, updated_at: new Date().toISOString() }).eq("id", claimed.id);
        await admin.from("invoices").update({ email_status: "sent" }).eq("id", invoice.id);
        results.push({ invoice: invoice.invoice_number, status: "sent", providerMessageId: emailResult?.id || null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invoice email delivery failed.";
        const terminal = await markFailure(admin, claimed, message);
        results.push({ invoiceId: claimed.invoice_id, status: terminal ? "failed" : "retry_scheduled", error: message });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice email queue processing failed.";
    console.error("Invoice email queue processing failed:", error);
    return NextResponse.json({ error: message }, { status: message.includes("CRON_SECRET") ? 503 : 502 });
  }
}
