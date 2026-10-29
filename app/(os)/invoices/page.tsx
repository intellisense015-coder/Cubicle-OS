"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { motion } from "motion/react";
import { BookOpen, CalendarDays, ChevronDown, CirclePlus, Download, FileCheck2, FileText, Mail, MessageCircle, Pencil, Receipt, Send } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords } from "@/lib/workspace-records";
import { getActiveMemberInvoices } from "@/lib/billing";
import { syncWorkspaceBilling } from "@/lib/billing";
import DynamicInvoiceTemplate, { invoiceFromRecord } from "@/components/invoices/invoice-template";
import { ChargeEditor, chargeAmount, chargesTotal, getEditableCharges } from "@/components/invoices/charge-editor";
import { useToast } from "@/components/ui/toast-provider";
import { numericField } from "@/lib/number-input";
import { z } from "zod";
import { createSupabaseInvoice, fetchSupabaseInvoices, queueSupabaseInvoiceEmail, recordSupabaseInvoicePayment } from "@/lib/supabase/invoices";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useHasPermission } from "@/lib/access-control";

const invoiceAmount = (value) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const invoiceBalanceDue = (invoice) => {
  const status = String(invoice?.paymentStatus || "").toLowerCase();
  if (["paid", "cancelled", "canceled", "draft"].includes(status)) return 0;
  if (invoice?.balanceDue !== undefined) return Math.max(0, invoiceAmount(invoice.balanceDue));
  return Math.max(0, invoiceAmount(invoice?.amount) - invoiceAmount(invoice?.paidAmount ?? invoice?.amountPaid));
};
const hasOpenBalance = (invoice) => invoiceBalanceDue(invoice) > 0 && !["cancelled", "canceled", "draft"].includes(String(invoice?.paymentStatus || "").toLowerCase());
const formatInvoiceAmount = (value) => `PKR ${value.toLocaleString("en-PK")}`;
const displayPaymentStatus = (status) => status === "Grace" ? "Grace period" : status;
const invoiceSequence = (invoice) => Number(String(invoice || "").match(/(\d+)$/)?.[1] || 0);
const nextInvoiceNumber = (existingInvoices) => {
  const year = new Date().getFullYear();
  const highestSequence = existingInvoices.reduce(
    (highest, invoice) => Math.max(highest, invoiceSequence(invoice?.invoice)),
    1030
  );
  return `INV-${year}-${highestSequence + 1}`;
};
const currentMonthRange = () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return { from: key(start), to: key(end) }; };
const initialInvoiceRange = currentMonthRange();

function whatsappPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith("92")) digits = `92${digits}`;
  return digits;
}

const invoiceSchema = z.object({
  account: z.string().trim().min(1, "Choose who this invoice is billed to."),
  amount: z.string().trim().min(1, "Enter an invoice amount."),
  billingStartDate: z.string().min(1, "Choose a billing start date."),
  dueDay: z.string().regex(/^\d+$/, "Enter a whole-number due day.").refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."),
  issueDate: z.string().min(1, "Choose an invoice date."),
  dueDate: z.string().min(1, "Choose a due date."),
  itemDescription: z.string().trim().min(1, "Enter an item description."),
  taxEnabled: z.boolean().optional(),
  taxRate: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid WHT rate."),
  salesTaxEnabled: z.boolean().optional(),
  salesTaxRate: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid sales tax rate.").refine((value) => !value || Number(value) < 100, "Sales Tax must be below 100%.")
}).superRefine((values, ctx) => {
  if (values.dueDate && values.billingStartDate && values.dueDate < values.billingStartDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueDate"], message: "Due date cannot be earlier than the billing start date." });
  }
});

function getInvoiceDueDate(issueDate: string, dueDay: string | number, billingStartDate = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return issueDate || "";
  const [year, month, day] = issueDate.split("-").map(Number);
  const requestedDay = Math.min(Math.max(Number(dueDay) || 5, 1), 31);
  const dueDate = new Date(year, month - 1, Math.min(requestedDay, new Date(year, month, 0).getDate()), 12);
  if (/^\d{4}-\d{2}-\d{2}$/.test(billingStartDate) && billingStartDate.slice(0, 7) === issueDate.slice(0, 7) && dueDate < new Date(`${billingStartDate}T12:00:00`)) return billingStartDate;
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
}

