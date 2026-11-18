import { chargeAmount, getEditableCharges } from "@/components/invoices/charge-editor";
import { calculateInvoiceTotals, isIncludedTax } from "@/lib/invoice-calculations";
import { workspaceInvoiceDescription } from "@/lib/invoice-description";

export type InvoiceTemplateItem = { description: string; price: number; quantity?: number };

export type InvoiceTemplateData = {
  company: { name: string; address: string; phone: string; email: string; ntn?: string };
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  billingStartDate?: string;
  customer: { name: string; contact?: string };
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  validThrough?: string;
  items: InvoiceTemplateItem[];
  payment?: { accountTitle: string; accountNumber: string; bank: string; iban?: string; advice?: string };
  footer?: string;
  systemNote?: string;
  total?: number;
  subtotal?: number;
  taxEnabled?: boolean;
  taxRate?: number;
  taxAmount?: number;
  taxLabel?: string;
  whtEnabled?: boolean;
  whtRate?: number;
  whtAmount?: number;
  salesTaxEnabled?: boolean;
  salesTaxRate?: number;
  salesTaxAmount?: number;
  salesTaxLabel?: string;
  discountAmount?: number;
};

const money = (value: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);

function formatDocumentDate(value: unknown) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
}

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

function invoicePeriodRange(startValue: unknown, endValue: unknown, fallback: unknown) {
  const start = String(startValue || "");
  const end = String(endValue || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return String(fallback || "");
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return String(fallback || "");
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  return `(${ordinal(startDate.getDate())} ${month.format(startDate)} To ${ordinal(endDate.getDate())})`;
}

function invoiceParty(invoice: any) {
  const account = String(invoice.account || invoice.customerName || "Customer").trim();
  const customerName = String(invoice.customerName || "").trim();
  if (customerName && customerName !== account) return { name: account, contact: customerName };
  const divider = account.lastIndexOf(" - ");
  if (divider > 0) return { name: account.slice(divider + 3).trim() || account, contact: account.slice(0, divider).trim() || undefined };
  return { name: account, contact: String(invoice.contact || "").trim() || undefined };
}

export function invoiceFromRecord(invoice) {
  const savedDescription = String(invoice.itemDescription || "").trim();
  const sourceItems = Array.isArray(invoice.items) && invoice.items.length ? invoice.items : getEditableCharges(invoice);
  const items = sourceItems.map((item, index) => ({
    description: workspaceInvoiceDescription(invoice.workspaceId, index === 0 && savedDescription ? savedDescription : String(item.description || item.itemDescription || "Workspace services"), item.quantity),
    price: chargeAmount(item.price ?? item.amount),
    quantity: Math.max(1, Number(item.quantity) || 1),
  }));
  const itemSubtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const subtotal = invoice.subtotal !== undefined ? chargeAmount(invoice.subtotal) : itemSubtotal;
  const totals = calculateInvoiceTotals({
    subtotal,
    salesTaxEnabled: Boolean(invoice.salesTaxEnabled),
    salesTaxRate: invoice.salesTaxRate,
    whtEnabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled),
    whtRate: invoice.whtRate ?? invoice.taxRate,
  });
  const explicitTotal = invoice.netTotal ?? invoice.totalAmount ?? invoice.amount;
  const total = explicitTotal !== undefined && explicitTotal !== null && String(explicitTotal).trim() !== ""
    ? chargeAmount(explicitTotal)
    : totals.total;
  const number = String(invoice.invoice || "").replace(/^(?:INV|QUO)-\d{4}-/, "");
  return {
    company: { name: "THE CUBICLE", address: "89-AC-2, Gulberg 3, Lahore, Pakistan. 54000", phone: "+92 339 2824253", email: "sales@thecubicle.pk", ntn: "D-030195" },
    invoiceNumber: number,
    date: formatDocumentDate(invoice.issueDate || invoice.date),
    dueDate: formatDocumentDate(invoice.dueDate),
    billingStartDate: formatDocumentDate(invoice.billingStartDate),
    customer: invoiceParty(invoice),
    period: invoicePeriodRange(invoice.periodStart, invoice.periodEnd, invoice.period),
    periodStart: formatDocumentDate(invoice.periodStart),
    periodEnd: formatDocumentDate(invoice.periodEnd),
    validThrough: invoice.validThrough || "7 days from issue",
    items,
    payment: { accountTitle: "THECUBICLE", accountNumber: "07380200021208", bank: "Askari Bank: Garden Town Branch Lahore", iban: "PK51ASCM0007380200021208", advice: "Please share payment advice after making the transaction" },
    footer: "Thank you for partnering with The Cubicle. We look forward to creating the perfect space for your team to do its best work.",
    systemNote: "This is a system generated invoice and does not require a signature.",
    total,
    subtotal: totals.subtotal,
    taxEnabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled),
    taxRate: totals.whtRate,
    taxAmount: totals.whtAmount,
    taxLabel: invoice.taxLabel || "WHT Tax",
    whtEnabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled),
    whtRate: totals.whtRate,
    whtAmount: totals.whtAmount,
    salesTaxEnabled: Boolean(invoice.salesTaxEnabled),
    salesTaxRate: totals.salesTaxRate,
    salesTaxAmount: totals.salesTaxAmount,
    salesTaxLabel: invoice.salesTaxLabel || "Sales Tax",
    discountAmount: chargeAmount(invoice.discountAmount),
  };
}

const terms = [
  "Upfront payment: 1 month's security deposit + 1 month's advance membership.",
  "Minimum contract term: 12 months. Public Holiday and Sunday access will be charged separately at PKR 20,000/- per day.",
  "Membership includes: Electricity, Internet, tea/coffee, valet parking, office staff, community management, heating & cooling",
  "Price quoted is for 12 - hour access 6 days a week.",
  "Security deposit adjustable as your last month's membership fee (subject to dues clearance & no damages).",
  "Quotation valid for 7 days from issue, signing contract and upfront payment within the date will ensure the validity beyond 7 days.",
];

