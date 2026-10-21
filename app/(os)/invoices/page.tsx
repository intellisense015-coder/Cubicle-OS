"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { motion } from "motion/react";
import { BookOpen, CalendarDays, ChevronDown, CirclePlus, Download, FileCheck2, FileText, Pencil, Receipt } from "lucide-react";
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
import { z } from "zod";

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
const currentMonthRange = () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return { from: key(start), to: key(end) }; };
const initialInvoiceRange = currentMonthRange();

const invoiceSchema = z.object({
  account: z.string().trim().min(1, "Choose who this invoice is billed to."),
  amount: z.string().trim().min(1, "Enter an invoice amount."),
  billingStartDate: z.string().min(1, "Choose a billing start date."),
  joiningDate: z.string().optional(),
  dueDay: z.string().regex(/^\d+$/, "Enter a whole-number due day.").refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."),
  issueDate: z.string().min(1, "Choose an invoice date."),
  dueDate: z.string().min(1, "Choose a due date."),
  itemDescription: z.string().trim().min(1, "Enter an item description.")
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
  const formApi = useForm({ resolver: zodResolver(invoiceSchema), defaultValues: { account: initialInvoice?.account || "", amount: String(chargesTotal(initialCharges)), billingStartDate: initialBillingStartDate, joiningDate: initialInvoice?.joiningDate || initialMember?.joined || "", dueDay: initialDueDay, issueDate: initialIssueDate, dueDate: initialDueDate, itemDescription: initialCharges[0]?.description || "Workspace services" }, mode: "onBlur" });
  const { handleSubmit, register, setValue, setError, watch, formState } = formApi;
  const [charges, setCharges] = useState(initialCharges);
  const updateCharges = (nextCharges) => { setCharges(nextCharges); setValue("amount", String(chargesTotal(nextCharges)), { shouldDirty: true }); setValue("itemDescription", nextCharges[0]?.description || "", { shouldDirty: true }); };
  const selectMember = (member) => { const description = member.workspaceService || member.service || (member.space && member.space !== "Unassigned" ? `${member.space} workspace service` : "Workspace services"); const nextCharges = [{ description, amount: String(chargeAmount(member.rent)) }]; const billingStartDate = member.billingStartDate || member.joined || watch("issueDate"); const dueDay = String(member.dueDay || 5); setValue("account", `${member.member} - ${member.company || "No company"}`, { shouldDirty: true }); setValue("billingStartDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("joiningDate", member.joined || "", { shouldDirty: true }); setValue("issueDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDay", dueDay, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(billingStartDate, dueDay, billingStartDate), { shouldDirty: true, shouldValidate: true }); updateCharges(nextCharges); };
  const handleIssueDateChange = (event) => { const issueDate = event.target.value; setValue("issueDate", issueDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(issueDate, watch("dueDay"), watch("billingStartDate")), { shouldDirty: true, shouldValidate: true }); };
  const handleDueDayChange = (event) => { const dueDay = event.target.value.replace(/\D/g, ""); setValue("dueDay", dueDay, { shouldDirty: true, shouldValidate: true }); if (dueDay) setValue("dueDate", getInvoiceDueDate(watch("issueDate"), dueDay, watch("billingStartDate")), { shouldDirty: true, shouldValidate: true }); };
  const save = (form) => { if (charges.some((charge) => !charge.description.trim())) { setError("itemDescription", { type: "manual", message: "Add a description for each charge." }); return; } const periodDate = new Date(`${form.issueDate}T12:00:00`); const member = members.find((item) => `${item.member} - ${item.company || "No company"}` === form.account); const total = chargesTotal(charges); const normalizedCharges = charges.map((charge) => ({ description: charge.description.trim(), amount: String(chargeAmount(charge.amount)) })); onSave({ ...form, memberId: member?.id || initialInvoice?.memberId, period: format(periodDate, "MMMM yyyy"), amount: String(total), subtotal: String(total), itemDescription: normalizedCharges[0].description, charges: normalizedCharges, items: normalizedCharges.map((charge) => ({ description: charge.description, price: charge.amount, quantity: 1 })), unitPrice: String(total), qty: "1" }); };
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">{initialInvoice ? "Edit invoice" : "New invoice"}</span><h2>{initialInvoice ? "Edit invoice" : "Create invoice"}</h2></div></div><form className="inline-form-grid invoice-form-grid" onSubmit={handleSubmit(save)}><InvoiceMemberSelect members={members} value={members.find((member) => `${member.member} - ${member.company || "No company"}` === watch("account"))?.id || ""} onChange={selectMember} /><label className="settings-label">Billing start date<Input className={error("billingStartDate") ? "has-error" : ""} type="date" {...register("billingStartDate")} />{error("billingStartDate") && <span className="lead-form-error">{error("billingStartDate")}</span>}</label><label className="settings-label">Joining date<Input type="date" {...register("joiningDate")} />{error("joiningDate") && <span className="lead-form-error">{error("joiningDate")}</span>}</label><label className="settings-label">Issue date<Input className={error("issueDate") ? "has-error" : ""} type="date" value={watch("issueDate")} onChange={handleIssueDateChange} />{error("issueDate") && <span className="lead-form-error">{error("issueDate")}</span>}</label><label className="settings-label">Due day<Input className={error("dueDay") ? "has-error" : ""} type="number" min="1" max="31" inputMode="numeric" value={watch("dueDay")} onChange={handleDueDayChange} />{error("dueDay") && <span className="lead-form-error">{error("dueDay")}</span>}</label><label className="settings-label">Due date<Input className={error("dueDate") ? "has-error" : ""} type="date" {...register("dueDate")} />{error("dueDate") && <span className="lead-form-error">{error("dueDate")}</span>}</label><input type="hidden" {...register("itemDescription")} /><input type="hidden" {...register("amount")} /><ChargeEditor charges={charges} onChange={updateCharges} />{error("itemDescription") && <span className="lead-form-error charge-editor-error">{error("itemDescription")}</span>}{error("amount") && <span className="lead-form-error charge-editor-error">{error("amount")}</span>}<div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Receipt size={15} /> {initialInvoice ? "Save changes" : "Create invoice"}</Button></div></form></div>;
}

// TITLE: INVOICE TABLE
function createInvoiceColumns(onOpen, onLedger, onEdit) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("invoice", { header: "Invoice / account", cell: ({ row }) => <div className="table-primary invoice-primary"><strong>{row.original.invoice}</strong><span>{row.original.account}</span></div> }), columnHelper.accessor("period", { header: "Billing period", cell: ({ getValue }) => <span className="invoice-period"><CalendarDays size={13} /> {getValue()}</span> }), columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }), columnHelper.accessor("dueDate", { header: "Due", cell: ({ getValue }) => <span className="invoice-due">{format(new Date(getValue()), "MMM d, yyyy")}</span> }), columnHelper.accessor("paymentStatus", { header: "Status", cell: ({ getValue }) => { const value = getValue(); return <StatusBadge tone={value === "Paid" ? "success" : value === "Overdue" ? "danger" : "accent"}>{displayPaymentStatus(value)}</StatusBadge>; } }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onLedger(row.original)} aria-label={`Open ledger for ${row.original.invoice}`} title="Ledger"><BookOpen size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open invoice ${row.original.invoice}`} title="Invoice"><FileText size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit invoice ${row.original.invoice}`} title="Edit invoice"><Pencil size={16} /></button></div> })];
}

