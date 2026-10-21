import { chargeAmount, getEditableCharges } from "@/components/invoices/charge-editor";

export type InvoiceTemplateItem = { description: string; price: number; quantity?: number };

export type InvoiceTemplateData = {
  company: { name: string; address: string; phone: string; email: string; ntn?: string };
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  billingStartDate?: string;
  joiningDate?: string;
  customer: { name: string; contact?: string };
  period?: string;
  validThrough?: string;
  items: InvoiceTemplateItem[];
  payment?: { accountTitle: string; accountNumber: string; bank: string; advice?: string };
  footer?: string;
  systemNote?: string;
  total?: number;
  subtotal?: number;
  taxEnabled?: boolean;
  taxRate?: number;
  taxAmount?: number;
  taxLabel?: string;
  discountAmount?: number;
};

const money = (value: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value);

function formatDocumentDate(value: unknown) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
}

export function invoiceFromRecord(invoice) {
  const items = getEditableCharges(invoice).map((charge) => ({ description: charge.description, price: chargeAmount(charge.amount), quantity: 1 }));
  const itemSubtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const subtotal = invoice.subtotal !== undefined ? chargeAmount(invoice.subtotal) : itemSubtotal;
  const total = invoice.amount !== undefined ? chargeAmount(invoice.amount) : subtotal;
  const number = String(invoice.invoice || "").replace(/^(?:INV|QUO)-\d{4}-/, "");
  return {
    company: { name: "THE CUBICLE", address: "89-AC-2, Gulberg 3, Lahore, Pakistan. 54000", phone: "+92 339 2824253", email: "sales@thecubicle.pk", ntn: "D-030195" },
    invoiceNumber: number,
    date: formatDocumentDate(invoice.issueDate || invoice.date),
    dueDate: formatDocumentDate(invoice.dueDate),
    billingStartDate: formatDocumentDate(invoice.billingStartDate),
    joiningDate: formatDocumentDate(invoice.joiningDate),
    customer: { name: invoice.account || invoice.customerName || "Customer", contact: invoice.customerName && invoice.customerName !== invoice.account ? invoice.customerName : invoice.contact },
    period: invoice.period,
    validThrough: invoice.validThrough || "7 days from issue",
    items,
    payment: { accountTitle: "THECUBICLE", accountNumber: "07380200021208", bank: "Askari Bank: Garden Town Branch Lahore", advice: "Please share payment advice after making the transaction" },
    footer: "Thank you for partnering with The Cubicle. We look forward to creating the perfect space for your team to do its best work.",
    systemNote: "This is a system generated invoice and does not require a signature.",
    total,
    subtotal,
    taxEnabled: Boolean(invoice.taxEnabled),
    taxRate: chargeAmount(invoice.taxRate),
    taxAmount: chargeAmount(invoice.taxAmount),
    taxLabel: invoice.taxLabel || "WHT TAX",
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
  const taxAmount = invoice.taxEnabled ? (invoice.taxAmount ?? Math.max(0, total - subtotal)) : 0;
  const taxLabel = invoice.taxLabel || (isQuotation ? "TAX" : "WHT TAX");
  return <main className={`invoice-page ${isQuotation ? "quotation-page" : ""}`} id="printable-invoice">
    <header className="invoice-header">
      <section className="company-block"><div className="company-logo"><span className="green">THE</span> CUBICLE</div><p className="company-details">{invoice.company.address}<br />{invoice.company.phone}<br />{invoice.company.email}</p>{invoice.company.ntn && !isQuotation ? <p className="company-details company-tax">NTN {invoice.company.ntn}</p> : null}</section>
      <section className="invoice-title"><h1>{documentTitle}</h1><div className="invoice-meta">NO. {invoice.invoiceNumber}</div><div className="invoice-meta">DATE {invoice.date}</div></section>
    </header>
    <section className="billing-row single-party-row"><div className="billing-col"><h2 className="section-label">{isQuotation ? "QUOTED TO" : "INVOICED TO"}</h2><p className="customer-line">{invoice.customer.name}</p>{invoice.customer.contact ? <p className="customer-line">{invoice.customer.contact}</p> : null}{!isQuotation && invoice.joiningDate ? <p className="period-subline">Joined {invoice.joiningDate}</p> : null}</div><div className="billing-col invoice-period-card"><h2 className="section-label">{isQuotation ? "VALID THROUGH" : "INVOICE PERIOD"}</h2><p className="customer-line">{isQuotation ? invoice.validThrough || "7 days from issue" : invoice.period || invoice.date}</p>{!isQuotation && invoice.billingStartDate ? <p className="period-subline">Billing start {invoice.billingStartDate}</p> : null}{!isQuotation && invoice.dueDate ? <p className="period-subline">Due {invoice.dueDate}</p> : null}</div></section>
    <table className="items-table"><thead><tr><th>Description</th><th>Price</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.quantity && item.quantity > 1 ? `${item.quantity} ` : ""}{item.description}</td><td>PKR {money(item.price * (item.quantity || 1))}</td></tr>)}</tbody></table>
    {isQuotation ? <>
      <section className="quotation-summary"><div className="quotation-summary-box"><div><span>SUB TOTAL</span><strong>PKR {money(subtotal)}</strong></div>{invoice.taxEnabled ? <div><span>{taxLabel} {invoice.taxRate ? `(${invoice.taxRate}%)` : ""}</span><strong>PKR {money(taxAmount)}</strong></div> : null}<div className="quotation-total"><span>TOTAL</span><strong>PKR {money(total)}</strong></div></div></section>
      <section className="quotation-terms"><h2>TERMS &amp; CONDITION</h2><ul>{terms.map((term) => <li key={term}>{term}</li>)}</ul></section>
    </> : <>
      <section className="bottom-section invoice-bottom-section"><section className="payment-info"><h2>PAYMENT INFORMATION</h2><p>Account Title: {invoice.payment?.accountTitle || "THECUBICLE"}</p><p>Account No: {invoice.payment?.accountNumber || "07380200021208"}</p><p>{invoice.payment?.bank || "Askari Bank: Garden Town Branch Lahore"}</p>{invoice.payment?.advice ? <p className="payment-advice">{invoice.payment.advice}</p> : null}</section><div className="total-box invoice-summary-box"><div><span>SUB TOTAL</span><span>PKR {money(subtotal)}</span></div><div><span>{taxLabel}{invoice.taxRate ? ` (${invoice.taxRate}%)` : ""}</span><span>PKR {money(taxAmount)}</span></div><div className="invoice-summary-total"><span>NET TOTAL</span><span>PKR {money(total)}</span></div></div></section>
      <p className="footer-message">{invoice.footer || "Thank you for your business."}</p><p className="system-note">{invoice.systemNote || "This is a system generated invoice and does not require a signature."}</p>
    </>}
  </main>;
}
