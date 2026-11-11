import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderQuotationEmailHtml, renderQuotationEmailSubject, renderQuotationEmailText } from "@/lib/quotation-email-html";
import { sendResendEmail, validEmail } from "@/lib/server-email";
import { resolveOsEmailSender } from "@/lib/server-os-email";
import { getOsEmailTemplate } from "@/lib/server-os-email-templates";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";
import { z } from "zod";

export const runtime = "nodejs";

const quotationColumns = "id,quotation_number,lead_id,company_name,customer_name,customer_email,issue_date,total_amount";
const quotationItemColumns = "description,quantity,line_total,sort_order";
const quotationSendSchema = z.object({
  attachment: z.object({
    filename: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(34_000_000),
  }).strict(),
  template: z.object({
    subject: z.string().trim().max(200).optional(),
    body: z.string().max(5_000).optional(),
  }).strict().optional(),
}).strict();

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

function parsePdfAttachment(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("The quotation PDF attachment is required.");
  const record = value as { filename?: unknown; content?: unknown };
  let content = String(record.content || "")
    .replace(/^data:[^,]*,/i, "")
    .replace(/\s+/g, "")
    .trim();
  if (!content) throw new Error("The quotation PDF attachment is required.");
  if (content.length > 25_000_000) throw new Error("The quotation PDF attachment is too large.");
  if (!/^[A-Za-z0-9+/_=-]+$/.test(content)) throw new Error("The quotation PDF attachment is invalid.");
  content = content.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = Buffer.from(content, "base64");
  const pdfHeader = decoded.indexOf(Buffer.from("%PDF-", "ascii"));
  if (pdfHeader < 0 || pdfHeader > 64) throw new Error("The quotation PDF attachment is invalid.");
  if (pdfHeader) content = decoded.subarray(pdfHeader).toString("base64");
  const filename = String(record.filename || "quotation.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "") + ".pdf";
  return { filename, content };
}

function templateValue(template: unknown, key: "subject" | "body") {
  if (!template || typeof template !== "object") return undefined;
  const value = (template as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.slice(0, key === "subject" ? 200 : 5000) : undefined;
}

function totalSeats(items: Array<{ quantity?: unknown }> | null | undefined) {
  return (items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0) || 1;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let quotationId = "";
  let actorUserId = "";
  let admin: ReturnType<typeof serviceClient> | null = null;

  try {
    const { id } = await params;
    quotationId = String(id || "").trim();
    if (!quotationId) return NextResponse.json({ error: "Quotation id is required." }, { status: 400 });
    if (!z.string().uuid().safeParse(quotationId).success) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return NextResponse.json({ error: "Your session is invalid or expired." }, { status: 401 });
    actorUserId = userData.user.id;

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "quotations.write" });
    if (permissionError || allowed !== true) return NextResponse.json({ error: "Quotation sending access required." }, { status: 403 });

    admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "quotation.send",
      userId: userData.user.id,
      ipLimit: 20,
      userLimit: 20,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, { action: "quotation.send", outcome: "rate_limited", actorUserId: userData.user.id, entityType: "quotation", entityId: quotationId, request, metadata: { scope: "quotation.send" } });
      return NextResponse.json({ error: "Too many quotation delivery requests. Please try again later." }, rateLimitResponse(rateLimit));
    }

    const { data: quotation, error: quotationError } = await admin.from("quotations").select(quotationColumns).eq("id", quotationId).maybeSingle();
    if (quotationError) throw quotationError;
    if (!quotation) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

    let recipientEmail = String(quotation.customer_email || "").trim().toLowerCase();
    if (quotation.lead_id) {
      const { data: lead, error: leadError } = await admin
        .from("leads")
        .select("email")
        .eq("id", quotation.lead_id)
        .maybeSingle();
      if (leadError) throw leadError;
      if (lead) recipientEmail = String(lead.email || "").trim().toLowerCase();
    }
    if (!validEmail(recipientEmail)) return NextResponse.json({ error: "The quotation recipient does not have a valid email address." }, { status: 422 });

    const { data: items, error: itemsError } = await admin
      .from("quotation_items")
      .select(quotationItemColumns)
      .eq("quotation_id", quotationId)
      .order("sort_order", { ascending: true });
    if (itemsError) throw itemsError;

    const firstItem = items?.[0];
    const body = await readJsonBody(request, 34 * 1024 * 1024, false);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return NextResponse.json({ error: requestBodyError(status) }, { status });
    }
    const parsedBody = quotationSendSchema.safeParse(body.value);
    if (!parsedBody.success) return NextResponse.json({ error: "The quotation attachment is invalid." }, { status: 400 });

    let attachment;
    try {
      attachment = parsePdfAttachment(parsedBody.data.attachment);
    } catch {
      return NextResponse.json({ error: "The quotation attachment is invalid." }, { status: 400 });
    }
    const storedTemplate = await getOsEmailTemplate(admin, "send-quotation");

    const emailInput = {
      recipientName: quotation.customer_name,
      quotationNumber: quotation.quotation_number,
      quotationDate: quotation.issue_date,
      title: firstItem?.description || "Workspace quotation",
      workspace: quotation.company_name || "Workspace services",
      totalSeats: totalSeats(items),
      totalAmount: quotation.total_amount,
      body: templateValue(parsedBody.data.template, "body") || storedTemplate.body,
    };
    const subject = renderQuotationEmailSubject(templateValue(parsedBody.data.template, "subject") || storedTemplate.subject, emailInput);
    const html = renderQuotationEmailHtml(emailInput);
    const text = renderQuotationEmailText(emailInput);
    const actorEmail = String(userData.user.email || "").trim().toLowerCase();
    const sender = await resolveOsEmailSender({ client: admin, purpose: "quotations", actorEmail });
    const emailResult = await sendResendEmail({
      from: sender.from,
      replyTo: sender.replyTo,
      to: [recipientEmail],
      subject,
      html,
      text,
      attachments: [{ filename: attachment.filename, content: attachment.content }],
    });

    const { error: statusError } = await admin.from("quotations").update({ status: "sent", updated_by: userData.user.id }).eq("id", quotationId);
    if (statusError) console.error("Quotation was emailed but its status could not be updated:", statusError);

    let leadStageUpdated = false;
    if (quotation.lead_id) {
      const { error: leadStageError } = await admin
        .from("leads")
        .update({ os_stage: "Quote Sent" })
        .eq("id", quotation.lead_id);
      leadStageUpdated = !leadStageError;
    }

    await recordSecurityAudit(admin, { action: "quotation.send", outcome: "success", actorUserId: userData.user.id, entityType: "quotation", entityId: quotationId, request, metadata: { attachment: true, status_updated: !statusError, lead_stage_updated: leadStageUpdated } });
    return NextResponse.json({ ok: true, delivery: { status: "sent", recipientEmail, sender: sender.from, replyTo: sender.replyTo || null, attachmentFilename: attachment.filename, providerMessageId: emailResult?.id || null, statusUpdated: !statusError, leadStageUpdated } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quotation email delivery failed.";
    if (admin && quotationId) await recordSecurityAudit(admin, { action: "quotation.send", outcome: "failure", actorUserId: actorUserId || null, entityType: "quotation", entityId: quotationId, request, metadata: { reason: "delivery_failed" } });
    console.error("Quotation email delivery failed:", { quotationId, error });
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: "Quotation email delivery could not be completed." }, { status });
  }
}