// TITLE: INVOICE FORM
function InvoiceMemberSelect({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = members.find((member) => member.id === value);
  return <div className="settings-label lead-source-field member-lead-select"><span>Billed to</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? `${selected.member} - ${selected.company || "No company"}` : "Select a member"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{members.length ? members.map((member) => <button type="button" key={member.id} className={value === member.id ? "is-selected" : ""} onClick={() => { onChange(member); setOpen(false); }}>{member.member} - {member.company || "No company"}</button>) : <span className="dropdown-empty">No members added yet</span>}</div>}</div></div>;
}

function InvoiceForm({ members, onCancel, onSave, initialInvoice = null }) {
  const initialCharges = getEditableCharges(initialInvoice);
  const initialMember = members.find((member) => member.id === initialInvoice?.memberId || `${member.member} - ${member.company || "No company"}` === initialInvoice?.account);
  const initialBillingStartDate = initialInvoice?.billingStartDate || initialMember?.billingStartDate || initialMember?.joined || initialInvoice?.issueDate || "2026-10-05";
  const initialIssueDate = initialInvoice?.issueDate || initialBillingStartDate;
  const initialDueDay = String(initialInvoice?.dueDay || initialMember?.dueDay || 5);
  const initialDueDate = initialInvoice?.dueDate && initialInvoice.dueDate >= initialBillingStartDate ? initialInvoice.dueDate : getInvoiceDueDate(initialIssueDate, initialDueDay, initialBillingStartDate);
  const formApi = useForm({ resolver: zodResolver(invoiceSchema), defaultValues: { account: initialInvoice?.account || "", amount: String(chargesTotal(initialCharges)), billingStartDate: initialBillingStartDate, dueDay: initialDueDay, issueDate: initialIssueDate, dueDate: initialDueDate, itemDescription: initialCharges[0]?.description || "Workspace services", taxEnabled: Boolean(initialInvoice?.whtEnabled ?? initialInvoice?.taxEnabled), taxRate: String(initialInvoice?.whtRate ?? initialInvoice?.taxRate ?? "10"), salesTaxEnabled: Boolean(initialInvoice?.salesTaxEnabled), salesTaxRate: String(initialInvoice?.salesTaxRate ?? "0") }, mode: "onBlur" });
  const { handleSubmit, register, setValue, setError, watch, formState } = formApi;
  const [charges, setCharges] = useState(initialCharges);
  const updateCharges = (nextCharges) => { setCharges(nextCharges); setValue("amount", String(chargesTotal(nextCharges)), { shouldDirty: true }); setValue("itemDescription", nextCharges[0]?.description || "", { shouldDirty: true }); };
  const selectMember = (member) => { const description = member.workspaceService || member.service || (member.space && member.space !== "Unassigned" ? `${member.space} workspace service` : "Workspace services"); const nextCharges = [{ description, amount: String(chargeAmount(member.rent)) }]; const billingStartDate = member.billingStartDate || member.joined || watch("issueDate"); const dueDay = String(member.dueDay || 5); setValue("account", `${member.member} - ${member.company || "No company"}`, { shouldDirty: true }); setValue("billingStartDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("issueDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDay", dueDay, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(billingStartDate, dueDay, billingStartDate), { shouldDirty: true, shouldValidate: true }); updateCharges(nextCharges); };
  const handleIssueDateChange = (event) => { const issueDate = event.target.value; setValue("issueDate", issueDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(issueDate, watch("dueDay"), watch("billingStartDate")), { shouldDirty: true, shouldValidate: true }); };
  const subtotal = chargesTotal(charges);
  const totals = calculateInvoiceTotals({ subtotal, whtEnabled: watch("taxEnabled"), whtRate: watch("taxRate"), salesTaxEnabled: watch("salesTaxEnabled"), salesTaxRate: watch("salesTaxRate") });
  const save = (form) => { if (charges.some((charge) => !charge.description.trim())) { setError("itemDescription", { type: "manual", message: "Add a description for each charge." }); return; } const periodDate = new Date(`${form.issueDate}T12:00:00`); const member = members.find((item) => `${item.member} - ${item.company || "No company"}` === form.account); const normalizedCharges = charges.map((charge) => ({ description: charge.description.trim(), amount: String(parseAmount(charge.amount)) })); onSave({ ...form, memberId: member?.id || initialInvoice?.memberId, period: format(periodDate, "MMMM yyyy"), amount: String(totals.total), subtotal: String(totals.subtotal), taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxEnabled ? String(totals.whtRate) : "0", taxAmount: String(totals.whtAmount), whtEnabled: Boolean(form.taxEnabled), whtRate: form.taxEnabled ? String(totals.whtRate) : "0", whtAmount: String(totals.whtAmount), salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxEnabled ? String(totals.salesTaxRate) : "0", salesTaxAmount: String(totals.salesTaxAmount), taxLabel: "WHT TAX", itemDescription: normalizedCharges[0].description, charges: normalizedCharges, items: normalizedCharges.map((charge) => ({ description: charge.description, price: charge.amount, quantity: 1 })), unitPrice: String(totals.subtotal), qty: "1" }); };
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content invoice-form"><div className="card-heading"><div><span className="seat-details-label">{initialInvoice ? "Edit invoice" : "New invoice"}</span><h2>{initialInvoice ? "Edit invoice" : "Create invoice"}</h2><p className="muted-copy">Sales Tax is included in the total; WHT is withheld from the subtotal when enabled.</p></div></div><form className="inline-form-grid invoice-form-grid" onSubmit={handleSubmit(save)}><InvoiceMemberSelect members={members} value={members.find((member) => `${member.member} - ${member.company || "No company"}` === watch("account"))?.id || ""} onChange={selectMember} /><label className="settings-label">Billing start date<Input className={error("billingStartDate") ? "has-error" : ""} type="date" {...register("billingStartDate")} />{error("billingStartDate") && <span className="lead-form-error">{error("billingStartDate")}</span>}</label><label className="settings-label">Issue date<Input className={error("issueDate") ? "has-error" : ""} type="date" value={watch("issueDate")} onChange={handleIssueDateChange} />{error("issueDate") && <span className="lead-form-error">{error("issueDate")}</span>}</label><label className="settings-label">Due date<Input className={error("dueDate") ? "has-error" : ""} type="date" {...register("dueDate")} />{error("dueDate") && <span className="lead-form-error">{error("dueDate")}</span>}</label><input type="hidden" {...register("itemDescription")} /><input type="hidden" {...register("amount")} /><ChargeEditor charges={charges} onChange={updateCharges} />{error("itemDescription") && <span className="lead-form-error charge-editor-error">{error("itemDescription")}</span>}{error("amount") && <span className="lead-form-error charge-editor-error">{error("amount")}</span>}<label className="quotation-tax-toggle invoice-tax-toggle"><input type="checkbox" {...register("salesTaxEnabled")} /><span>Include Sales Tax</span><small>Sales Tax is included in the total.</small></label><label className="settings-label">Sales Tax rate (%)<Input className={error("salesTaxRate") ? "has-error" : ""} disabled={!watch("salesTaxEnabled")} {...numericField(register, "salesTaxRate")} placeholder="0" />{error("salesTaxRate") && <span className="lead-form-error">{error("salesTaxRate")}</span>}</label><label className="quotation-tax-toggle invoice-tax-toggle"><input type="checkbox" {...register("taxEnabled")} /><span>Include WHT</span><small>WHT is deducted from the subtotal.</small></label><label className="settings-label">WHT rate (%)<Input className={error("taxRate") ? "has-error" : ""} disabled={!watch("taxEnabled")} {...numericField(register, "taxRate")} placeholder="10" />{error("taxRate") && <span className="lead-form-error">{error("taxRate")}</span>}</label><label className="settings-label">Net total<Input value={`PKR ${totals.total.toLocaleString("en-PK")}`} readOnly /></label><div className="quotation-live-summary invoice-live-summary"><span>Charges PKR {totals.subtotal.toLocaleString("en-PK")}</span>{totals.salesTaxAmount > 0 ? <span>Sales Tax PKR {totals.salesTaxAmount.toLocaleString("en-PK")}</span> : null}{totals.whtAmount > 0 ? <span>WHT TAX PKR {totals.whtAmount.toLocaleString("en-PK")}</span> : null}<strong>Net total PKR {totals.total.toLocaleString("en-PK")}</strong></div><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Receipt size={15} /> {initialInvoice ? "Save changes" : "Create invoice"}</Button></div></form></div>;
}

// TITLE: INVOICE TABLE
function createInvoiceColumns(onOpen, onLedger, onEdit, canEdit = onEdit?.canEdit !== false) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("invoice", { header: "Invoice / account", cell: ({ row }) => <div className="table-primary invoice-primary"><strong>{row.original.invoice}</strong><span>{row.original.account}</span></div> }), columnHelper.accessor("period", { header: "Billing period", cell: ({ getValue }) => <span className="invoice-period"><CalendarDays size={13} /> {getValue()}</span> }), columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }), columnHelper.accessor("dueDate", { header: "Due", cell: ({ getValue }) => <span className="invoice-due">{format(new Date(getValue()), "MMM d, yyyy")}</span> }), columnHelper.accessor("paymentStatus", { header: "Status", cell: ({ getValue }) => { const value = getValue(); return <StatusBadge tone={value === "Paid" ? "success" : value === "Overdue" ? "danger" : "accent"}>{displayPaymentStatus(value)}</StatusBadge>; } }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onLedger(row.original)} aria-label={`Open ledger for ${row.original.invoice}`} title="Ledger"><BookOpen size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open invoice ${row.original.invoice}`} title="Invoice"><FileText size={16} /></button>{canEdit ? <button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit invoice ${row.original.invoice}`} title="Edit invoice"><Pencil size={16} /></button> : <span className="read-only-label">Read only</span>}</div> })];
}