// TITLE: INVOICE DETAIL MODAL
function InvoiceDetail({ invoice, onClose, onPaid }) {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const downloadPdf = async () => {
    const invoiceElement = document.getElementById("printable-invoice");
    if (!invoiceElement || isExporting) return;
    setIsExporting(true);
    invoiceElement.classList.add("pdf-exporting");
    try {
      const canvas = await html2canvas(invoiceElement, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageRatio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const imageWidth = canvas.width * imageRatio;
      const imageHeight = canvas.height * imageRatio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight);
      pdf.save(`${invoice.invoice}.pdf`);
      showToast({ variant: "success", title: "Invoice downloaded", message: `${invoice.invoice}.pdf is ready.` });
    } catch (error) {
      console.error("Invoice PDF export failed:", error);
      showToast({ variant: "error", title: "Download failed", message: "The invoice could not be exported. Please try again." });
      window.print();
    } finally {
      invoiceElement.classList.remove("pdf-exporting");
      setIsExporting(false);
    }
  };
  return <div className="dialog-content invoice-detail-only"><div className="invoice-preview-frame"><DynamicInvoiceTemplate invoice={invoiceFromRecord(invoice)} /></div><div className="dialog-actions invoice-preview-actions"><Button disabled={isExporting} onClick={downloadPdf}>{isExporting ? "Preparing PDF..." : "Download PDF"}</Button><Button onClick={onPaid}>Record payment</Button><Button variant="ghost" onClick={onClose}>Close</Button></div></div>;
}

