import { NextResponse } from "next/server";
import { z } from "zod";

import { getOsAuthContext } from "@/lib/server-os-auth";
import { getConfiguredEmailSenderOptions, getOsEmailSenderSettings, OS_EMAIL_PURPOSES } from "@/lib/server-os-email";

export const runtime = "nodejs";

const purposeKeys = OS_EMAIL_PURPOSES.map((purpose) => purpose.key) as [string, ...string[]];
const updateSchema = z.object({
  purpose: z.enum(purposeKeys as ["invitations", "invoices", "payment_reminders", "proposals", "quotations", "notifications"]),
  fromEmail: z.string().trim().email().max(320),
  fromName: z.string().trim().min(1).max(120).optional(),
  replyTo: z.string().trim().email().max(320).optional().or(z.literal("")),
}).strict();

async function authenticatedContext() {
  const context = await getOsAuthContext();
  if (context.kind === "configuration_error") return { response: NextResponse.json({ error: "OS authentication is not configured." }, { status: 503 }) };
  if (context.kind === "unauthenticated") return { response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  if (context.kind === "mfa_required") return { response: NextResponse.json({ error: "MFA verification is required." }, { status: 403 }) };
  if (context.kind === "unauthorized") return { response: NextResponse.json({ error: "This account does not have OS access." }, { status: 403 }) };
  return { context };
}

export async function GET() {
  try {
    const result = await authenticatedContext();
    if (result.response) return result.response;
    const { context } = result;
    const configured = await getOsEmailSenderSettings(context.serviceClient);
    return NextResponse.json({
      purposes: OS_EMAIL_PURPOSES,
      options: configured.options,
      settings: configured.settings,
      canManage: context.role.trim().toLowerCase() === "owner",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Email sender settings could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await authenticatedContext();
    if (result.response) return result.response;
    const { context } = result;
    if (context.role.trim().toLowerCase() !== "owner") return NextResponse.json({ error: "Only the workspace owner can manage email senders." }, { status: 403 });

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid verified sender address." }, { status: 400 });

    const selectedEmail = parsed.data.fromEmail.toLowerCase();
    const option = getConfiguredEmailSenderOptions().find((candidate) => candidate.fromEmail === selectedEmail);
    if (!option) return NextResponse.json({ error: "That sender is not configured as an approved Resend sender." }, { status: 400 });

    const { error } = await context.serviceClient
      .from("os_email_sender_settings")
      .upsert({
        purpose: parsed.data.purpose,
        from_email: selectedEmail,
        from_name: parsed.data.fromName?.trim() || option.fromName,
        reply_to: parsed.data.replyTo?.trim().toLowerCase() || null,
        updated_by: context.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "purpose" });
    if (error) throw error;

    return NextResponse.json({ saved: true, purpose: parsed.data.purpose, fromEmail: selectedEmail });
  } catch {
    return NextResponse.json({ error: "Email sender settings could not be saved." }, { status: 500 });
  }
}
