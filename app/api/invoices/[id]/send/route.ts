import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendResendEmail, validEmail } from "@/lib/server-email";
import { resolveOsEmailSender } from "@/lib/server-os-email";
import { renderInvoiceEmailHtml, renderInvoiceEmailSubject, renderInvoiceEmailText } from "@/lib/invoice-email-html";
import { getOsEmailTemplate } from "@/lib/server-os-email-templates";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";
import { z } from "zod";

export const runtime = "nodejs";

const invoiceColumns = "id,invoice_number,account_name,currency,period_start,issue_date,due_date,subtotal,tax_enabled,tax_rate,tax_amount,sales_tax_enabled,sales_tax_rate,sales_tax_amount,total_amount,member_id";
const legacyInvoiceColumns = "id,invoice_number,account_name,currency,period_start,issue_date,due_date,subtotal,tax_enabled,tax_rate,tax_amount,total_amount,member_id";
const invoiceSendSchema = z.object({
  attachment: z.object({
    filename: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(34_000_000),
  }).strict().optional(),
  template: z.object({
    subject: z.string().trim().max(200).optional(),
    body: z.string().max(5000).optional(),
  }).strict().optional(),
}).strict();

function isMissingSalesTaxColumn(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("sales_tax_enabled") || message.includes("sales_tax_rate") || message.includes("sales_tax_amount");
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

async function updateDelivery(admin, eventId: string, invoiceId: string, status: "sent" | "failed", details: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const { error: eventError } = await admin
    .from("activity_log")
    .update({ delivery_status: status, completed_at: now, metadata: details })
    .eq("id", eventId);
  const { error: invoiceError } = await admin
    .from("invoices")
    .update({ email_status: status })
    .eq("id", invoiceId);
  if (eventError || invoiceError) throw eventError || invoiceError;
}

function parsePdfAttachment(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as { filename?: unknown; content?: unknown };
  let content = String(record.content || "")
    .replace(/^data:[^,]*,/i, "")
    .replace(/\s+/g, "")
    .trim();
  if (!content) return null;
  if (content.length > 25_000_000) throw new Error("The invoice PDF attachment is too large.");
  if (!/^[A-Za-z0-9+/_=-]+$/.test(content)) throw new Error("The invoice PDF attachment is invalid.");
  content = content.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = Buffer.from(content, "base64");
  const pdfHeader = decoded.indexOf(Buffer.from("%PDF-", "ascii"));
  if (pdfHeader < 0 || pdfHeader > 64) throw new Error("The invoice PDF attachment is invalid.");
  const pdfBytes = pdfHeader ? decoded.subarray(pdfHeader) : decoded;
  content = pdfBytes.toString("base64");
  const filename = String(record.filename || "invoice.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "") + ".pdf";
  return { filename, content };
}

function templateValue(template: unknown, key: "subject" | "body") {
  if (!template || typeof template !== "object") return undefined;
  const value = (template as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  let invoiceId = "";
  let eventId = "";
  let actorUserId = "";
  try {
    const { id } = await params;
    invoiceId = String(id || "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Invoice id is required." }, { status: 400 });
    if (!z.string().uuid().safeParse(invoiceId).success) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return NextResponse.json({ error: "Your session is invalid or expired." }, { status: 401 });
    actorUserId = userData.user.id;

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", {
      p_permission_key: "invoices.write",
    });
    if (permissionError || allowed !== true) {
      return NextResponse.json({ error: "Invoice sending access required." }, { status: 403 });
    }

    admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "invoice.send",
      userId: userData.user.id,
      ipLimit: 20,
      userLimit: 20,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, { action: "invoice.send", outcome: "rate_limited", actorUserId: userData.user.id, entityType: "invoice", entityId: invoiceId, request, metadata: { scope: "invoice.send" } });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many invoice delivery requests. Please try again later." }, response);
    }

    let { data: invoice, error: invoiceError } = await admin.from("invoices").select(invoiceColumns).eq("id", invoiceId).maybeSingle();
    if (invoiceError && isMissingSalesTaxColumn(invoiceError)) {
      const legacyResult = await admin.from("invoices").select(legacyInvoiceColumns).eq("id", invoiceId).maybeSingle();
      invoice = legacyResult.data;
      invoiceError = legacyResult.error;
    }
    if (invoiceError) throw invoiceError;
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const { data: member, error: memberError } = await admin.from("members").select("member_name,email").eq("id", invoice.member_id).maybeSingle();
    if (memberError) throw memberError;
    const recipientEmail = String(member?.email || "").trim().toLowerCase();
    if (!validEmail(recipientEmail)) return NextResponse.json({ error: "The client does not have a valid email address." }, { status: 422 });

    const { data: items, error: itemError } = await admin.from("invoice_items").select("description,quantity,line_total").eq("invoice_id", invoiceId).order("sort_order", { ascending: true });
    if (itemError) throw itemError;

    const body = await readJsonBody(request, 34 * 1024 * 1024, true);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return NextResponse.json({ error: requestBodyError(status) }, { status });
    }
    const parsedBody = invoiceSendSchema.safeParse(body.value);
    if (!parsedBody.success) return NextResponse.json({ error: "The invoice attachment is invalid." }, { status: 400 });
    let attachment;
    try {
      attachment = parsePdfAttachment(parsedBody.data.attachment);
    } catch (attachmentError) {
      console.error("Invoice PDF attachment rejected:", attachmentError instanceof Error ? attachmentError.message : attachmentError);
      return NextResponse.json({ error: "The invoice attachment is invalid." }, { status: 400 });
    }
    const storedTemplate = await getOsEmailTemplate(admin, "send-invoice");
    const actorEmail = String(userData.user.email || "").trim().toLowerCase();
    const sender = await resolveOsEmailSender({ client: admin, purpose: "invoices", actorEmail });

    const { data: activity, error: activityError } = await admin.from("activity_log").insert({
      action: "invoice.email_delivery",
      entity_type: "invoice",
      entity_id: invoiceId,
      actor_user_id: userData.user.id,
      recipient_email: recipientEmail,
      delivery_status: "pending",
      metadata: { invoice_number: invoice.invoice_number, sender: sender.from, reply_to: sender.replyTo || null, attachment_filename: attachment?.filename || null },
    }).select("id").single();
    if (activityError) throw activityError;
    eventId = activity.id;

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
      body: templateValue(parsedBody.data.template, "body") || storedTemplate.body,
    };
    const html = renderInvoiceEmailHtml(emailInput);
    const subject = renderInvoiceEmailSubject(templateValue(parsedBody.data.template, "subject") || storedTemplate.subject, emailInput);
    const text = renderInvoiceEmailText(emailInput);

    const emailResult = await sendResendEmail({
      from: sender.from,
      replyTo: sender.replyTo,
      to: [recipientEmail],
      subject,
      html,
      text,
      attachments: attachment ? [{ filename: attachment.filename, content: attachment.content }] : [],
    });

    await updateDelivery(admin, eventId, invoiceId, "sent", { provider: "resend", provider_message_id: emailResult?.id || null, sender: sender.from, reply_to: sender.replyTo || null, attachment_filename: attachment?.filename || null });
    await recordSecurityAudit(admin, { action: "invoice.send", outcome: "success", actorUserId: userData.user.id, entityType: "invoice", entityId: invoiceId, request, metadata: { attachment: Boolean(attachment) } });
    return NextResponse.json({ ok: true, delivery: { status: "sent", recipientEmail, sender: sender.from, replyTo: sender.replyTo || null, attachmentFilename: attachment?.filename || null, providerMessageId: emailResult?.id || null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice email delivery failed.";
    if (admin && eventId && invoiceId) {
      try { await updateDelivery(admin, eventId, invoiceId, "failed", { error: message }); } catch (loggingError) { console.error("Invoice delivery failure could not be finalized:", loggingError); }
    }
    if (admin && invoiceId) {
      await recordSecurityAudit(admin, { action: "invoice.send", outcome: "failure", actorUserId: actorUserId || null, entityType: "invoice", entityId: invoiceId, request, metadata: { reason: "delivery_failed" } });
    }
    console.error("Invoice email delivery failed:", error);
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: "Invoice email delivery could not be completed." }, { status });
  }
}
