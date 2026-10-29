import { jsPDF } from "jspdf";

type InvoicePdfItem = { description: unknown; quantity?: unknown; unitPrice?: unknown; amount: unknown };

type InvoicePdfInput = {
  invoiceNumber: unknown;
  accountName: unknown;
  issueDate: unknown;
  dueDate: unknown;
  currency?: unknown;
  items: InvoicePdfItem[];
  subtotal: unknown;
  salesTaxEnabled?: boolean;
  salesTaxAmount?: unknown;
  whtEnabled?: boolean;
  whtAmount?: unknown;
  totalAmount: unknown;
};

function amount(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown, currency = "PKR") {
  return `${currency} ${amount(value).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function createInvoicePdfAttachment(input: InvoicePdfInput) {
  const currency = text(input.currency) || "PKR";
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  let y = 48;

  pdf.setFillColor(0, 107, 53);
  pdf.rect(0, 0, pageWidth, 36, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("THE CUBICLE", margin, 16);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Workspace invoice", margin, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`INVOICE ${text(input.invoiceNumber)}`, pageWidth - margin, 16, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Issued ${text(input.issueDate)}`, pageWidth - margin, 24, { align: "right" });

  pdf.setTextColor(38, 49, 44);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("INVOICED TO", margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(text(input.accountName) || "Client", margin, y + 8);
  pdf.setFontSize(9);
  pdf.setTextColor(82, 97, 90);
  pdf.text(`Due date: ${text(input.dueDate)}`, pageWidth - margin, y + 8, { align: "right" });

  y += 28;
  pdf.setFillColor(0, 107, 53);
  pdf.rect(margin, y, pageWidth - margin * 2, 9, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("DESCRIPTION", margin + 4, y + 6);
  pdf.text("AMOUNT", pageWidth - margin - 4, y + 6, { align: "right" });
  y += 17;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(38, 49, 44);
  for (const item of input.items || []) {
    const description = text(item.description) || "Workspace service";
    const lines = pdf.splitTextToSize(description, pageWidth - margin * 2 - 58);
    pdf.text(lines, margin + 4, y);
    pdf.text(money(item.amount, currency), pageWidth - margin - 4, y, { align: "right" });
    y += Math.max(10, lines.length * 5 + 5);
    pdf.setDrawColor(225, 235, 231);
    pdf.line(margin, y - 3, pageWidth - margin, y - 3);
  }

  y += 7;
  const summaryX = pageWidth - margin - 78;
  const summaryValueX = pageWidth - margin - 4;
  const summaryRow = (label: string, value: string, bold = false, color: [number, number, number] = [82, 97, 90]) => {
    pdf.setTextColor(...color);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 12 : 10);
    pdf.text(label, summaryX, y);
    pdf.text(value, summaryValueX, y, { align: "right" });
    y += bold ? 10 : 7;
  };
  summaryRow("Subtotal", money(input.subtotal, currency));
  if (input.salesTaxEnabled && amount(input.salesTaxAmount) > 0) summaryRow("Sales Tax", money(input.salesTaxAmount, currency));
  if (input.whtEnabled && amount(input.whtAmount) > 0) summaryRow("WHT", `- ${money(input.whtAmount, currency)}`);
  summaryRow("Amount due", money(input.totalAmount, currency), true, [0, 107, 53]);

  pdf.setTextColor(115, 128, 120);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("This is a system generated invoice from The Cubicle.", margin, pageHeight - 18);
  pdf.text(`Invoice ${text(input.invoiceNumber)}`, pageWidth - margin, pageHeight - 18, { align: "right" });

  const arrayBuffer = pdf.output("arraybuffer") as ArrayBuffer;
  return {
    filename: `${text(input.invoiceNumber) || "invoice"}.pdf`,
    content: Buffer.from(arrayBuffer).toString("base64"),
  };
}
