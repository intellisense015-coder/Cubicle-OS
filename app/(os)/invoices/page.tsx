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
import DynamicInvoiceTemplate, { invoiceFromRecord } from "@/components/invoices/invoice-template";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";

const invoiceAmount = (value) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const invoiceBalanceDue = (invoice) => {
  const status = String(invoice?.paymentStatus || "").toLowerCase();
  if (["paid", "cancelled", "canceled", "draft"].includes(status)) return 0;
  if (invoice?.balanceDue !== undefined) return Math.max(0, invoiceAmount(invoice.balanceDue));
  return Math.max(0, invoiceAmount(invoice?.amount) - invoiceAmount(invoice?.paidAmount ?? invoice?.amountPaid));
};
const hasOpenBalance = (invoice) => invoiceBalanceDue(invoice) > 0 && !["cancelled", "canceled", "draft"].includes(String(invoice?.status || "").toLowerCase());
const formatInvoiceAmount = (value) => `PKR ${value.toLocaleString("en-PK")}`;
const displayPaymentStatus = (status) => status === "Grace" ? "Overdue" : status;
const invoiceSequence = (invoice) => Number(String(invoice || "").match(/(\d+)$/)?.[1] || 0);

const invoiceSchema = z.object({
  account: z.string().trim().min(1, "Choose who this invoice is billed to."),
  amount: z.string().trim().min(1, "Enter an invoice amount."),
  issueDate: z.string().min(1, "Choose an invoice date."),
  dueDate: z.string().min(1, "Choose a due date."),
  itemDescription: z.string().trim().min(1, "Enter an item description.")
});

// TITLE: INVOICE FORM
function InvoiceMemberSelect({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = members.find((member) => member.id === value);
  return <div className="settings-label lead-source-field member-lead-select"><span>Billed to</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? `${selected.member} - ${selected.company || "No company"}` : "Select a member"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{members.length ? members.map((member) => <button type="button" key={member.id} className={value === member.id ? "is-selected" : ""} onClick={() => { onChange(member); setOpen(false); }}>{member.member} - {member.company || "No company"}</button>) : <span className="dropdown-empty">No members added yet</span>}</div>}</div></div>;
}

function InvoiceForm({ members, onCancel, onSave, initialInvoice = null }) {
  const initialMember = members.find((member) => `${member.member} - ${member.company || "No company"}` === initialInvoice?.account);
  const formApi = useForm({ resolver: zodResolver(invoiceSchema), defaultValues: { account: initialInvoice?.account || "", amount: initialInvoice?.amount || "PKR 0", issueDate: initialInvoice?.issueDate || "2026-10-05", dueDate: initialInvoice?.dueDate || "2026-10-05", itemDescription: initialInvoice?.itemDescription || "Workspace services" }, mode: "onBlur" });
  const { handleSubmit, register, setValue, watch, formState } = formApi;
  const selectMember = (member) => { setValue("account", `${member.member} - ${member.company || "No company"}`, { shouldDirty: true }); setValue("amount", member.rent || "PKR 0", { shouldDirty: true }); setValue("itemDescription", member.workspaceService || member.service || (member.space && member.space !== "Unassigned" ? `${member.space} workspace service` : "Workspace services"), { shouldDirty: true }); };
  const save = (form) => { const periodDate = new Date(`${form.issueDate}T12:00:00`); onSave({ ...form, period: format(periodDate, "MMMM yyyy"), unitPrice: form.amount, qty: "1" }); };
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">{initialInvoice ? "Edit invoice" : "New invoice"}</span><h2>{initialInvoice ? "Edit invoice" : "Create invoice"}</h2></div></div><form className="inline-form-grid invoice-form-grid" onSubmit={handleSubmit(save)}><InvoiceMemberSelect members={members} value={members.find((member) => `${member.member} - ${member.company || "No company"}` === watch("account"))?.id || ""} onChange={selectMember} /><label className="settings-label">Issue date<Input className={error("issueDate") ? "has-error" : ""} type="date" {...register("issueDate")} />{error("issueDate") && <span className="lead-form-error">{error("issueDate")}</span>}</label><label className="settings-label">Due date<Input className={error("dueDate") ? "has-error" : ""} type="date" {...register("dueDate")} />{error("dueDate") && <span className="lead-form-error">{error("dueDate")}</span>}</label><label className="settings-label">Item description<Input className={error("itemDescription") ? "has-error" : ""} {...register("itemDescription")} placeholder="Workspace services" />{error("itemDescription") && <span className="lead-form-error">{error("itemDescription")}</span>}</label><label className="settings-label">Total<Input className={error("amount") ? "has-error" : ""} {...register("amount")} placeholder="PKR 48,000" />{error("amount") && <span className="lead-form-error">{error("amount")}</span>}</label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Receipt size={15} /> {initialInvoice ? "Save changes" : "Create invoice"}</Button></div></form></div>;
}

