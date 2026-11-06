type InvoiceEmailItem = {
  description: unknown;
  amount: unknown;
};

type InvoiceEmailInput = {
  memberName: unknown;
  invoiceNumber: unknown;
  billingPeriod: unknown;
  dueDate: unknown;
  currency?: unknown;
  items: InvoiceEmailItem[];
  subtotal: unknown;
  salesTaxEnabled?: boolean;
  salesTaxAmount: unknown;
  whtEnabled?: boolean;
  whtAmount: unknown;
  totalAmount: unknown;
  body?: unknown;
};

export const defaultInvoiceEmailTemplate = {
  subject: "Invoice {{invoice_number}} for {{billing_period}}",
  body: "Hello {{member_name}}, your invoice {{invoice_number}} for {{billing_period}} is ready. Amount due: {{amount}}. Due date: {{due_date}}. You can view the invoice using the secure link below: {{invoice_link}}.",
};

export const invoiceEmailSubject = "Invoice {{invoice_number}} from The Cubicle";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "PKR") {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return `${escapeHtml(currency)} ${(Number.isFinite(parsed) ? parsed : 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function templateValues(input: InvoiceEmailInput) {
  return {
    member_name: String(input.memberName || "there"),
    invoice_number: String(input.invoiceNumber || ""),
    billing_period: String(input.billingPeriod || ""),
    amount: money(input.totalAmount, String(input.currency || "PKR")),
    due_date: String(input.dueDate || ""),
    invoice_link: "View invoice",
  };
}

function renderTemplate(value: unknown, fallback: string, input: InvoiceEmailInput) {
  const template = String(value || fallback).trim() || fallback;
  const data = templateValues(input);
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => data[key as keyof typeof data] || "");
}

export function renderInvoiceEmailSubject(templateSubject: unknown, input: InvoiceEmailInput) {
  return renderTemplate(templateSubject, defaultInvoiceEmailTemplate.subject, input).slice(0, 180);
}

function renderInvoiceEmailText(input: InvoiceEmailInput) {
  return renderTemplate(input.body, defaultInvoiceEmailTemplate.body, input);
}

export function renderInvoiceEmailHtml(input: InvoiceEmailInput) {
  const currency = String(input.currency || "PKR");
  const rows = (input.items || []).map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#26312c">${escapeHtml(item.description)}</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c;white-space:nowrap">${money(item.amount, currency)}</td></tr>`).join("");
  const salesTaxRow = input.salesTaxEnabled && Number(input.salesTaxAmount) > 0 ? `<tr><td style="padding-top:14px;color:#52615a">Sales Tax</td><td style="padding-top:14px;text-align:right;color:#52615a">${money(input.salesTaxAmount, currency)}</td></tr>` : "";
  const whtRow = input.whtEnabled && Number(input.whtAmount) > 0 ? `<tr><td style="padding-top:8px;color:#52615a">WHT</td><td style="padding-top:8px;text-align:right;color:#52615a">-${money(input.whtAmount, currency)}</td></tr>` : "";
  const bodyHtml = renderInvoiceEmailText(input)
    .split(/\r?\n/)
    .map((line) => line.trim()
      ? `<p style="margin:0 0 12px;color:#52615a;line-height:1.6">${escapeHtml(line)}</p>`
      : `<div style="height:4px"></div>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#26312c"><div style="padding:32px 16px"><div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e3;border-radius:14px;overflow:hidden"><div style="padding:24px 28px;background:#006b35;color:#ffffff"><div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;opacity:.82">The Cubicle</div><h1 style="margin:8px 0 0;font-size:26px;line-height:1.2">Invoice ${escapeHtml(input.invoiceNumber)}</h1></div><div style="padding:28px">${bodyHtml}<table style="width:100%;border-collapse:collapse;margin-top:24px"><tbody>${rows}<tr><td style="padding-top:20px;color:#52615a">Subtotal</td><td style="padding-top:20px;text-align:right;color:#52615a">${money(input.subtotal, currency)}</td></tr>${salesTaxRow}${whtRow}<tr><td style="padding-top:16px;font-size:18px;font-weight:700;color:#18201d">Amount due</td><td style="padding-top:16px;text-align:right;font-size:18px;font-weight:700;color:#006b35">${money(input.totalAmount, currency)}</td></tr></tbody></table><p style="margin:18px 0 0;color:#52615a">Due date: <strong style="color:#26312c">${escapeHtml(input.dueDate)}</strong></p><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5ebe7;color:#738078;font-size:12px;line-height:1.6">This is an automated message from The Cubicle. Please reply to this email if you have any questions.</p></div></div></div></body></html>`;
}

export function renderInvoiceEmailText(input: InvoiceEmailInput) {
  const currency = String(input.currency || "PKR");
  const amount = Number(String(input.totalAmount ?? 0).replace(/[^0-9.-]/g, ""));
  const formattedAmount = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
  return [
    `Hello ${String(input.memberName ?? "").trim()},`,
    "",
    `Your workspace invoice for ${String(input.billingPeriod ?? "").trim()} is ready. The complete invoice PDF is attached to this email.`,
    "",
    `Invoice: ${String(input.invoiceNumber ?? "").trim()}`,
    `Amount due: ${currency} ${formattedAmount}`,
    `Due date: ${String(input.dueDate ?? "").trim()}`,
    "",
    "This is an automated message from The Cubicle. Please reply to this email if you have any questions.",
  ].join("\n");
}
