import type { SupabaseClient } from "@supabase/supabase-js";

import { emailTemplates } from "@/features/email-templates/data";
import { sanitizeInvitationTemplateBody } from "@/lib/invitation-email-html";
import { sanitizeQuotationTemplateBody } from "@/lib/quotation-email-html";

export type OsEmailTemplateId =
  | "employee-invitation"
  | "payment-reminder"
  | "send-invoice"
  | "send-proposal"
  | "send-quotation";

export type OsEmailTemplate = {
  id: OsEmailTemplateId;
  subject: string;
  body: string;
  status: "Ready" | "Draft";
};

const templateIds = new Set<OsEmailTemplateId>([
  "employee-invitation",
  "payment-reminder",
  "send-invoice",
  "send-proposal",
  "send-quotation",
]);

function isMissingTemplatesTable(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "");
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("os_email_templates") && message.includes("does not exist");
}

function fallbackTemplate(id: OsEmailTemplateId): OsEmailTemplate {
  const template = emailTemplates.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Email template ${id} is not configured.`);
  return {
    id,
    subject: template.subject,
    body: id === "employee-invitation" ? sanitizeInvitationTemplateBody(template.body) : id === "send-quotation" ? sanitizeQuotationTemplateBody(template.body) : template.body,
    status: template.status === "Draft" ? "Draft" : "Ready",
  };
}

export function isOsEmailTemplateId(value: unknown): value is OsEmailTemplateId {
  return typeof value === "string" && templateIds.has(value as OsEmailTemplateId);
}

export function getDefaultOsEmailTemplates() {
  return Array.from(templateIds).map((id) => fallbackTemplate(id));
}

export async function getOsEmailTemplate(client: SupabaseClient, id: OsEmailTemplateId): Promise<OsEmailTemplate> {
  const fallback = fallbackTemplate(id);
  const { data, error } = await client
    .from("os_email_templates")
    .select("template_id,subject,body,status")
    .eq("template_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTemplatesTable(error)) return fallback;
    throw error;
  }

  return {
    id,
    subject: String(data?.subject || fallback.subject),
    body: id === "employee-invitation" ? sanitizeInvitationTemplateBody(data?.body || fallback.body) : id === "send-quotation" ? sanitizeQuotationTemplateBody(data?.body || fallback.body) : String(data?.body || fallback.body),
    status: data?.status === "Draft" ? "Draft" : "Ready",
  };
}

export async function getOsEmailTemplates(client: SupabaseClient) {
  const defaults = getDefaultOsEmailTemplates();
  const { data, error } = await client
    .from("os_email_templates")
    .select("template_id,subject,body,status,updated_at")
    .order("template_id", { ascending: true });

  if (error) {
    if (isMissingTemplatesTable(error)) return defaults.map((template) => ({ ...template, updatedAt: null }));
    throw error;
  }

  const rows = new Map((data || []).map((row) => [String(row.template_id), row]));
  return defaults.map((fallback) => {
    const row = rows.get(fallback.id);
    return {
      id: fallback.id,
      subject: String(row?.subject || fallback.subject),
      body: fallback.id === "employee-invitation" ? sanitizeInvitationTemplateBody(row?.body || fallback.body) : fallback.id === "send-quotation" ? sanitizeQuotationTemplateBody(row?.body || fallback.body) : String(row?.body || fallback.body),
      status: row?.status === "Draft" ? "Draft" as const : "Ready" as const,
      updatedAt: row?.updated_at || null,
    };
  });
}