async function renderInvoicePdf(invoiceNumber: string) {
  const invoiceElement = document.getElementById("printable-invoice");
  if (!invoiceElement) throw new Error("The invoice preview is not ready.");
  invoiceElement.classList.add("pdf-exporting");
  try {
    const canvas = await html2canvas(invoiceElement, { backgroundColor: "#ffffff", scale: 1.5, useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageRatio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imageWidth = canvas.width * imageRatio;
    const imageHeight = canvas.height * imageRatio;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight);
    return { filename: `${invoiceNumber}.pdf`, pdf };
  } finally {
    invoiceElement.classList.remove("pdf-exporting");
  }
}

function pdfToBase64(pdf) {
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

// TITLE: INVOICE DETAIL MODAL
function InvoiceDetail({ invoice, onClose, onPaid, onEmail, onWhatsApp, sending, canPay: canPayProp = undefined }) {
  const { showToast } = useToast();
  const canPay = canPayProp ?? useHasPermission("payments.write");
  const [isExporting, setIsExporting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const downloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { filename, pdf } = await renderInvoicePdf(invoice.invoice);
      pdf.save(filename);
      showToast({ variant: "success", title: "Invoice downloaded", message: `${invoice.invoice}.pdf is ready.` });
    } catch (error) {
      console.error("Invoice PDF export failed:", error);
      showToast({ variant: "error", title: "Download failed", message: "The invoice could not be exported. Please try again." });
      window.print();
    } finally {
      setIsExporting(false);
    }
  };
  return <div className="dialog-content invoice-detail-only"><div className="invoice-preview-frame"><DynamicInvoiceTemplate invoice={invoiceFromRecord(invoice)} /></div><div className="dialog-actions invoice-preview-actions"><Button disabled={isExporting} onClick={downloadPdf}>{isExporting ? "Preparing PDF..." : "Download PDF"}</Button><Button disabled={sending || isExporting} onClick={() => setSendOpen(true)}><Send size={15} /> {sending ? "Sending..." : "Send Invoice"}</Button>{canPay ? <Button onClick={onPaid}>Record payment</Button> : null}<Button variant="ghost" onClick={onClose}>Close</Button></div><Dialog open={sendOpen} onClose={() => setSendOpen(false)} ariaLabel="Send invoice"><div className="dialog-content invoice-send-dialog"><div className="card-heading"><div><span className="seat-details-label">Invoice delivery</span><h2>Send invoice</h2><p className="muted-copy">Choose how you want to share this invoice.</p></div></div><div className="invoice-send-options"><button type="button" className="invoice-send-option" onClick={() => { setSendOpen(false); onEmail(); }} disabled={sending}><Mail size={18} /><span><strong>Email</strong><small>Send the invoice to the client’s saved email.</small></span></button><button type="button" className="invoice-send-option" onClick={() => { setSendOpen(false); onWhatsApp(); }} disabled={sending}><MessageCircle size={18} /><span><strong>WhatsApp</strong><small>Download the PDF and open a ready-to-send chat.</small></span></button></div><div className="dialog-actions invoice-send-actions"><Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>Cancel</Button></div></div></Dialog></div>;
}

// TITLE: INVOICES PAGE
export default function InvoicesPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("invoices.read");
  const canWrite = useHasPermission("invoices.write");
  const canPay = useHasPermission("payments.write");
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ledgerInvoice, setLedgerInvoice] = useState(null);
  const [editing, setEditingState] = useState(null);
  const [creating, setCreatingState] = useState(false);
  const setEditing = Object.assign((value) => { if (value && !canWrite) return; setEditingState(value); }, { canEdit: canWrite });
  const setCreating = (value) => { if (value === true && !canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot create or edit invoices." }); return; } setCreatingState(value); };
  const [kpiDetail, setKpiDetail] = useState(null);
  const [dateFrom, setDateFrom] = useState(initialInvoiceRange.from);
  const [dateTo, setDateTo] = useState(initialInvoiceRange.to);
  const [paymentFilter, setPaymentFilter] = useState("");
  const [sendingInvoice, setSendingInvoice] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadInvoices = async () => {
      if (!canView) {
        if (mounted) {
          setInvoices([]);
          setMembers([]);
        }
        return;
      }
      const workspaceRecords = syncWorkspaceBilling(getWorkspaceRecords()).workspaces;
      const saved = getDemoValue("invoices");
      const savedMembers = getDemoValue("members");
      const memberList = Array.isArray(savedMembers) ? savedMembers : [];
      if (mounted) setMembers(memberList.filter((member) => ["active", "activated"].includes(String(member.status || "Active").trim().toLowerCase())));
      try {
        const remoteInvoices = await fetchSupabaseInvoices();
        if (mounted) {
          if (remoteInvoices.length) {
            // Supabase invoices already carry their member/workspace identity and
            // have passed the database/RLS read path. Do not run them through the
            // demo-session member/workspace filter, which can be empty or stale
            // for authenticated production users.
            saveDemoValue("invoices", remoteInvoices, { notify: false });
            setInvoices(remoteInvoices);
          } else {
            const fallbackInvoices = Array.isArray(saved) ? saved : [];
            setInvoices(getActiveMemberInvoices(fallbackInvoices, memberList, workspaceRecords));
          }
        }
      } catch (error) {
        if (mounted) {
          setInvoices(getActiveMemberInvoices(saved, memberList, workspaceRecords));
          showToast({ variant: "error", title: "Invoices could not be loaded", message: error?.message || "Supabase did not return invoice records." });
        }
      }
    };
    void loadInvoices();
    return () => { mounted = false; };
  }, [canView, showToast]);

  // TITLE: INVOICE ACTIONS
  const persist = (nextInvoices) => { setInvoices(nextInvoices); saveDemoValue("invoices", nextInvoices); };
  const markPaid = async () => { if (!canPay) { showToast({ variant: "error", title: "Payment access required", message: "Your account cannot record invoice payments." }); return; } if (!selected) { showToast({ variant: "error", title: "Payment was not recorded", message: "Select an invoice and try again." }); return; } if (!selected.id) { showToast({ variant: "error", title: "Payment was not recorded", message: "This invoice is not synchronized with Supabase yet." }); return; } try { await recordSupabaseInvoicePayment(selected.id, invoiceBalanceDue(selected), "other"); const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, paymentStatus: "Paid" } : invoice); persist(next); setSelected(null); showToast({ variant: "success", title: "Payment recorded", message: `${selected.invoice} is now marked as paid.` }); } catch (error) { showToast({ variant: "error", title: "Payment was not recorded", message: error?.message || "Supabase could not record this payment." }); } };
