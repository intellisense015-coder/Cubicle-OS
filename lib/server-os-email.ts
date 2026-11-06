import type { SupabaseClient } from "@supabase/supabase-js";

import { validEmail, type EmailSender } from "@/lib/server-email";

export const OS_EMAIL_PURPOSES = [
  { key: "invitations", label: "Employee invitations", description: "Invitation links sent when a new employee is added." },
  { key: "invoices", label: "Invoices", description: "Invoice emails sent to clients." },
  { key: "payment_reminders", label: "Payment Reminder", description: "Payment reminder emails sent to clients." },
  { key: "proposals", label: "Proposals", description: "Proposal and quotation emails sent to clients." },
  { key: "quotations", label: "Quotations", description: "Quotation emails sent to clients." },
  { key: "notifications", label: "Notifications", description: "General OS notifications and operational emails." },
] as const;

export type OsEmailPurpose = (typeof OS_EMAIL_PURPOSES)[number]["key"];

export type OsEmailSenderOption = {
  fromEmail: string;
  fromName: string;
};

type StoredSenderSetting = {
  purpose: OsEmailPurpose;
  from_email: string;
  from_name: string;
  reply_to: string | null;
};

function cleanName(value: unknown) {
  return String(value || "The Cubicle")
    .replace(/[<>\"]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "The Cubicle";
}

function parseSenderOption(value: unknown): OsEmailSenderOption | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const angleAddress = raw.match(/<([^>]+)>/);
  const fromEmail = String(angleAddress?.[1] || raw).trim().toLowerCase();
  if (!validEmail(fromEmail)) return null;

  const fromName = angleAddress ? cleanName(raw.slice(0, angleAddress.index).trim()) : "The Cubicle";
  return { fromEmail, fromName };
}

function uniqueOptions(options: OsEmailSenderOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.fromEmail)) return false;
    seen.add(option.fromEmail);
    return true;
  });
}

export function getConfiguredEmailSenderOptions() {
  const defaultSender = parseSenderOption(process.env.EMAIL_FROM);
  const configuredSenders = String(process.env.EMAIL_SENDER_OPTIONS || "")
    .split(",")
    .map((value) => parseSenderOption(value))
    .filter((value): value is OsEmailSenderOption => Boolean(value));

  return uniqueOptions([
    ...(defaultSender ? [defaultSender] : []),
    ...configuredSenders,
  ]);
}

function formatSender(option: OsEmailSenderOption) {
  return `${cleanName(option.fromName)} <${option.fromEmail}>`;
}

function isPurpose(value: unknown): value is OsEmailPurpose {
  return OS_EMAIL_PURPOSES.some((purpose) => purpose.key === value);
}

function isMissingSettingsTable(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "");
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("os_email_sender_settings") && message.includes("does not exist");
}

export async function getOsEmailSenderSettings(client: SupabaseClient) {
  const options = getConfiguredEmailSenderOptions();
  const { data, error } = await client
    .from("os_email_sender_settings")
    .select("purpose,from_email,from_name,reply_to")
    .order("purpose", { ascending: true });

  if (error && !isMissingSettingsTable(error)) throw error;

  const settings = (data || []).filter((setting): setting is StoredSenderSetting => isPurpose(setting?.purpose))
    .map((setting) => {
      const option = options.find((candidate) => candidate.fromEmail === String(setting.from_email || "").trim().toLowerCase());
      return {
        purpose: setting.purpose,
        fromEmail: option?.fromEmail || options[0]?.fromEmail || "",
        fromName: option?.fromName || options[0]?.fromName || "The Cubicle",
        replyTo: validEmail(setting.reply_to) ? String(setting.reply_to).trim().toLowerCase() : "",
        configured: Boolean(option),
      };
    });

  return { options, settings };
}

export async function resolveOsEmailSender({
  client,
  purpose,
  actorEmail,
}: {
  client: SupabaseClient;
  purpose: OsEmailPurpose;
  actorEmail?: unknown;
}): Promise<EmailSender> {
  const options = getConfiguredEmailSenderOptions();
  const fallback = options[0];
  if (!fallback) throw new Error("Email delivery is not configured. Set EMAIL_FROM to a verified sender address.");

  const { data, error } = await client
    .from("os_email_sender_settings")
    .select("from_email,from_name,reply_to")
    .eq("purpose", purpose)
    .maybeSingle();

  if (error && !isMissingSettingsTable(error)) throw error;

  const selectedEmail = String(data?.from_email || "").trim().toLowerCase();
  const selected = options.find((option) => option.fromEmail === selectedEmail) || fallback;
  const configuredReplyTo = validEmail(data?.reply_to) ? String(data.reply_to).trim().toLowerCase() : "";
  const normalizedActorEmail = String(actorEmail || "").trim().toLowerCase();

  return {
    from: formatSender({
      fromEmail: selected.fromEmail,
      fromName: data?.from_email === selected.fromEmail ? cleanName(data.from_name) : selected.fromName,
    }),
    replyTo: configuredReplyTo || (validEmail(normalizedActorEmail) ? normalizedActorEmail : undefined),
  };
}
