export type InvoiceTemplateItem = { description: string; price: number; quantity?: number };

export type InvoiceTemplateData = {
  company: { name: string; address: string; phone: string; email: string; ntn?: string };
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  customer: { name: string; contact?: string };
  period?: string;
  items: InvoiceTemplateItem[];
  payment?: { accountTitle: string; accountNumber: string; bank: string; advice?: string };
  footer?: string;
  systemNote?: string;
  total?: number;
  discountAmount?: number;
};

const money = (value: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value);

function formatDocumentDate(value: unknown) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
}

export function invoiceFromRecord(invoice) {
  const amount = Number(String(invoice.amount || "0").replace(/[^0-9.-]/g, "")) || 0;
  const unitPrice = Number(String(invoice.unitPrice || invoice.amount || "0").replace(/[^0-9.-]/g, "")) || amount;
  const quantity = Number(invoice.qty) || 1;
  const number = String(invoice.invoice || "").replace(/^(?:INV|QUO)-\d{4}-/, "");
  return {
    company: { name: "THE CUBICLE", address: "89-AC-2, Gulberg 3, Lahore, Pakistan. 54000", phone: "+92 339 2824253", email: "sales@thecubicle.pk", ntn: "D-030195" },
    invoiceNumber: number,
    date: formatDocumentDate(invoice.issueDate || invoice.date),
    dueDate: formatDocumentDate(invoice.dueDate),
    customer: { name: invoice.account || invoice.customerName || "Customer", contact: invoice.customerName && invoice.customerName !== invoice.account ? invoice.customerName : invoice.contact },
    period: invoice.period,
    items: [{ description: invoice.itemDescription || "Workspace services", price: unitPrice, quantity }],
    payment: { accountTitle: "THECUBICLE", accountNumber: "07380200021208", bank: "Askari Bank: Garden Town Branch Lahore", advice: "Please share payment advice after making the transaction" },
    footer: "Thank you for partnering with The Cubicle. We look forward to creating the perfect space for your team to do its best work.",
    systemNote: "This is a system generated invoice and does not require a signature.",
    total: amount || unitPrice * quantity,
    discountAmount: Number(invoice.discountAmount) || 0,
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
  const subtotal = invoice.items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  return <main className={`invoice-page ${isQuotation ? "quotation-page" : ""}`} id="printable-invoice">
    <header className="invoice-header">
      <section className="company-block"><div className="company-logo"><span className="green">THE</span> CUBICLE</div><p className="company-details">{invoice.company.address}<br />{invoice.company.phone}<br />{invoice.company.email}</p>{invoice.company.ntn && !isQuotation ? <p className="company-details company-tax">NTN {invoice.company.ntn}</p> : null}</section>
      <section className="invoice-title"><h1>{documentTitle}</h1><div className="invoice-meta">NO. {invoice.invoiceNumber}</div><div className="invoice-meta">DATE {invoice.date}</div></section>
    </header>
    <section className="billing-row single-party-row"><div className="billing-col"><h2 className="section-label">{isQuotation ? "QUOTED TO" : "TO"}</h2><p className="customer-line">{invoice.customer.name}</p>{invoice.customer.contact ? <p className="customer-line">{invoice.customer.contact}</p> : null}</div>{!isQuotation ? <div className="billing-col invoice-date-card"><p className="customer-line"><strong>Issue date:</strong> {invoice.date}</p><p className="customer-line"><strong>Due date:</strong> {invoice.dueDate || "—"}</p></div> : null}</section>
    <table className="items-table"><thead><tr><th>Description</th><th>Price</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.quantity && item.quantity > 1 ? `${item.quantity} ` : ""}{item.description}</td><td>PKR {money(item.price * (item.quantity || 1))}</td></tr>)}</tbody></table>
    {isQuotation ? <>
      <section className="quotation-summary"><div className="quotation-summary-box"><div><span>SUB TOTAL</span><strong>PKR {money(subtotal)}</strong></div><div className="quotation-total"><span>TOTAL</span><strong>PKR {money(total)}</strong></div></div></section>
      <section className="quotation-terms"><h2>TERMS &amp; CONDITION</h2><ul>{terms.map((term) => <li key={term}>{term}</li>)}</ul></section>
    </> : <>
      <section className="bottom-section total-only-section"><div className="total-box"><span>TOTAL</span><span>PKR {money(total)}</span></div></section>
      <p className="footer-message">{invoice.footer || "Thank you for your business."}</p><p className="system-note">{invoice.systemNote || "This is a system generated invoice and does not require a signature."}</p>
    </>}
  </main>;
}