export default function InvoiceTemplate({ invoice, documentTitle = "INVOICE" }) {
  const total = invoice.total ?? invoice.items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const isQuotation = documentTitle === "QUOTATION";
  const subtotal = invoice.subtotal ?? invoice.items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const whtAmount = invoice.whtAmount ?? invoice.taxAmount ?? 0;
  const salesTaxAmount = invoice.salesTaxAmount ?? 0;
  const whtIncluded = isIncludedTax(invoice.whtEnabled ?? invoice.taxEnabled, whtAmount, invoice.taxLabel);
  const salesTaxIncluded = isIncludedTax(invoice.salesTaxEnabled, salesTaxAmount, invoice.salesTaxLabel);
  const whtLabelValue = String(invoice.taxLabel || "WHT Tax");
  const whtLabel = whtLabelValue.trim().toUpperCase() === "WHT TAX" ? "WHT Tax" : whtLabelValue;
  return <main className={`invoice-page ${isQuotation ? "quotation-page" : ""}`} id="printable-invoice">
    <header className="invoice-header">
      <section className="company-block"><div className="company-logo"><img src="/the-cubicle-invoice-logo.png" alt="The Cubicle" /></div><p className="company-details">{invoice.company.address}<br />{invoice.company.phone}<br />{invoice.company.email}</p>{invoice.company.ntn && !isQuotation ? <p className="company-details company-tax">NTN {invoice.company.ntn}</p> : null}</section>
      <section className="invoice-title"><h1>{documentTitle}</h1><div className="invoice-meta">NO. {invoice.invoiceNumber}</div><div className="invoice-meta">DATE {invoice.date}</div></section>
    </header>
    <section className={`billing-row single-party-row${isQuotation ? " quotation-billing-row" : ""}`}><div className="billing-heading-row"><div className="billing-col"><h2 className="section-label">{isQuotation ? "QUOTED TO" : "INVOICED TO"}</h2></div>{!isQuotation ? <div className="billing-col invoice-period-card"><h2 className="section-label">INVOICE PERIOD</h2></div> : null}</div><div className="billing-divider" aria-hidden="true" /><div className="billing-details-row"><div className="billing-col"><p className="customer-line">{invoice.customer.name}</p>{invoice.customer.contact ? <p className="customer-line">{invoice.customer.contact}</p> : null}</div>{!isQuotation ? <div className="billing-col invoice-period-card"><p className="customer-line">{invoice.period || invoice.date}</p></div> : null}</div></section>
    <table className="items-table"><thead><tr><th><span className="invoice-table-heading">Description</span></th><th className="invoice-price-heading"><span className="invoice-table-heading">Price</span></th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.quantity && item.quantity > 1 ? `${item.quantity} ` : ""}{item.description}</td><td className="invoice-price-cell">PKR {money(item.price * (item.quantity || 1))}</td></tr>)}</tbody></table><div className="items-divider" aria-hidden="true" />
    {isQuotation ? <>
      <section className="quotation-summary"><div className="quotation-summary-box"><div><span>Sub Total</span><strong>PKR {money(subtotal)}</strong></div>{salesTaxIncluded ? <div><span>Sales Tax {invoice.salesTaxRate ? `(${invoice.salesTaxRate}%)` : ""}</span><strong>PKR {money(salesTaxAmount)}</strong></div> : null}{whtIncluded ? <div><span>{whtLabel} {invoice.whtRate ? `(${invoice.whtRate}%)` : ""}</span><strong>PKR {money(whtAmount)}</strong></div> : null}<div className="quotation-total"><span>Net Total</span><strong>PKR {money(total)}</strong></div></div></section>
      <section className="quotation-terms"><h2>TERMS &amp; CONDITION</h2><ul>{terms.map((term) => <li key={term}>{term}</li>)}</ul></section>
    </> : <>
      <section className="bottom-section invoice-bottom-section"><section className="payment-info"><h2>PAYMENT INFORMATION</h2><p>Account Title: {invoice.payment?.accountTitle || "THECUBICLE"}</p><p>Account No: {invoice.payment?.accountNumber || "07380200021208"}</p><p>{invoice.payment?.bank || "Askari Bank: Garden Town Branch Lahore"}</p><p>IBAN: {invoice.payment?.iban || "PK51ASCM0007380200021208"}</p>{invoice.payment?.advice ? <p className="payment-advice">{invoice.payment.advice}</p> : null}</section><div className={`total-box invoice-summary-box ${salesTaxIncluded || whtIncluded ? "" : "invoice-summary-box-simple"}`}>{salesTaxIncluded || whtIncluded ? <><div className="invoice-summary-row"><span>Sub Total</span><span>PKR {money(subtotal)}</span></div>{salesTaxIncluded ? <div className="invoice-summary-row"><span>Sales Tax{invoice.salesTaxRate ? ` (${invoice.salesTaxRate}%)` : ""}</span><span>PKR {money(salesTaxAmount)}</span></div> : null}{whtIncluded ? <div className="invoice-summary-row"><span>{whtLabel}{invoice.whtRate ? ` (${invoice.whtRate}%)` : ""}</span><span>PKR {money(whtAmount)}</span></div> : null}</> : null}<div className="invoice-summary-row invoice-summary-total"><span>Net Total</span><span>PKR {money(total)}</span></div></div></section>
      <p className="footer-message">{invoice.footer || "Thank you for your business."}</p><p className="system-note">{invoice.systemNote || "This is a system generated invoice and does not require a signature."}</p>
    </>}
  </main>;
}
