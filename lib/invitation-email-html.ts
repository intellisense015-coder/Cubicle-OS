type InvitationEmailInput = {
  name: unknown;
  actionLink: unknown;
  subject?: unknown;
  body?: unknown;
};

export const defaultInvitationEmailTemplate = {
  subject: "You’re invited to The Cubicle OS",
  body: "Hello {{employee_name}},\n\nYou have been invited to access The Cubicle OS. Use the button below to create your password and complete your account setup.\n\nThis invitation was sent by The Cubicle.",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function values(input: InvitationEmailInput) {
  return {
    employee_name: String(input.name || "there"),
  };
}

export function sanitizeInvitationTemplateBody(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .filter((line) => !/\{\{\s*invitation_link\s*\}\}/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderTemplate(value: unknown, fallback: string, input: InvitationEmailInput) {
  const template = String(value || fallback).trim() || fallback;
  const data = values(input);
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => data[key as keyof typeof data] || "");
}

type HeroCell = "blank" | "green" | "pale" | "half";

const invitationHeroRows: HeroCell[][] = [
  ["blank", "blank", "blank", "green", "green", "blank", "blank", "pale", "blank"],
  ["blank", "blank", "blank", "green", "blank", "half", "blank", "blank", "blank"],
  ["pale", "blank", "blank", "green", "blank", "half", "blank", "blank", "blank"],
  ["blank", "blank", "blank", "green", "green", "blank", "blank", "blank", "blank"],
  ["blank", "blank", "blank", "green", "blank", "half", "blank", "pale", "blank"],
  ["blank", "blank", "blank", "green", "blank", "half", "blank", "blank", "blank"],
  ["blank", "blank", "blank", "green", "green", "blank", "blank", "blank", "blank"],
];

function renderInvitationHeroCell(kind: HeroCell, rowIndex: number, columnIndex: number) {
  const background = kind === "green" || kind === "half" ? "#9db493" : kind === "pale" ? "#c8d9cf" : "transparent";
  const radius = kind === "half"
    ? "0 24px 24px 0"
    : rowIndex === 6 && columnIndex === 3
      ? "9px 9px 9px 25px"
      : rowIndex === 6 && columnIndex === 4
        ? "9px 9px 25px 9px"
        : "9px";
  return `<td width="44" height="44" style="width:44px;height:44px;padding:0;border-radius:${radius};background:${background};font-size:1px;line-height:1px">&nbsp;</td>`;
}

function renderInvitationHeroHtml() {
  const rows = invitationHeroRows.map((row, rowIndex) => (
    `<tr>${row.map((cell, columnIndex) => renderInvitationHeroCell(cell, rowIndex, columnIndex)).join("")}</tr>`
  )).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfcfb;border-radius:20px 20px 0 0"><tr><td align="center" style="padding:56px 20px"><table role="presentation" cellpadding="0" cellspacing="8" border="0" style="margin:0 auto;border-collapse:separate;border-spacing:8px">${rows}</table></td></tr></table>`;
}

export function renderInvitationEmailSubject(templateSubject: unknown, input: InvitationEmailInput) {
  return renderTemplate(templateSubject, defaultInvitationEmailTemplate.subject, input).slice(0, 180);
}

export function renderInvitationEmailText(input: InvitationEmailInput) {
  return renderTemplate(sanitizeInvitationTemplateBody(input.body), defaultInvitationEmailTemplate.body, input);
}

export function renderInvitationEmailHtml(input: InvitationEmailInput) {
  const bodyHtml = renderInvitationEmailText(input)
    .split(/\r?\n/)
    .map((line) => line.trim()
      ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#10231d">${escapeHtml(line)}</p>`
      : `<div style="height:4px"></div>`)
    .join("");
  const safeLink = escapeHtml(input.actionLink);
  const safeSubject = escapeHtml(renderInvitationEmailSubject(input.subject, input));
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f4f4;color:#10231d;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto;overflow:hidden;background:#fff;border-radius:20px">${renderInvitationHeroHtml()}<div style="padding:36px"><h1 style="margin:0 0 20px;color:#10231d;font-size:30px;line-height:1.15">${safeSubject}</h1>${bodyHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px"><tr><td align="center"><a href="${safeLink}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#005c49;color:#fff;font-size:16px;font-weight:700;text-decoration:none">Accept invitation</a></td></tr></table></div></div></body></html>`;
}