// TITLE: INVOICE TABLE
function createInvoiceColumns(onOpen, onLedger, onEdit) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("invoice", { header: "Invoice / account", cell: ({ row }) => <div className="table-primary invoice-primary"><strong>{row.original.invoice}</strong><span>{row.original.account}</span></div> }), columnHelper.accessor("period", { header: "Billing period", cell: ({ getValue }) => <span className="invoice-period"><CalendarDays size={13} /> {getValue()}</span> }), columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }), columnHelper.accessor("dueDate", { header: "Due", cell: ({ getValue }) => <span className="invoice-due">{format(new Date(getValue()), "MMM d, yyyy")}</span> }), columnHelper.accessor("paymentStatus", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Paid" ? "success" : getValue() === "Overdue" ? "danger" : "accent"}>{getValue()}</StatusBadge> }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onLedger(row.original)} aria-label={`Open ledger for ${row.original.invoice}`} title="Ledger"><BookOpen size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open invoice ${row.original.invoice}`} title="Invoice"><FileText size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit invoice ${row.original.invoice}`} title="Edit invoice"><Pencil size={16} /></button></div> })];
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
  const [monthFilter, setMonthFilter] = useState("");

  useEffect(() => { getWorkspaceRecords(); const saved = getDemoValue("invoices"); const savedMembers = getDemoValue("members"); if (Array.isArray(saved)) setInvoices(saved); if (Array.isArray(savedMembers)) setMembers(savedMembers); }, []);

  // TITLE: INVOICE ACTIONS
  const persist = (nextInvoices) => { setInvoices(nextInvoices); saveDemoValue("invoices", nextInvoices); };
  const markPaid = () => { if (!selected) { showToast({ variant: "error", title: "Payment was not recorded", message: "Select an invoice and try again." }); return; } const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, paymentStatus: "Paid" } : invoice); persist(next); setSelected(null); showToast({ variant: "success", title: "Payment recorded", message: `${selected.invoice} is now marked as paid.` }); };
  const addInvoice = (form) => { if (!form?.account?.trim() || !form?.issueDate) { showToast({ variant: "error", title: "Invoice was not created", message: "Choose a member and invoice date before saving." }); return; } const issueDate = form.issueDate || "2026-10-05"; const nextInvoice = { invoice: `INV-2026-${1030 + invoices.length}`, account: form.account, period: form.period, amount: form.amount, unitPrice: form.amount, qty: "1", itemDescription: form.itemDescription, issueDate, dueDate: form.dueDate || `${issueDate.slice(0, 8)}05`, paymentStatus: "Due soon", emailStatus: "Not sent" }; persist([nextInvoice, ...invoices]); setCreating(false); setSelected(nextInvoice); showToast({ variant: "success", title: "Invoice created", message: `${nextInvoice.invoice} was created successfully.` }); };
  const updateInvoice = (form) => { if (!editing) { showToast({ variant: "error", title: "Invoice was not updated", message: "Select an invoice and try again." }); return; } const nextInvoice = { ...editing, account: form.account, period: form.period, amount: form.amount, unitPrice: form.amount, qty: "1", itemDescription: form.itemDescription, issueDate: form.issueDate || editing.issueDate, dueDate: form.dueDate || editing.dueDate }; persist(invoices.map((invoice) => invoice.invoice === editing.invoice ? nextInvoice : invoice)); setEditing(null); setSelected(nextInvoice); showToast({ variant: "success", title: "Invoice updated", message: `${nextInvoice.invoice} was saved successfully.` }); };
  const exportInvoices = () => { const csv = ["Invoice,Account,Period,Amount,Status", ...invoices.map((invoice) => [invoice.invoice, invoice.account, invoice.period, invoice.amount, displayPaymentStatus(invoice.paymentStatus)].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "cubicle-invoices-demo.csv"; link.click(); URL.revokeObjectURL(link.href); showToast({ variant: "success", title: "Invoices exported", message: "Your invoice CSV is ready." }); };
  const openInvoices = useMemo(() => invoices.filter(hasOpenBalance), [invoices]);
  const overdue = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Overdue").length, [openInvoices]);
  const paid = useMemo(() => invoices.filter((invoice) => invoice.paymentStatus === "Paid").length, [invoices]);
  const dueSoon = useMemo(() => openInvoices.filter((invoice) => invoice.paymentStatus === "Due soon" || invoice.paymentStatus === "Grace").length, [openInvoices]);
  const totalInvoiced = useMemo(() => invoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0), [invoices]);
  const sortedInvoices = useMemo(() => [...invoices].filter((invoice) => !monthFilter || String(invoice.issueDate || "").startsWith(monthFilter)).sort((a, b) => invoiceSequence(b.invoice) - invoiceSequence(a.invoice)), [invoices, monthFilter]);
  const kpiDetails = kpiDetail === "total" ? invoices : invoices.filter((invoice) => displayPaymentStatus(invoice.paymentStatus) === kpiDetail);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">A clear register for billing periods, amounts and collection status.</p></div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label><Button variant="ghost" onClick={exportInvoices}><Download size={16} /> Export</Button><Button onClick={() => setCreating(true)}><CirclePlus size={16} /> Create invoice</Button></div></div><section className="stat-grid finance-stat-grid module-stats"><KpiCard onClick={() => setKpiDetail("total")} icon={<Receipt size={18} />} label="Total invoiced" value={formatInvoiceAmount(totalInvoiced)} detail={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`} /><KpiCard onClick={() => setKpiDetail("Paid")} icon={<FileCheck2 size={18} />} label="Paid invoices" value={paid} detail="Recorded payments" /><KpiCard onClick={() => setKpiDetail("Due soon")} icon={<Receipt size={18} />} label="Due soon" value={dueSoon} detail="Within 5 days" /><KpiCard onClick={() => setKpiDetail("Overdue")} icon={<Receipt size={18} />} label="Overdue invoices" value={overdue} detail="Needs attention" /></section><div className="section-heading invoice-register-heading"><div><h2>Invoice register</h2><p className="muted-copy">Click a row to review details and record payment.</p></div><div className="invoice-status-legend"><span><i className="legend-dot available" />Paid</span><span><i className="legend-dot due" />Due soon</span><span><i className="legend-dot occupied" />Overdue</span></div></div><DataTable columns={createInvoiceColumns(setSelected, setLedgerInvoice, setEditing)} data={sortedInvoices} onRowClick={setSelected} /><Dialog open={creating} onClose={() => setCreating(false)} ariaLabel="Create invoice"><InvoiceForm members={members} onCancel={() => setCreating(false)} onSave={addInvoice} /></Dialog><Dialog open={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Edit invoice">{editing ? <InvoiceForm members={members} initialInvoice={editing} onCancel={() => setEditing(null)} onSave={updateInvoice} /> : null}</Dialog><Dialog open={Boolean(ledgerInvoice)} onClose={() => setLedgerInvoice(null)} ariaLabel="Invoice ledger">{ledgerInvoice ? <div className="dialog-content invoice-ledger-dialog"><div className="card-heading"><div><span className="seat-details-label">Payment ledger</span><h2>{ledgerInvoice.invoice}</h2><p className="muted-copy">{ledgerInvoice.account}</p></div></div><div className="ledger-summary"><div><span>Amount</span><strong>{ledgerInvoice.amount}</strong></div><div><span>Status</span><strong>{displayPaymentStatus(ledgerInvoice.paymentStatus)}</strong></div><div><span>Issue date</span><strong>{format(new Date(ledgerInvoice.issueDate), "MMM d, yyyy")}</strong></div><div><span>Due</span><strong>{format(new Date(ledgerInvoice.dueDate), "MMM d, yyyy")}</strong></div></div><div className="dialog-actions"><Button variant="ghost" onClick={() => setLedgerInvoice(null)}>Close</Button><Button onClick={() => { setSelected(ledgerInvoice); setLedgerInvoice(null); }}>Open invoice</Button></div></div> : null}</Dialog><Dialog open={Boolean(kpiDetail)} onClose={() => setKpiDetail(null)} ariaLabel="Invoice KPI details">{kpiDetail ? <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">Invoice details</span><h2>{kpiDetail === "total" ? "All invoices" : `${kpiDetail} invoices`}</h2></div></div><div className="ledger-summary"><div><span>Records</span><strong>{kpiDetails.length}</strong></div><div><span>Total</span><strong>{formatInvoiceAmount(kpiDetails.reduce((sum, invoice) => sum + invoiceAmount(invoice.amount), 0))}</strong></div></div><div className="table-card"><div className="table-scroll"><table className="data-table"><tbody>{kpiDetails.slice(0, 12).map((invoice) => <tr key={invoice.invoice}><td>{invoice.invoice}</td><td>{invoice.account}</td><td>{invoice.amount}</td><td>{displayPaymentStatus(invoice.paymentStatus)}</td></tr>)}</tbody></table></div></div></div> : null}</Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Invoice details">{selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onPaid={markPaid} /> : null}</Dialog></motion.div></PageShell>;
}
