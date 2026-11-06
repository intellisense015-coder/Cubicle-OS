type QuotationEmailInput = {
  recipientName: unknown;
  quotationNumber: unknown;
  quotationDate: unknown;
  title: unknown;
  workspace?: unknown;
  totalSeats?: unknown;
  totalAmount?: unknown;
  body?: unknown;
};

export const defaultQuotationEmailTemplate = {
  subject: "Quotation {{quotation_number}} from The Cubicle",
  body: "Hello {{recipient_name}},\n\nYour workspace quotation {{quotation_number}} is ready. The complete quotation PDF is attached for your review.\n\nTotal: {{total_amount}}\n\nPlease reply to this email if you have any questions.",
};

export function sanitizeQuotationTemplateBody(value: unknown) {
  const fallback = defaultQuotationEmailTemplate.body;
  const body = String(value || fallback).trim() || fallback;
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*(Quotation|Workspace|Seats):\s*\{\{\s*(title|workspace|total_seats)\s*\}\}\s*$/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

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

function formatDate(value: unknown) {
  const raw = String(value || "");
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function values(input: QuotationEmailInput) {
  return {
    recipient_name: String(input.recipientName || "there"),
    quotation_number: String(input.quotationNumber || ""),
    quotation_date: formatDate(input.quotationDate),
    title: String(input.title || "Workspace quotation"),
    workspace: String(input.workspace || "Workspace services"),
    total_seats: String(input.totalSeats || "1"),
    total_amount: money(input.totalAmount),
  };
}

function renderTemplate(template: unknown, fallback: string, input: QuotationEmailInput) {
  const value = String(template || fallback).trim() || fallback;
  const data = values(input);
  return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => data[key as keyof typeof data] || "");
}

export function renderQuotationEmailSubject(templateSubject: unknown, input: QuotationEmailInput) {
  return renderTemplate(templateSubject, defaultQuotationEmailTemplate.subject, input).slice(0, 180);
}

export function renderQuotationEmailText(input: QuotationEmailInput) {
  return renderTemplate(sanitizeQuotationTemplateBody(input.body), defaultQuotationEmailTemplate.body, input);
}

export function renderQuotationEmailHtml(input: QuotationEmailInput) {
  const data = values(input);
  const renderedBody = renderQuotationEmailText(input);
  const bodyHtml = renderedBody
    .split(/\r?\n/)
    .map((line) => line.trim()
      ? `<p style="margin:0 0 12px;color:#52615a;line-height:1.6">${escapeHtml(line)}</p>`
      : `<div style="height:4px"></div>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#26312c"><div style="padding:32px 16px"><div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e3;border-radius:14px;overflow:hidden"><div style="padding:24px 28px;background:#006b35;color:#ffffff"><div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;opacity:.82">The Cubicle</div><h1 style="margin:8px 0 0;font-size:26px;line-height:1.2">Quotation ${escapeHtml(data.quotation_number)}</h1></div><div style="padding:28px">${bodyHtml}<table style="width:100%;border-collapse:collapse;margin-top:24px;border-top:1px solid #e5ebe7"><tbody><tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#52615a">Quotation</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c">${escapeHtml(data.title)}</td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#52615a">Date</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c">${escapeHtml(data.quotation_date)}</td></tr><tr><td style="padding-top:18px;font-size:18px;font-weight:700;color:#18201d">Total</td><td style="padding-top:18px;text-align:right;font-size:18px;font-weight:700;color:#006b35">${escapeHtml(data.total_amount)}</td></tr></tbody></table><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5ebe7;color:#738078;font-size:12px;line-height:1.6">The complete quotation PDF is attached to this email. Please reply if you have any questions.</p></div></div></div></body></html>`;
}
