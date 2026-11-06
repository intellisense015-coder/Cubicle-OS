import { NextResponse } from "next/server";
import { z } from "zod";

import { getOsAuthContext } from "@/lib/server-os-auth";
import { getOsEmailTemplates, isOsEmailTemplateId } from "@/lib/server-os-email-templates";
import { sanitizeInvitationTemplateBody } from "@/lib/invitation-email-html";
import { sanitizeQuotationTemplateBody } from "@/lib/quotation-email-html";

export const runtime = "nodejs";

const updateSchema = z.object({
  id: z.string().trim().refine(isOsEmailTemplateId, "Choose a valid email template."),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  status: z.enum(["Ready", "Draft"]).default("Ready"),
}).strict();

async function authenticatedContext() {
  const context = await getOsAuthContext();
  if (context.kind === "configuration_error") return { response: NextResponse.json({ error: "OS authentication is not configured." }, { status: 503 }) };
  if (context.kind === "unauthenticated") return { response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  if (context.kind === "mfa_required") return { response: NextResponse.json({ error: "MFA verification is required." }, { status: 403 }) };
  if (context.kind === "unauthorized") return { response: NextResponse.json({ error: "This account does not have OS access." }, { status: 403 }) };
  return { context };
}

async function canManageTemplates(context: Extract<Awaited<ReturnType<typeof getOsAuthContext>>, { kind: "authenticated" }>) {
  const { data, error } = await context.supabase.rpc("is_permission_granted", { p_permission_key: "email_templates.write" });
  return !error && data === true;
}

export async function GET() {
  try {
    const result = await authenticatedContext();
    if (result.response) return result.response;
    const { context } = result;
    const templates = await getOsEmailTemplates(context.serviceClient);
    return NextResponse.json({ templates, canManage: await canManageTemplates(context) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Email templates could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await authenticatedContext();
    if (result.response) return result.response;
    const { context } = result;
    if (!(await canManageTemplates(context))) return NextResponse.json({ error: "Email template editing access required." }, { status: 403 });

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "The email template content is invalid." }, { status: 400 });

    const body = parsed.data.id === "employee-invitation"
      ? sanitizeInvitationTemplateBody(parsed.data.body)
      : parsed.data.id === "send-quotation"
        ? sanitizeQuotationTemplateBody(parsed.data.body)
        : parsed.data.body;
    const { data, error } = await context.serviceClient
      .from("os_email_templates")
      .upsert({
        template_id: parsed.data.id,
        subject: parsed.data.subject,
        body,
        status: parsed.data.status,
        updated_by: context.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "template_id" })
      .select("template_id,subject,body,status,updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      saved: true,
      template: {
        id: data.template_id,
        subject: data.subject,
        body: data.body,
        status: data.status,
        updatedAt: data.updated_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "Email template could not be saved." }, { status: 500 });
  }
}