const sendInvoice = async () => { if (!selected || sendingInvoice) return; setSendingInvoice(true); let invoiceId = selected.id || ""; try { if (!invoiceId) { const syncedInvoice = (await fetchSupabaseInvoices()).find((invoice) => invoice.invoice === selected.invoice); if (!syncedInvoice?.id) { showToast({ variant: "error", title: "Invoice was not sent", message: "This invoice is not synchronized with Supabase yet." }); return; } invoiceId = syncedInvoice.id; setSelected(syncedInvoice); } const { filename, pdf } = await renderInvoicePdf(selected.invoice); const pdfBase64 = pdfToBase64(pdf); const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession(); const token = sessionData.session?.access_token; if (!token) throw new Error("Your session has expired. Sign in again before sending an invoice."); const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/send`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ attachment: { filename, content: pdfBase64 } }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "The invoice email could not be delivered."); const nextStatus = result.delivery?.status === "sent" ? "Sent" : "Failed"; const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, id: invoice.id || invoiceId, emailStatus: nextStatus } : invoice); persist(next); setSelected((current) => current ? { ...current, id: current.id || invoiceId, emailStatus: nextStatus } : current); showToast({ variant: "success", title: "Invoice sent", message: `${selected.invoice} was delivered to ${result.delivery?.recipientEmail || "the client"} with a PDF attachment.` }); } catch (error) { const message = error?.message || "The invoice email could not be delivered."; const canQueueFallback = Boolean(invoiceId) && /not configured|activity_log|schema cache|sales_tax/i.test(message); if (canQueueFallback) { try { const queued = await queueSupabaseInvoiceEmail(invoiceId); const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, id: invoice.id || invoiceId, emailStatus: "Queued" } : invoice); persist(next); setSelected((current) => current ? { ...current, id: current.id || invoiceId, emailStatus: "Queued" } : current); showToast({ variant: "success", title: "Invoice queued", message: `${selected.invoice} is queued for delivery to ${queued.recipient_email || "the client"}.` }); return; } catch (queueError) { showToast({ variant: "error", title: "Invoice was not sent", message: queueError?.message || message }); return; } } showToast({ variant: "error", title: "Invoice was not sent", message }); } finally { setSendingInvoice(false); } };
const sendInvoiceWhatsApp = async () => { if (!selected || sendingInvoice) return; const member = members.find((item) => item.id === selected.memberId); const recipientPhone = whatsappPhone(member?.phone); if (!recipientPhone) { showToast({ variant: "error", title: "WhatsApp was not opened", message: "This client does not have a phone number saved." }); return; } setSendingInvoice(true); try { const { filename, pdf } = await renderInvoicePdf(selected.invoice); pdf.save(filename); const message = `Hello ${selected.account}, please find invoice ${selected.invoice} from The Cubicle attached.`; window.open(`https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); showToast({ variant: "success", title: "WhatsApp opened", message: `${filename} was downloaded. Attach it to the chat before sending.` }); } catch (error) { console.error("Invoice WhatsApp export failed:", error); showToast({ variant: "error", title: "WhatsApp was not opened", message: "The invoice PDF could not be prepared. Please try again." }); } finally { setSendingInvoice(false); } };

