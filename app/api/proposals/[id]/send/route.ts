import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderProposalEmailHtml, renderProposalEmailSubject, renderProposalEmailText } from "@/lib/proposal-email-html";
import { resolveEmailSender, sendResendEmail, validEmail } from "@/lib/server-email";

export const runtime = "nodejs";

const proposalColumns = "id,proposal_number,recipient_name,recipient_email,title,subtitle,issue_date,office,total_seats,total_amount";

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
  if (!value || typeof value !== "object") throw new Error("The proposal PDF attachment is required.");
  const record = value as { filename?: unknown; content?: unknown };
  const content = String(record.content || "").replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "").trim();
  if (!content) throw new Error("The proposal PDF attachment is required.");
  if (content.length > 25_000_000) throw new Error("The proposal PDF attachment is too large.");
  if (!/^[A-Za-z0-9+/=]+$/.test(content)) throw new Error("The proposal PDF attachment is invalid.");
  const filename = String(record.filename || "proposal.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "") + ".pdf";
  return { filename, content };
}

function templateValue(template: unknown, key: "subject" | "body") {
  if (!template || typeof template !== "object") return undefined;
  const value = (template as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.slice(0, key === "subject" ? 200 : 5000) : undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let proposalId = "";
  try {
    const { id } = await params;
    proposalId = String(id || "").trim();
    if (!proposalId) return NextResponse.json({ error: "Proposal id is required." }, { status: 400 });

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return NextResponse.json({ error: "Your session is invalid or expired." }, { status: 401 });

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "proposals.write" });
    if (permissionError || allowed !== true) return NextResponse.json({ error: "Proposal sending access required." }, { status: 403 });

    const admin = serviceClient();
    const { data: proposal, error: proposalError } = await admin.from("proposals").select(proposalColumns).eq("id", proposalId).maybeSingle();
    if (proposalError) throw proposalError;
    if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

    const recipientEmail = String(proposal.recipient_email || "").trim().toLowerCase();
    if (!validEmail(recipientEmail)) return NextResponse.json({ error: "The proposal recipient does not have a valid email address." }, { status: 422 });

    const requestBody = await request.json().catch(() => ({}));
    const attachment = parsePdfAttachment(requestBody?.attachment);
    const emailInput = {
      recipientName: proposal.recipient_name,
      proposalNumber: proposal.proposal_number,
      proposalDate: proposal.issue_date,
      title: proposal.title,
      subtitle: proposal.subtitle,
      office: proposal.office,
      totalSeats: proposal.total_seats,
      totalAmount: proposal.total_amount,
      body: templateValue(requestBody?.template, "body"),
    };
    const subject = renderProposalEmailSubject(templateValue(requestBody?.template, "subject"), emailInput);
    const html = renderProposalEmailHtml(emailInput);
    const text = renderProposalEmailText(emailInput);
    const actorEmail = String(userData.user.email || "").trim().toLowerCase();
    const actorName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || "The Cubicle";
    const sender = resolveEmailSender({ actorEmail, actorName });
    const emailResult = await sendResendEmail({
      from: sender.from,
      replyTo: sender.replyTo,
      to: [recipientEmail],
      subject,
      html,
      text,
      attachments: [{ filename: attachment.filename, content: attachment.content }],
    });

    const { error: statusError } = await admin.from("proposals").update({ status: "sent", updated_by: userData.user.id }).eq("id", proposalId);
    if (statusError) console.error("Proposal was emailed but its status could not be updated:", statusError);

    return NextResponse.json({ ok: true, delivery: { status: "sent", recipientEmail, sender: sender.from, replyTo: sender.replyTo || null, attachmentFilename: attachment.filename, providerMessageId: emailResult?.id || null, statusUpdated: !statusError } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal email delivery failed.";
    console.error("Proposal email delivery failed:", { proposalId, error });
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
