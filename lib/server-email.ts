export type ResendAttachment = {
  filename: string;
  content: string;
};

export type EmailSender = {
  from: string;
  replyTo?: string;
};

export type ResendEmailResult = {
  id: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: unknown) {
  return emailPattern.test(String(value || "").trim());
}

function extractAddress(value: string) {
  const angleAddress = value.match(/<([^>]+)>/);
  const address = angleAddress?.[1] || value;
  return address.trim().toLowerCase();
}

function cleanDisplayName(value: unknown) {
  return String(value || "The Cubicle")
    .replace(/[<>\"]+/g, "")
    .replace(/\s+/g, " ")
    .trim() || "The Cubicle";
}

function configuredFrom() {
  const value = String(process.env.EMAIL_FROM || "").trim();
  const address = extractAddress(value);
  if (!value || !validEmail(address)) {
    throw new Error("Email delivery is not configured. Set EMAIL_FROM to a verified sender address.");
  }
  return { value, address };
}

export function resolveEmailSender({ actorEmail, actorName }: { actorEmail?: unknown; actorName?: unknown }): EmailSender {
  const fallback = configuredFrom();
  const normalizedActorEmail = String(actorEmail || "").trim().toLowerCase();
  const verifiedDomain = fallback.address.split("@")[1] || "";
  const canUseActorAsSender = validEmail(normalizedActorEmail)
    && Boolean(verifiedDomain)
    && normalizedActorEmail.endsWith(`@${verifiedDomain}`);

  if (canUseActorAsSender) {
    return {
      from: `${cleanDisplayName(actorName)} <${normalizedActorEmail}>`,
      replyTo: normalizedActorEmail,
    };
  }

  return {
    from: fallback.value,
    replyTo: validEmail(normalizedActorEmail) ? normalizedActorEmail : undefined,
  };
}

export async function sendResendEmail({
  from,
  replyTo,
  to,
  subject,
  html,
  text,
  attachments = [],
}: {
  from: string;
  replyTo?: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("Email delivery is not configured. Set RESEND_API_KEY.");

  const payload = {
    from,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(attachments.length ? { attachments } : {}),
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "The email provider rejected the message.");
  const messageId = typeof result?.id === "string" ? result.id.trim() : "";
  if (!messageId) throw new Error("The email provider did not return a message ID.");
  return { id: messageId } satisfies ResendEmailResult;
}
