import { jsPDF } from "jspdf";
import { readFileSync } from "node:fs";
import path from "node:path";

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

function invoiceLogoDataUri() {
  try {
    const logo = readFileSync(path.join(process.cwd(), "public", "the-cubicle-invoice-logo.png")).toString("base64");
    return `data:image/png;base64,${logo}`;
  } catch {
    return null;
  }
}

export function createInvoicePdfAttachment(input: InvoicePdfInput) {
  const currency = text(input.currency) || "PKR";
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const leftMargin = 24;
  const rightMargin = 21;
  const green = [0, 107, 53] as const;
  const lightGreen = [198, 225, 218] as const;
  let y = 82;

  // Match the upper invoice treatment: a white page, two-tone left rail,
  // compact brand block, and right-aligned invoice metadata.
  pdf.setFillColor(...lightGreen);
  pdf.rect(0, 0, 8.5, 54, "F");
  pdf.setFillColor(...green);
  pdf.rect(0, 54, 8.5, pageHeight - 54, "F");

  const logo = invoiceLogoDataUri();
  if (logo) {
    // The PNG has white canvas around the mark; the crop mirrors the browser
    // invoice header so only the wordmark is visible in this area.
    pdf.addImage(logo, "PNG", leftMargin - 9.7, 5.8, 94, 55.0);
  } else {
    pdf.setTextColor(...green);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("THE", leftMargin, 31);
    pdf.setTextColor(8, 8, 8);
    pdf.text("CUBICLE", leftMargin + 22, 31);
  }

  pdf.setTextColor(8, 8, 8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16.5);
  pdf.text("INVOICE", pageWidth - rightMargin, 32, { align: "right" });
  pdf.setTextColor(85, 93, 90);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.8);
  pdf.text(`NO. ${text(input.invoiceNumber)}`, pageWidth - rightMargin, 39, { align: "right" });
  pdf.text(`DATE ${text(input.issueDate)}`, pageWidth - rightMargin, 45, { align: "right" });

  pdf.setTextColor(98, 107, 104);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.7);
  pdf.text("89-AC-2, Gulberg 3, Lahore,", leftMargin, 43);
  pdf.text("Pakistan. 54000", leftMargin, 48);
  pdf.text("+92 339 2824253", leftMargin, 53);
  pdf.text("sales@thecubicle.pk", leftMargin, 58);
  pdf.text("NTN D-030195", leftMargin, 69);

  pdf.setTextColor(38, 49, 44);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("INVOICED TO", leftMargin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(text(input.accountName) || "Client", leftMargin, y + 8);
  pdf.setFontSize(9);
  pdf.setTextColor(82, 97, 90);
  pdf.text(`Due date: ${text(input.dueDate)}`, pageWidth - rightMargin, y + 8, { align: "right" });

  y += 28;
  pdf.setFillColor(0, 107, 53);
  pdf.rect(leftMargin, y, pageWidth - leftMargin - rightMargin, 9, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("DESCRIPTION", leftMargin + 4, y + 6);
  pdf.text("AMOUNT", pageWidth - rightMargin - 4, y + 6, { align: "right" });
  y += 17;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(38, 49, 44);
  for (const item of input.items || []) {
    const description = text(item.description) || "Workspace service";
    const lines = pdf.splitTextToSize(description, pageWidth - leftMargin - rightMargin - 58);
    pdf.text(lines, leftMargin + 4, y);
    pdf.text(money(item.amount, currency), pageWidth - rightMargin - 4, y, { align: "right" });
    y += Math.max(10, lines.length * 5 + 5);
    pdf.setDrawColor(225, 235, 231);
    pdf.line(leftMargin, y - 3, pageWidth - rightMargin, y - 3);
  }

  y += 7;
  const summaryX = pageWidth - rightMargin - 78;
  const summaryValueX = pageWidth - rightMargin - 4;
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

  y += 5;
  pdf.setTextColor(38, 49, 44);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("PAYMENT INFORMATION", leftMargin, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Account Title: THECUBICLE", leftMargin, y);
  y += 5;
  pdf.text("Account No: 07380200021208", leftMargin, y);
  y += 5;
  pdf.text("Askari Bank: Garden Town Branch Lahore", leftMargin, y);
  y += 5;
  pdf.text("IBAN: PK51ASCM0007380200021208", leftMargin, y);
  y += 5;
  pdf.setTextColor(82, 97, 90);
  pdf.text("Please share payment advice after making the transaction", leftMargin, y);

  pdf.setTextColor(115, 128, 120);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("This is a system generated invoice from The Cubicle.", leftMargin, pageHeight - 18);
  pdf.text(`Invoice ${text(input.invoiceNumber)}`, pageWidth - rightMargin, pageHeight - 18, { align: "right" });

  const arrayBuffer = pdf.output("arraybuffer") as ArrayBuffer;
  return {
    filename: `${text(input.invoiceNumber) || "invoice"}.pdf`,
    content: Buffer.from(arrayBuffer).toString("base64"),
  };
}
