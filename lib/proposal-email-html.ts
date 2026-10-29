type ProposalEmailInput = {
  recipientName: unknown;
  proposalNumber: unknown;
  proposalDate: unknown;
  title: unknown;
  subtitle?: unknown;
  office?: unknown;
  totalSeats?: unknown;
  totalAmount?: unknown;
  body?: unknown;
};

export const defaultProposalEmailTemplate = {
  subject: "Proposal {{proposal_number}} from The Cubicle",
  body: "Hello {{recipient_name}},\n\nYour workspace proposal {{proposal_number}} is ready. The complete proposal PDF is attached for your review.\n\nProposal: {{title}}\nOffice: {{office}}\nSeats: {{total_seats}}\nTotal: {{total_amount}}\n\nPlease reply to this email if you have any questions.",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return `PKR ${(Number.isFinite(parsed) ? parsed : 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function values(input: ProposalEmailInput) {
  return {
    recipient_name: String(input.recipientName || "there"),
    proposal_number: String(input.proposalNumber || ""),
    proposal_date: String(input.proposalDate || ""),
    title: String(input.title || "Workspace proposal"),
    subtitle: String(input.subtitle || ""),
    office: String(input.office || "Not specified"),
    total_seats: String(input.totalSeats || "1"),
    total_amount: money(input.totalAmount),
  };
}

export function renderProposalEmailSubject(templateSubject: unknown, input: ProposalEmailInput) {
  const subject = String(templateSubject || defaultProposalEmailTemplate.subject).trim() || defaultProposalEmailTemplate.subject;
  const data = values(input);
  return subject.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => data[key as keyof typeof data] || "").slice(0, 180);
}

function renderTemplateBody(templateBody: unknown, input: ProposalEmailInput) {
  const body = String(templateBody || defaultProposalEmailTemplate.body).trim() || defaultProposalEmailTemplate.body;
  const data = values(input);
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => data[key as keyof typeof data] || "");
}

export function renderProposalEmailText(input: ProposalEmailInput) {
  return renderTemplateBody(input.body, input);
}

export function renderProposalEmailHtml(input: ProposalEmailInput) {
  const data = values(input);
  const renderedBody = renderProposalEmailText(input);
  const bodyHtml = renderedBody
    .split(/\r?\n/)
    .map((line) => line.trim() ? `<p style="margin:0 0 12px;color:#52615a;line-height:1.6">${escapeHtml(line)}</p>` : `<div style="height:4px"></div>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#26312c"><div style="padding:32px 16px"><div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e3;border-radius:14px;overflow:hidden"><div style="padding:24px 28px;background:#006b35;color:#ffffff"><div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;opacity:.82">The Cubicle</div><h1 style="margin:8px 0 0;font-size:26px;line-height:1.2">Proposal ${escapeHtml(data.proposal_number)}</h1></div><div style="padding:28px">${bodyHtml}<table style="width:100%;border-collapse:collapse;margin-top:24px;border-top:1px solid #e5ebe7"><tbody><tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#52615a">Proposal</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c">${escapeHtml(data.title)}</td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#52615a">Date</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c">${escapeHtml(data.proposal_date)}</td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#52615a">Workspace</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c">${escapeHtml(data.office)} · ${escapeHtml(data.total_seats)} seats</td></tr><tr><td style="padding-top:18px;font-size:18px;font-weight:700;color:#18201d">Total</td><td style="padding-top:18px;text-align:right;font-size:18px;font-weight:700;color:#006b35">${escapeHtml(data.total_amount)}</td></tr></tbody></table><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5ebe7;color:#738078;font-size:12px;line-height:1.6">The complete proposal PDF is attached to this email. Please reply if you have any questions.</p></div></div></div></body></html>`;
}