const addInvoice = async (form) => { if (!form?.account?.trim() || !form?.issueDate || !form.memberId) { showToast({ variant: "error", title: "Invoice was not created", message: "Choose a valid member and invoice date before saving." }); return; } const issueDate = form.issueDate || "2026-10-05"; const nextInvoice = { invoice: nextInvoiceNumber(invoices), memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.unitPrice || form.subtotal, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxRate || "0", taxAmount: form.taxAmount || "0", whtEnabled: Boolean(form.whtEnabled), whtRate: form.whtRate || "0", whtAmount: form.whtAmount || "0", salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxRate || "0", salesTaxAmount: form.salesTaxAmount || "0", taxLabel: "WHT TAX", billingStartDate: form.billingStartDate, dueDay: Number(form.dueDay) || 5, issueDate, dueDate: form.dueDate || getInvoiceDueDate(issueDate, form.dueDay, form.billingStartDate), manualDateOverride: true, paymentStatus: "Due soon", emailStatus: "Not sent" }; try { const savedInvoice = await createSupabaseInvoice(nextInvoice); persist([savedInvoice, ...invoices]); setCreating(false); setSelected(savedInvoice); showToast({ variant: "success", title: "Invoice created", message: `${savedInvoice.invoice} is saved and ready for delivery.` }); } catch (error) { const duplicateNumber = error?.code === "23505" && String(error?.message || "").includes("invoices_invoice_number_key"); showToast({ variant: "error", title: "Invoice was not created", message: duplicateNumber ? "That invoice number already exists. Refresh the invoice register and try again." : error?.message || "Supabase could not save this invoice." }); } };
  const updateInvoice = (form) => { if (!editing || !form.memberId) { showToast({ variant: "error", title: "Invoice was not updated", message: "Choose a valid member before saving." }); return; } const nextInvoice = { ...editing, memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.unitPrice || form.subtotal, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxRate || "0", taxAmount: form.taxAmount || "0", whtEnabled: Boolean(form.whtEnabled), whtRate: form.whtRate || "0", whtAmount: form.whtAmount || "0", salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxRate || "0", salesTaxAmount: form.salesTaxAmount || "0", taxLabel: "WHT TAX", billingStartDate: form.billingStartDate, dueDay: Number(form.dueDay) || 5, issueDate: form.issueDate || editing.issueDate, dueDate: form.dueDate || editing.dueDate, manualDateOverride: true }; persist(invoices.map((invoice) => invoice.invoice === editing.invoice ? nextInvoice : invoice)); setEditing(null); setSelected(nextInvoice); showToast({ variant: "success", title: "Invoice updated", message: `${nextInvoice.invoice} was saved successfully.` }); };
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => { const issueDate = String(invoice.issueDate || "").slice(0, 10); const normalizedStatus = displayPaymentStatus(invoice.paymentStatus) === "Paid" ? "Paid" : displayPaymentStatus(invoice.paymentStatus) === "Overdue" ? "Overdue" : displayPaymentStatus(invoice.paymentStatus) === "Grace period" ? "Grace period" : "Pending"; return (!dateFrom || issueDate >= dateFrom) && (!dateTo || issueDate <= dateTo) && (!paymentFilter || normalizedStatus === paymentFilter); }), [invoices, dateFrom, dateTo, paymentFilter]);
  const exportInvoices = () => { const csv = ["Invoice,Account,Period,Amount,Status", ...filteredInvoices.map((invoice) => [invoice.invoice, invoice.account, invoice.period, invoice.amount, displayPaymentStatus(invoice.paymentStatus)].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "cubicle-invoices-demo.csv"; link.click(); URL.revokeObjectURL(link.href); showToast({ variant: "success", title: "Invoices exported", message: "Your filtered invoice CSV is ready." }); };
  const openInvoices = useMemo(() => filteredInvoices.filter(hasOpenBalance), [filteredInvoices]);
  const overdue = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Overdue").length, [openInvoices]);
  const paid = useMemo(() => filteredInvoices.filter((invoice) => invoice.paymentStatus === "Paid").length, [filteredInvoices]);
  const dueSoon = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Due soon").length, [openInvoices]);
  const totalInvoiced = useMemo(() => filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0), [filteredInvoices]);
  const sortedInvoices = useMemo(() => [...filteredInvoices].sort((a, b) => invoiceSequence(b.invoice) - invoiceSequence(a.invoice)), [filteredInvoices]);
  const kpiDetails = kpiDetail === "total" ? filteredInvoices : filteredInvoices.filter((invoice) => displayPaymentStatus(invoice.paymentStatus) === kpiDetail);

  if (!canView) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">Invoice records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Invoices — View access.</div></motion.div></PageShell>;

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">A clear register for valid member invoices, dates and collection status.</p></div><div className="header-actions invoice-register-filters"><label className="invoice-filter">From <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="invoice-filter">To <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label className="invoice-filter">Status <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="">All statuses</option><option value="Paid">Paid</option><option value="Pending">Pending</option><option value="Grace period">Grace period</option><option value="Overdue">Overdue</option></select></label><Button variant="ghost" onClick={exportInvoices}><Download size={16} /> Export</Button><Button onClick={() => setCreating(true)}><CirclePlus size={16} /> Create invoice</Button></div></div><section className="stat-grid finance-stat-grid module-stats"><KpiCard onClick={() => setKpiDetail("total")} icon={<Receipt size={18} />} label="Total invoiced" value={formatInvoiceAmount(filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0))} detail={`${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? "" : "s"}`} /><KpiCard onClick={() => setKpiDetail("Paid")} icon={<FileCheck2 size={18} />} label="Paid invoices" value={filteredInvoices.filter((invoice) => invoice.paymentStatus === "Paid").length} detail="Recorded payments" /><KpiCard onClick={() => setKpiDetail("Due soon")} icon={<Receipt size={18} />} label="Due soon" value={dueSoon} detail="Within 5 days" /><KpiCard onClick={() => setKpiDetail("Overdue")} icon={<Receipt size={18} />} label="Overdue invoices" value={overdue} detail="Needs attention" /></section><div className="section-heading invoice-register-heading"><div><h2>Invoice register</h2><p className="muted-copy">Showing only valid member invoices that match the selected filters.</p></div><div className="invoice-status-legend"><span><i className="legend-dot available" />Paid</span><span><i className="legend-dot due" />Pending</span><span><i className="legend-dot overdue" />Overdue</span></div></div><DataTable columns={createInvoiceColumns(setSelected, setLedgerInvoice, setEditing)} data={sortedInvoices} onRowClick={setSelected} /><Dialog open={creating} onClose={() => setCreating(false)} ariaLabel="Create invoice"><InvoiceForm members={members} onCancel={() => setCreating(false)} onSave={addInvoice} /></Dialog><Dialog open={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Edit invoice">{editing ? <InvoiceForm members={members} initialInvoice={editing} onCancel={() => setEditing(null)} onSave={updateInvoice} /> : null}</Dialog><Dialog open={Boolean(ledgerInvoice)} onClose={() => setLedgerInvoice(null)} ariaLabel="Invoice ledger">{ledgerInvoice ? <div className="dialog-content invoice-ledger-dialog"><div className="card-heading"><div><span className="seat-details-label">Payment ledger</span><h2>{ledgerInvoice.invoice}</h2><p className="muted-copy">{ledgerInvoice.account}</p></div></div><div className="ledger-summary"><div><span>Amount</span><strong>{ledgerInvoice.amount}</strong></div><div><span>Status</span><strong>{displayPaymentStatus(ledgerInvoice.paymentStatus)}</strong></div><div><span>Issue date</span><strong>{format(new Date(ledgerInvoice.issueDate), "MMM d, yyyy")}</strong></div><div><span>Due</span><strong>{format(new Date(ledgerInvoice.dueDate), "MMM d, yyyy")}</strong></div></div><div className="dialog-actions"><Button variant="ghost" onClick={() => setLedgerInvoice(null)}>Close</Button><Button onClick={() => { setSelected(ledgerInvoice); setLedgerInvoice(null); }}>Open invoice</Button></div></div> : null}</Dialog><Dialog open={Boolean(kpiDetail)} onClose={() => setKpiDetail(null)} ariaLabel="Invoice KPI details">{kpiDetail ? <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">Invoice details</span><h2>{kpiDetail === "total" ? "All invoices" : `${kpiDetail} invoices`}</h2></div></div><div className="ledger-summary"><div><span>Records</span><strong>{kpiDetails.length}</strong></div><div><span>Total</span><strong>{formatInvoiceAmount(kpiDetails.reduce((sum, invoice) => sum + invoiceAmount(invoice.amount), 0))}</strong></div></div><div className="table-card"><div className="table-scroll"><table className="data-table"><tbody>{kpiDetails.slice(0, 12).map((invoice) => <tr key={invoice.invoice}><td>{invoice.invoice}</td><td>{invoice.account}</td><td>{invoice.amount}</td><td>{displayPaymentStatus(invoice.paymentStatus)}</td></tr>)}</tbody></table></div></div></div> : null}</Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Invoice details">{selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onPaid={markPaid} onEmail={sendInvoice} onWhatsApp={sendInvoiceWhatsApp} sending={sendingInvoice} /> : null}</Dialog></motion.div></PageShell>;
}