// TITLE: INVOICES PAGE
export default function InvoicesPage() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ledgerInvoice, setLedgerInvoice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [kpiDetail, setKpiDetail] = useState(null);
  const [dateFrom, setDateFrom] = useState(initialInvoiceRange.from);
  const [dateTo, setDateTo] = useState(initialInvoiceRange.to);
  const [paymentFilter, setPaymentFilter] = useState("");

  useEffect(() => { const workspaceRecords = syncWorkspaceBilling(getWorkspaceRecords()).workspaces; const saved = getDemoValue("invoices"); const savedMembers = getDemoValue("members"); const memberList = Array.isArray(savedMembers) ? savedMembers : []; setMembers(memberList.filter((member) => ["active", "activated"].includes(String(member.status || "Active").trim().toLowerCase()))); setInvoices(getActiveMemberInvoices(saved, memberList, workspaceRecords)); }, []);

  // TITLE: INVOICE ACTIONS
  const persist = (nextInvoices) => { setInvoices(nextInvoices); saveDemoValue("invoices", nextInvoices); };
  const markPaid = () => { if (!selected) { showToast({ variant: "error", title: "Payment was not recorded", message: "Select an invoice and try again." }); return; } const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, paymentStatus: "Paid" } : invoice); persist(next); setSelected(null); showToast({ variant: "success", title: "Payment recorded", message: `${selected.invoice} is now marked as paid.` }); };
  const addInvoice = (form) => { if (!form?.account?.trim() || !form?.issueDate || !form.memberId) { showToast({ variant: "error", title: "Invoice was not created", message: "Choose a valid member and invoice date before saving." }); return; } const issueDate = form.issueDate || "2026-10-05"; const nextInvoice = { invoice: `INV-2026-${1030 + invoices.length}`, memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.amount, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, billingStartDate: form.billingStartDate, joiningDate: form.joiningDate, dueDay: Number(form.dueDay) || 5, issueDate, dueDate: form.dueDate || getInvoiceDueDate(issueDate, form.dueDay, form.billingStartDate), manualDateOverride: true, paymentStatus: "Due soon", emailStatus: "Not sent" }; persist([nextInvoice, ...invoices]); setCreating(false); setSelected(nextInvoice); showToast({ variant: "success", title: "Invoice created", message: `${nextInvoice.invoice} was created successfully.` }); };
  const updateInvoice = (form) => { if (!editing || !form.memberId) { showToast({ variant: "error", title: "Invoice was not updated", message: "Choose a valid member before saving." }); return; } const nextInvoice = { ...editing, memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.amount, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, billingStartDate: form.billingStartDate, joiningDate: form.joiningDate, dueDay: Number(form.dueDay) || 5, issueDate: form.issueDate || editing.issueDate, dueDate: form.dueDate || editing.dueDate, manualDateOverride: true }; persist(invoices.map((invoice) => invoice.invoice === editing.invoice ? nextInvoice : invoice)); setEditing(null); setSelected(nextInvoice); showToast({ variant: "success", title: "Invoice updated", message: `${nextInvoice.invoice} was saved successfully.` }); };
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => { const issueDate = String(invoice.issueDate || "").slice(0, 10); const normalizedStatus = displayPaymentStatus(invoice.paymentStatus) === "Paid" ? "Paid" : displayPaymentStatus(invoice.paymentStatus) === "Overdue" ? "Overdue" : displayPaymentStatus(invoice.paymentStatus) === "Grace period" ? "Grace period" : "Pending"; return (!dateFrom || issueDate >= dateFrom) && (!dateTo || issueDate <= dateTo) && (!paymentFilter || normalizedStatus === paymentFilter); }), [invoices, dateFrom, dateTo, paymentFilter]);
  const exportInvoices = () => { const csv = ["Invoice,Account,Period,Amount,Status", ...filteredInvoices.map((invoice) => [invoice.invoice, invoice.account, invoice.period, invoice.amount, displayPaymentStatus(invoice.paymentStatus)].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "cubicle-invoices-demo.csv"; link.click(); URL.revokeObjectURL(link.href); showToast({ variant: "success", title: "Invoices exported", message: "Your filtered invoice CSV is ready." }); };
  const openInvoices = useMemo(() => filteredInvoices.filter(hasOpenBalance), [filteredInvoices]);
  const overdue = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Overdue").length, [openInvoices]);
  const paid = useMemo(() => filteredInvoices.filter((invoice) => invoice.paymentStatus === "Paid").length, [filteredInvoices]);
  const dueSoon = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Due soon").length, [openInvoices]);
  const totalInvoiced = useMemo(() => filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0), [filteredInvoices]);
  const sortedInvoices = useMemo(() => [...filteredInvoices].sort((a, b) => invoiceSequence(b.invoice) - invoiceSequence(a.invoice)), [filteredInvoices]);
  const kpiDetails = kpiDetail === "total" ? filteredInvoices : filteredInvoices.filter((invoice) => displayPaymentStatus(invoice.paymentStatus) === kpiDetail);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">A clear register for valid member invoices, dates and collection status.</p></div><div className="header-actions invoice-register-filters"><label className="invoice-filter">From <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="invoice-filter">To <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label className="invoice-filter">Status <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="">All statuses</option><option value="Paid">Paid</option><option value="Pending">Pending</option><option value="Grace period">Grace period</option><option value="Overdue">Overdue</option></select></label><Button variant="ghost" onClick={exportInvoices}><Download size={16} /> Export</Button><Button onClick={() => setCreating(true)}><CirclePlus size={16} /> Create invoice</Button></div></div><section className="stat-grid finance-stat-grid module-stats"><KpiCard onClick={() => setKpiDetail("total")} icon={<Receipt size={18} />} label="Total invoiced" value={formatInvoiceAmount(filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0))} detail={`${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? "" : "s"}`} /><KpiCard onClick={() => setKpiDetail("Paid")} icon={<FileCheck2 size={18} />} label="Paid invoices" value={filteredInvoices.filter((invoice) => invoice.paymentStatus === "Paid").length} detail="Recorded payments" /><KpiCard onClick={() => setKpiDetail("Due soon")} icon={<Receipt size={18} />} label="Due soon" value={dueSoon} detail="Within 5 days" /><KpiCard onClick={() => setKpiDetail("Overdue")} icon={<Receipt size={18} />} label="Overdue invoices" value={overdue} detail="Needs attention" /></section><div className="section-heading invoice-register-heading"><div><h2>Invoice register</h2><p className="muted-copy">Showing only valid member invoices that match the selected filters.</p></div><div className="invoice-status-legend"><span><i className="legend-dot available" />Paid</span><span><i className="legend-dot due" />Pending</span><span><i className="legend-dot overdue" />Overdue</span></div></div><DataTable columns={createInvoiceColumns(setSelected, setLedgerInvoice, setEditing)} data={sortedInvoices} onRowClick={setSelected} /><Dialog open={creating} onClose={() => setCreating(false)} ariaLabel="Create invoice"><InvoiceForm members={members} onCancel={() => setCreating(false)} onSave={addInvoice} /></Dialog><Dialog open={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Edit invoice">{editing ? <InvoiceForm members={members} initialInvoice={editing} onCancel={() => setEditing(null)} onSave={updateInvoice} /> : null}</Dialog><Dialog open={Boolean(ledgerInvoice)} onClose={() => setLedgerInvoice(null)} ariaLabel="Invoice ledger">{ledgerInvoice ? <div className="dialog-content invoice-ledger-dialog"><div className="card-heading"><div><span className="seat-details-label">Payment ledger</span><h2>{ledgerInvoice.invoice}</h2><p className="muted-copy">{ledgerInvoice.account}</p></div></div><div className="ledger-summary"><div><span>Amount</span><strong>{ledgerInvoice.amount}</strong></div><div><span>Status</span><strong>{displayPaymentStatus(ledgerInvoice.paymentStatus)}</strong></div><div><span>Issue date</span><strong>{format(new Date(ledgerInvoice.issueDate), "MMM d, yyyy")}</strong></div><div><span>Due</span><strong>{format(new Date(ledgerInvoice.dueDate), "MMM d, yyyy")}</strong></div></div><div className="dialog-actions"><Button variant="ghost" onClick={() => setLedgerInvoice(null)}>Close</Button><Button onClick={() => { setSelected(ledgerInvoice); setLedgerInvoice(null); }}>Open invoice</Button></div></div> : null}</Dialog><Dialog open={Boolean(kpiDetail)} onClose={() => setKpiDetail(null)} ariaLabel="Invoice KPI details">{kpiDetail ? <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">Invoice details</span><h2>{kpiDetail === "total" ? "All invoices" : `${kpiDetail} invoices`}</h2></div></div><div className="ledger-summary"><div><span>Records</span><strong>{kpiDetails.length}</strong></div><div><span>Total</span><strong>{formatInvoiceAmount(kpiDetails.reduce((sum, invoice) => sum + invoiceAmount(invoice.amount), 0))}</strong></div></div><div className="table-card"><div className="table-scroll"><table className="data-table"><tbody>{kpiDetails.slice(0, 12).map((invoice) => <tr key={invoice.invoice}><td>{invoice.invoice}</td><td>{invoice.account}</td><td>{invoice.amount}</td><td>{displayPaymentStatus(invoice.paymentStatus)}</td></tr>)}</tbody></table></div></div></div> : null}</Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Invoice details">{selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onPaid={markPaid} /> : null}</Dialog></motion.div></PageShell>;
}
