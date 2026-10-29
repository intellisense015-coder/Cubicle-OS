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
};

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

export function renderInvoiceEmailHtml(input: InvoiceEmailInput) {
  const currency = String(input.currency || "PKR");
  const rows = (input.items || []).map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;color:#26312c">${escapeHtml(item.description)}</td><td style="padding:12px 0;border-bottom:1px solid #e5ebe7;text-align:right;color:#26312c;white-space:nowrap">${money(item.amount, currency)}</td></tr>`).join("");
  const salesTaxRow = input.salesTaxEnabled && Number(input.salesTaxAmount) > 0 ? `<tr><td style="padding-top:14px;color:#52615a">Sales Tax</td><td style="padding-top:14px;text-align:right;color:#52615a">${money(input.salesTaxAmount, currency)}</td></tr>` : "";
  const whtRow = input.whtEnabled && Number(input.whtAmount) > 0 ? `<tr><td style="padding-top:8px;color:#52615a">WHT</td><td style="padding-top:8px;text-align:right;color:#52615a">-${money(input.whtAmount, currency)}</td></tr>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#26312c"><div style="padding:32px 16px"><div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e3;border-radius:14px;overflow:hidden"><div style="padding:24px 28px;background:#006b35;color:#ffffff"><div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;opacity:.82">The Cubicle</div><h1 style="margin:8px 0 0;font-size:26px;line-height:1.2">Invoice ${escapeHtml(input.invoiceNumber)}</h1></div><div style="padding:28px"><p style="margin:0 0 8px;font-size:16px">Hello ${escapeHtml(input.memberName)},</p><p style="margin:0;color:#52615a;line-height:1.6">Your workspace invoice for ${escapeHtml(input.billingPeriod)} is ready. The complete invoice PDF is attached to this email.</p><table style="width:100%;border-collapse:collapse;margin-top:24px"><tbody>${rows}<tr><td style="padding-top:20px;color:#52615a">Subtotal</td><td style="padding-top:20px;text-align:right;color:#52615a">${money(input.subtotal, currency)}</td></tr>${salesTaxRow}${whtRow}<tr><td style="padding-top:16px;font-size:18px;font-weight:700;color:#18201d">Amount due</td><td style="padding-top:16px;text-align:right;font-size:18px;font-weight:700;color:#006b35">${money(input.totalAmount, currency)}</td></tr></tbody></table><p style="margin:18px 0 0;color:#52615a">Due date: <strong style="color:#26312c">${escapeHtml(input.dueDate)}</strong></p><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5ebe7;color:#738078;font-size:12px;line-height:1.6">This is an automated message from The Cubicle. Please reply to this email if you have any questions.</p></div></div></div></body></html>`;
}
