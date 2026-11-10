"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { motion } from "motion/react";
import { CalendarClock, CalendarDays, CirclePlus, Download, FileCheck2, Mail, MessageCircle, Receipt, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import DynamicInvoiceTemplate, { invoiceFromRecord } from "@/components/invoices/invoice-template";
import { ChargeEditor, chargeAmount, chargesTotal, getEditableCharges } from "@/components/invoices/charge-editor";
import { useToast } from "@/components/ui/toast-provider";
import { numericField, sanitizeNumericInput } from "@/lib/number-input";
import { z } from "zod";
import { createSupabaseInvoice, fetchSupabaseInvoices, queueSupabaseInvoiceEmail, recordSupabaseInvoicePayment, updateSupabaseInvoice } from "@/lib/supabase/invoices";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";
import { getSupabaseBrowserClient, isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { useHasPermission } from "@/lib/access-control";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchInvoicesSnapshot, type InvoiceQuerySnapshot } from "@/lib/invoice-query";
import { DatePickerField, SelectField, TimePickerField } from "@/components/ui/primitives";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { defaultInvoiceAutomationSettings, fetchInvoiceAutomationSettings, saveInvoiceAutomationSettings, type InvoiceAutomationSettings } from "@/lib/supabase/invoice-automation";

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
const invoiceStatus = (invoice) => {
  const storedStatus = displayPaymentStatus(invoice?.paymentStatus);
  if (["Paid", "Cancelled", "Canceled", "Draft", "Grace period"].includes(storedStatus)) return storedStatus;
  const dueDateValue = String(invoice?.dueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue)) return "Pending";
  const dueDate = new Date(`${dueDateValue}T12:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const daysUntilDue = Math.ceil((dueDay.getTime() - todayStart.getTime()) / 86400000);
  if (daysUntilDue < 0) return "Overdue";
  if (daysUntilDue <= 5) return "Due soon";
  return "Pending";
};
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
  memberId: z.string().trim().min(1, "Choose a member."),
  account: z.string().trim().min(1, "Choose who this invoice is billed to."),
  amount: z.string().optional(),
  netTotal: z.string().trim().regex(/^\d+$/, "Enter a whole-number net total.").refine((value) => Number(value) > 0, "Invoice total must be greater than zero."),
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
function InvoiceMemberSelect({ members, value, onChange, hint }) {
  return <SelectField label="Billed to" value={value} hint={hint} searchable searchPlaceholder="Search members..." onChange={(event) => {
    const member = members.find((item) => String(item.id) === String(event.target.value));
    if (member) onChange(member);
  }}>
    <option value="">{members.length ? "Select a member" : "No members added yet"}</option>
    {members.map((member) => <option key={member.id} value={member.id}>{member.member} - {member.company || "No company"}</option>)}
  </SelectField>;
}

function InvoiceAutomationForm({ settings, members, onCancel, onSave }: { settings: InvoiceAutomationSettings; members: any[]; onCancel: () => void; onSave: (settings: Pick<InvoiceAutomationSettings, "enabled" | "sendDay" | "sendTime" | "memberIds">) => Promise<void> }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [sendDay, setSendDay] = useState(String(settings.sendDay || 1));
  const [sendTime, setSendTime] = useState(settings.sendTime || "09:00");
  const [memberIds, setMemberIds] = useState<string[]>(settings.memberIds || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEnabled(settings.enabled);
    setSendDay(String(settings.sendDay || 1));
    setSendTime(settings.sendTime || "09:00");
    setMemberIds(settings.memberIds || []);
  }, [settings]);

  const save = async (event) => {
    event.preventDefault();
    if (enabled && memberIds.length === 0) {
      setError("Select at least one member to receive automatic invoices.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ enabled, sendDay: Number(sendDay), sendTime, memberIds });
    } catch (saveError) {
      setError(saveError?.message || "The monthly invoice schedule could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="inline-form-card invoice-automation-form"><div className="card-heading"><div><h2>Automatic invoices</h2><p className="muted-copy">Create and email one monthly invoice for the members you select.</p></div></div><form className="inline-form-grid invoice-form-grid" onSubmit={save}>
    <div className="invoice-form-section-heading"><h3>Monthly schedule</h3></div>
    <SelectField label="Send day of month" value={sendDay} onChange={(event) => setSendDay(event.target.value)}><option value="">Select a day</option>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"} of every month</option>)}</SelectField>
    <TimePickerField label="Send time" value={sendTime} onChange={setSendTime} />
    <div className="invoice-automation-recipients"><div className="invoice-form-section-heading"><h3>Invoice recipients</h3></div>{members.length ? <SelectField label="Members" placeholder="Select members" searchable searchPlaceholder="Search members..." multiple selectedValues={memberIds} onMultiChange={setMemberIds}>{members.map((member) => <option key={member.id} value={member.id}>{member.member} · {member.company || "No company"}{member.email ? ` · ${member.email}` : ""}</option>)}</SelectField> : <p className="muted-copy">No active members are available.</p>}</div>
    <label className="invoice-automation-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable automatic monthly sending</span></label>
    {error ? <span className="lead-form-error invoice-automation-error">{error}</span> : null}
    <div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}><CalendarClock size={15} /> Save schedule</Button></div>
  </form></div>;
}

function InvoiceForm({ members, onCancel, onSave, initialInvoice = null }) {
  const initialCharges = getEditableCharges(initialInvoice);
  const initialMember = members.find((member) => member.id === initialInvoice?.memberId || `${member.member} - ${member.company || "No company"}` === initialInvoice?.account);
  const today = new Date().toISOString().slice(0, 10);
  const initialBillingStartDate = initialInvoice?.billingStartDate || initialMember?.billingStartDate || initialMember?.joined || initialInvoice?.issueDate || today;
  const initialIssueDate = initialInvoice?.issueDate || initialBillingStartDate;
  const initialDueDay = String(initialInvoice?.dueDay || initialMember?.dueDay || 5);
  const initialDueDate = initialInvoice?.dueDate && initialInvoice.dueDate >= initialBillingStartDate ? initialInvoice.dueDate : getInvoiceDueDate(initialIssueDate, initialDueDay, initialBillingStartDate);
  const formApi = useForm({ resolver: zodResolver(invoiceSchema), defaultValues: { memberId: initialMember?.id || initialInvoice?.memberId || "", account: initialInvoice?.account || "", amount: String(chargesTotal(initialCharges)), netTotal: String(initialInvoice ? invoiceAmount(initialInvoice.amount) : chargesTotal(initialCharges)), billingStartDate: initialBillingStartDate, dueDay: initialDueDay, issueDate: initialIssueDate, dueDate: initialDueDate, itemDescription: initialCharges[0]?.description || "Workspace services", taxEnabled: Boolean(initialInvoice?.whtEnabled ?? initialInvoice?.taxEnabled), taxRate: String(initialInvoice?.whtRate ?? initialInvoice?.taxRate ?? "10"), salesTaxEnabled: Boolean(initialInvoice?.salesTaxEnabled), salesTaxRate: String(initialInvoice?.salesTaxRate ?? "0") }, mode: "onBlur" });
  const { handleSubmit, register, setValue, setError, watch, formState } = formApi;
  const netTotalEditedRef = useRef(Boolean(initialInvoice));
  const netTotalField = register("netTotal");
  const salesTaxToggle = register("salesTaxEnabled");
  const whtToggle = register("taxEnabled");
  const [charges, setCharges] = useState(initialCharges);
  const updateCharges = (nextCharges) => { setCharges(nextCharges); setValue("amount", String(chargesTotal(nextCharges)), { shouldDirty: true }); setValue("itemDescription", nextCharges[0]?.description || "", { shouldDirty: true }); };
  const selectMember = (member) => { const description = member.workspaceService || member.service || (member.space && member.space !== "Unassigned" ? `${member.space} workspace service` : "Workspace services"); const nextCharges = [{ description, amount: String(chargeAmount(member.rent)) }]; const billingStartDate = member.billingStartDate || member.joined || watch("billingStartDate") || today; const dueDay = String(member.dueDay || 5); setValue("memberId", member.id, { shouldDirty: true, shouldValidate: true }); setValue("account", `${member.member} - ${member.company || "No company"}`, { shouldDirty: true, shouldValidate: true }); setValue("billingStartDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("issueDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDay", dueDay, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(billingStartDate, dueDay, billingStartDate), { shouldDirty: true, shouldValidate: true }); updateCharges(nextCharges); };
  const handleIssueDateChange = (issueDate) => { setValue("issueDate", issueDate, { shouldDirty: true, shouldValidate: true }); setValue("dueDate", getInvoiceDueDate(issueDate, watch("dueDay"), watch("billingStartDate")), { shouldDirty: true, shouldValidate: true }); };
  const handleBillingStartDateChange = (billingStartDate) => { setValue("billingStartDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); setValue("issueDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); if (watch("dueDate") < billingStartDate) setValue("dueDate", billingStartDate, { shouldDirty: true, shouldValidate: true }); };
  const subtotal = chargesTotal(charges);
  const totals = calculateInvoiceTotals({ subtotal, whtEnabled: watch("taxEnabled") && !watch("salesTaxEnabled"), whtRate: watch("taxRate"), salesTaxEnabled: watch("salesTaxEnabled") && !watch("taxEnabled"), salesTaxRate: watch("salesTaxRate") });
  useEffect(() => { if (!netTotalEditedRef.current) setValue("netTotal", String(Math.round(totals.total)), { shouldDirty: false }); }, [setValue, totals.total]);
  useEffect(() => { if (watch("salesTaxEnabled") && watch("taxEnabled")) setValue("taxEnabled", false, { shouldDirty: true, shouldValidate: true }); }, [setValue, watch("salesTaxEnabled"), watch("taxEnabled")]);
  const save = async (form) => { if (charges.some((charge) => !charge.description.trim())) { setError("itemDescription", { type: "manual", message: "Add a description for each charge." }); return; } const finalTotal = Math.round(Number(form.netTotal)); if (finalTotal <= 0) { setError("netTotal", { type: "manual", message: "Invoice total must be greater than zero." }); return; } const periodDate = new Date(`${form.issueDate}T12:00:00`); const normalizedCharges = charges.map((charge) => ({ description: charge.description.trim(), amount: String(parseAmount(charge.amount)) })); await onSave({ ...form, period: format(periodDate, "MMMM yyyy"), amount: String(finalTotal), subtotal: String(totals.subtotal), manualTotalOverride: true, taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxEnabled ? String(totals.whtRate) : "0", taxAmount: String(totals.whtAmount), whtEnabled: Boolean(form.taxEnabled), whtRate: form.taxEnabled ? String(totals.whtRate) : "0", whtAmount: String(totals.whtAmount), salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxEnabled ? String(totals.salesTaxRate) : "0", salesTaxAmount: String(totals.salesTaxAmount), taxLabel: "WHT TAX", itemDescription: normalizedCharges[0].description, charges: normalizedCharges, items: normalizedCharges.map((charge) => ({ description: charge.description, price: charge.amount, quantity: 1 })), unitPrice: String(totals.subtotal), qty: "1" }); };
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content invoice-form"><div className="card-heading"><div><h2>{initialInvoice ? "Edit invoice" : "Create invoice"}</h2><p className="muted-copy">Create and track a member invoice.</p></div></div><form className="inline-form-grid invoice-form-grid" onSubmit={handleSubmit(save)}>
    <div className="invoice-form-section-heading"><h3>Member</h3></div>
    <InvoiceMemberSelect members={members} value={watch("memberId")} hint={error("memberId")} onChange={selectMember} />
    <input type="hidden" {...register("memberId")} /><input type="hidden" {...register("account")} />

    <div className="invoice-form-section-heading"><h3>Invoice dates</h3></div>
    <DatePickerField label="Billing start date" value={watch("billingStartDate")} hint={error("billingStartDate")} onChange={handleBillingStartDateChange} />
    <DatePickerField label="Due date" value={watch("dueDate")} hint={error("dueDate")} onChange={(value) => setValue("dueDate", value, { shouldDirty: true, shouldValidate: true })} />
    <input type="hidden" {...register("dueDay")} />

    <div className="invoice-form-section-heading"><h3>Charges</h3></div>
    <div className="invoice-form-wide"><ChargeEditor charges={charges} onChange={updateCharges} showIntro={false} />{error("itemDescription") && <span className="lead-form-error charge-editor-error">{error("itemDescription")}</span>}{error("amount") && <span className="lead-form-error charge-editor-error">{error("amount")}</span>}</div>
    <input type="hidden" {...register("itemDescription")} /><input type="hidden" {...register("amount")} />

    <div className="invoice-form-section-heading"><h3>Taxes</h3></div>
    <div className="invoice-tax-grid invoice-form-wide">
      <div className="invoice-tax-control"><label className="quotation-tax-toggle invoice-tax-toggle"><input type="checkbox" {...salesTaxToggle} onChange={(event) => { salesTaxToggle.onChange(event); if (event.target.checked) setValue("taxEnabled", false, { shouldDirty: true, shouldValidate: true }); }} /><span>Include Sales Tax</span></label><label className="settings-label">Sales Tax rate (%)<Input className={error("salesTaxRate") ? "has-error" : ""} disabled={!watch("salesTaxEnabled")} {...numericField(register, "salesTaxRate")} placeholder="0" />{error("salesTaxRate") && <span className="lead-form-error">{error("salesTaxRate")}</span>}</label></div>
      <div className="invoice-tax-control"><label className="quotation-tax-toggle invoice-tax-toggle"><input type="checkbox" {...whtToggle} onChange={(event) => { whtToggle.onChange(event); if (event.target.checked) setValue("salesTaxEnabled", false, { shouldDirty: true, shouldValidate: true }); }} /><span>Include WHT</span></label><label className="settings-label">WHT rate (%)<Input className={error("taxRate") ? "has-error" : ""} disabled={!watch("taxEnabled")} {...numericField(register, "taxRate")} placeholder="10" />{error("taxRate") && <span className="lead-form-error">{error("taxRate")}</span>}</label></div>
    </div>

    <div className="invoice-form-section-heading"><h3>Summary</h3></div>
    <div className="invoice-summary-section invoice-form-wide"><label className="settings-label">Net total<Input {...netTotalField} className={error("netTotal") ? "has-error" : ""} inputMode="numeric" onChange={(event) => { event.target.value = sanitizeNumericInput(event.target.value, true); netTotalEditedRef.current = true; netTotalField.onChange(event); }} placeholder="0" />{error("netTotal") && <span className="lead-form-error">{error("netTotal")}</span>}</label><div className="quotation-live-summary invoice-live-summary"><span>Charges PKR {totals.subtotal.toLocaleString("en-PK")}</span>{totals.salesTaxAmount > 0 ? <span>Sales Tax PKR {totals.salesTaxAmount.toLocaleString("en-PK")}</span> : null}{totals.whtAmount > 0 ? <span>WHT TAX PKR {totals.whtAmount.toLocaleString("en-PK")}</span> : null}<strong>Net total PKR {invoiceAmount(watch("netTotal")).toLocaleString("en-PK")}</strong></div></div>
    <div className="dialog-actions"><Button type="button" variant="danger" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}><Receipt size={15} /> {initialInvoice ? "Save changes" : "Create invoice"}</Button></div>
  </form></div>;
}

// TITLE: INVOICE TABLE
function InvoiceStatusChips({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const statuses = [
    { value: "Paid", className: "invoice-status-chip-paid" },
    { value: "Pending", className: "invoice-status-chip-pending" },
    { value: "Overdue", className: "invoice-status-chip-overdue" }
  ];
  return <div className="invoice-status-chips" role="group" aria-label="Invoice status filters">{statuses.map((status) => {
    const active = value === status.value;
    return <button key={status.value} type="button" className={`invoice-status-chip ${status.className}${active ? " is-active" : ""}`} aria-pressed={active} aria-label={active ? `Clear ${status.value} filter` : `Filter by ${status.value}`} onClick={() => onChange(active ? "" : status.value)}><span>{status.value}</span>{active ? <X size={12} aria-hidden="true" /> : null}</button>;
  })}</div>;
}

function createInvoiceColumns(onOpen, onEdit, canEdit = onEdit?.canEdit !== false) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("invoice", { header: "Invoice / account", cell: ({ row }) => <div className="table-primary invoice-primary"><strong>{row.original.invoice}</strong><span>{row.original.account}</span></div> }), columnHelper.accessor("period", { header: "Billing period", cell: ({ getValue }) => <span className="invoice-period"><CalendarDays size={13} /> {getValue()}</span> }), columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }), columnHelper.accessor("dueDate", { header: "Due", cell: ({ getValue }) => <span className="invoice-due">{format(new Date(getValue()), "MMM d, yyyy")}</span> }), columnHelper.accessor("paymentStatus", { header: "Status", cell: ({ row }) => { const value = invoiceStatus(row.original); return <StatusBadge tone={value === "Paid" ? "success" : value === "Overdue" ? "danger" : value === "Pending" ? "neutral" : "accent"}>{value}</StatusBadge>; } }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><TableActionMenu ariaLabel={`Actions for ${row.original.invoice}`} items={[{ label: "Open invoice", icon: <span aria-hidden="true">□</span>, onSelect: () => onOpen(row.original) }, ...(canEdit ? [{ label: "Edit invoice", icon: <span aria-hidden="true">✎</span>, onSelect: () => onEdit(row.original) }] : [])]} /></div> })];
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

function invoiceEmailTemplate() {
  const value = getDemoValue("email-template-send-invoice");
  if (!value || typeof value !== "object") return undefined;
  const template = value as { subject?: unknown; body?: unknown };
  return {
    subject: typeof template.subject === "string" ? template.subject : undefined,
    body: typeof template.body === "string" ? template.body : undefined,
  };
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
  const queryClient = useQueryClient();
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
  const [automationOpen, setAutomationOpen] = useState(false);
  const supabaseEnabled = isSupabaseLeadsEnabled();

  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices.all,
    queryFn: fetchInvoicesSnapshot,
    enabled: canView,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members.all,
    queryFn: fetchMembersSnapshot,
    enabled: canView,
  });

  const automationQuery = useQuery({
    queryKey: queryKeys.invoices.automation,
    queryFn: fetchInvoiceAutomationSettings,
    enabled: canView && supabaseEnabled,
  });

  useEffect(() => {
    if (!canView) {
      setInvoices([]);
      setMembers([]);
      return;
    }
    if (!membersQuery.data) return;
    setMembers(membersQuery.data.members.filter((member) => ["active", "activated"].includes(String(member.status || "Active").trim().toLowerCase())));
    if (membersQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Members could not be loaded", message: "Select a member after the member register is available." });
    }
  }, [canView, membersQuery.data, showToast]);

  useEffect(() => {
    if (!invoicesQuery.data) return;
    setInvoices(invoicesQuery.data.invoices);
    if (invoicesQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Invoices could not be loaded", message: "Showing the saved invoice data." });
    }
  }, [invoicesQuery.data, showToast]);

  // TITLE: INVOICE ACTIONS
  const persist = (nextInvoices) => {
    setInvoices(nextInvoices);
    queryClient.setQueryData<InvoiceQuerySnapshot>(queryKeys.invoices.all, (current) => ({
      ...(current || { dataSource: "supabase", errorMessage: "" }),
      invoices: nextInvoices,
      errorMessage: "",
    }));
  };
  const saveAutomation = async (settings: Pick<InvoiceAutomationSettings, "enabled" | "sendDay" | "sendTime" | "memberIds">) => {
    if (!supabaseEnabled) throw new Error("Supabase is not configured for this workspace.");
    if (!canWrite) throw new Error("Your account cannot change invoice automation.");
    const saved = await saveInvoiceAutomationSettings(settings);
    queryClient.setQueryData(queryKeys.invoices.automation, saved);
    setAutomationOpen(false);
    showToast({
      variant: "success",
      title: settings.enabled ? "Automatic invoices enabled" : "Automatic invoices disabled",
      message: settings.enabled ? `Invoices will be created and queued on day ${settings.sendDay} of every month at ${settings.sendTime}.` : "The monthly invoice schedule is disabled.",
    });
  };
  const updateInvoice = async (form) => { if (!editing || !form.memberId) { showToast({ variant: "error", title: "Invoice was not updated", message: "Choose a valid member before saving." }); return; } const nextInvoice = { ...editing, memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.unitPrice || form.subtotal, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxRate || "0", taxAmount: form.taxAmount || "0", whtEnabled: Boolean(form.whtEnabled), whtRate: form.whtRate || "0", whtAmount: form.whtAmount || "0", salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxRate || "0", salesTaxAmount: form.salesTaxAmount || "0", taxLabel: "WHT TAX", billingStartDate: form.billingStartDate, dueDay: Number(form.dueDay) || 5, issueDate: form.issueDate || editing.issueDate, dueDate: form.dueDate || editing.dueDate, manualDateOverride: true }; try { const isSupabaseInvoice = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(editing.id || "")); const savedInvoice = isSupabaseInvoice ? await updateSupabaseInvoice(editing.id, nextInvoice) : nextInvoice; persist(invoices.map((invoice) => invoice.invoice === editing.invoice ? savedInvoice : invoice)); setEditing(null); setSelected(savedInvoice); showToast({ variant: "success", title: "Invoice updated", message: `${savedInvoice.invoice} was saved successfully.` }); } catch (error) { showToast({ variant: "error", title: "Invoice was not updated", message: error?.message || "The invoice changes could not be saved." }); } };
  const markPaid = async () => { if (!canPay) { showToast({ variant: "error", title: "Payment access required", message: "Your account cannot record invoice payments." }); return; } if (!selected) { showToast({ variant: "error", title: "Payment was not recorded", message: "Select an invoice and try again." }); return; } if (!selected.id) { showToast({ variant: "error", title: "Payment was not recorded", message: "This invoice is not ready to use yet. Refresh the register and try again." }); return; } try { await recordSupabaseInvoicePayment(selected.id, invoiceBalanceDue(selected), "other"); const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, paymentStatus: "Paid" } : invoice); persist(next); setSelected(null); showToast({ variant: "success", title: "Payment recorded", message: `${selected.invoice} is now marked as paid.` }); } catch (error) { showToast({ variant: "error", title: "Payment was not recorded", message: error?.message || "We couldn’t record this payment. Please try again." }); } };
const sendInvoice = async () => { if (!selected || sendingInvoice) return; setSendingInvoice(true); let invoiceId = selected.id || ""; try { if (!invoiceId) { const syncedInvoice = (await fetchSupabaseInvoices()).find((invoice) => invoice.invoice === selected.invoice); if (!syncedInvoice?.id) { showToast({ variant: "error", title: "Invoice was not sent", message: "This invoice is not ready to use yet. Refresh the register and try again." }); return; } invoiceId = syncedInvoice.id; setSelected(syncedInvoice); } const { filename, pdf } = await renderInvoicePdf(selected.invoice); const pdfBase64 = pdfToBase64(pdf); const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession(); const token = sessionData.session?.access_token; if (!token) throw new Error("Your session has expired. Sign in again before sending an invoice."); const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/send`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ attachment: { filename, content: pdfBase64 }, template: invoiceEmailTemplate() }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "The invoice email could not be delivered."); const nextStatus = result.delivery?.status === "sent" ? "Sent" : "Failed"; const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, id: invoice.id || invoiceId, emailStatus: nextStatus } : invoice); persist(next); setSelected((current) => current ? { ...current, id: current.id || invoiceId, emailStatus: nextStatus } : current); showToast({ variant: "success", title: "Invoice sent", message: `${selected.invoice} was delivered to ${result.delivery?.recipientEmail || "the client"} with a PDF attachment.` }); } catch (error) { const message = error?.message || "The invoice email could not be delivered."; const canQueueFallback = Boolean(invoiceId) && /not configured|activity_log|schema cache|sales_tax/i.test(message); if (canQueueFallback) { try { const queued = await queueSupabaseInvoiceEmail(invoiceId); const next = invoices.map((invoice) => invoice.invoice === selected.invoice ? { ...invoice, id: invoice.id || invoiceId, emailStatus: "Queued" } : invoice); persist(next); setSelected((current) => current ? { ...current, id: current.id || invoiceId, emailStatus: "Queued" } : current); showToast({ variant: "success", title: "Invoice queued", message: `${selected.invoice} is queued for delivery to ${queued.recipient_email || "the client"}.` }); return; } catch (queueError) { showToast({ variant: "error", title: "Invoice was not sent", message: queueError?.message || message }); return; } } showToast({ variant: "error", title: "Invoice was not sent", message }); } finally { setSendingInvoice(false); } };
const sendInvoiceWhatsApp = async () => { if (!selected || sendingInvoice) return; const member = members.find((item) => item.id === selected.memberId); const recipientPhone = whatsappPhone(member?.phone); if (!recipientPhone) { showToast({ variant: "error", title: "WhatsApp was not opened", message: "This client does not have a phone number saved." }); return; } setSendingInvoice(true); try { const { filename, pdf } = await renderInvoicePdf(selected.invoice); pdf.save(filename); const message = `Hello ${selected.account}, please find invoice ${selected.invoice} from The Cubicle attached.`; window.open(`https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); showToast({ variant: "success", title: "WhatsApp opened", message: `${filename} was downloaded. Attach it to the chat before sending.` }); } catch (error) { console.error("Invoice WhatsApp export failed:", error); showToast({ variant: "error", title: "WhatsApp was not opened", message: "The invoice PDF could not be prepared. Please try again." }); } finally { setSendingInvoice(false); } };

const addInvoice = async (form) => { if (!form?.account?.trim() || !form?.issueDate || !form.memberId) { showToast({ variant: "error", title: "Invoice was not created", message: "Choose a valid member and invoice date before saving." }); return; } const issueDate = form.issueDate; const billingPeriod = issueDate.slice(0, 7); const duplicate = invoices.find((invoice) => String(invoice.memberId || "") === String(form.memberId) && String(invoice.issueDate || "").slice(0, 7) === billingPeriod); if (duplicate) { showToast({ variant: "error", title: "Invoice already exists", message: `${duplicate.account} already has an invoice for this billing month.` }); return; } const nextInvoice = { invoice: nextInvoiceNumber(invoices), memberId: form.memberId, account: form.account, period: form.period, amount: form.amount, subtotal: form.subtotal, unitPrice: form.unitPrice || form.subtotal, qty: "1", itemDescription: form.itemDescription, charges: form.charges, items: form.items, taxEnabled: Boolean(form.taxEnabled), taxRate: form.taxRate || "0", taxAmount: form.taxAmount || "0", whtEnabled: Boolean(form.whtEnabled), whtRate: form.whtRate || "0", whtAmount: form.whtAmount || "0", salesTaxEnabled: Boolean(form.salesTaxEnabled), salesTaxRate: form.salesTaxRate || "0", salesTaxAmount: form.salesTaxAmount || "0", taxLabel: "WHT TAX", billingStartDate: form.billingStartDate, dueDay: Number(form.dueDay) || 5, issueDate, dueDate: form.dueDate || getInvoiceDueDate(issueDate, form.dueDay, form.billingStartDate), manualDateOverride: true, paymentStatus: "Due soon", emailStatus: "Not sent" }; try { const savedInvoice = await createSupabaseInvoice(nextInvoice); persist([savedInvoice, ...invoices]); setCreating(false); setSelected(savedInvoice); showToast({ variant: "success", title: "Invoice created", message: `${savedInvoice.invoice} is saved and ready for delivery.` }); } catch (error) { const duplicateNumber = error?.code === "23505" && String(error?.message || "").includes("invoices_invoice_number_key"); showToast({ variant: "error", title: "Invoice was not created", message: duplicateNumber ? "That invoice number already exists. Refresh the invoice register and try again." : error?.message || "We couldn’t save this invoice. Please try again." }); } };
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => { const issueDate = String(invoice.issueDate || "").slice(0, 10); const normalizedStatus = invoiceStatus(invoice); return (!dateFrom || issueDate >= dateFrom) && (!dateTo || issueDate <= dateTo) && (!paymentFilter || normalizedStatus === paymentFilter); }), [invoices, dateFrom, dateTo, paymentFilter]);
  const exportInvoices = () => { const csv = ["Invoice,Account,Period,Amount,Status", ...filteredInvoices.map((invoice) => [invoice.invoice, invoice.account, invoice.period, invoice.amount, invoiceStatus(invoice)].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "cubicle-invoices-demo.csv"; link.click(); URL.revokeObjectURL(link.href); showToast({ variant: "success", title: "Invoices exported", message: "Your filtered invoice CSV is ready." }); };
  const openInvoices = useMemo(() => filteredInvoices.filter(hasOpenBalance), [filteredInvoices]);
  const overdue = useMemo(() => openInvoices.filter((invoice) => invoiceStatus(invoice) === "Overdue").length, [openInvoices]);
  const paid = useMemo(() => filteredInvoices.filter((invoice) => invoiceStatus(invoice) === "Paid").length, [filteredInvoices]);
  const dueSoon = useMemo(() => openInvoices.filter((invoice) => invoiceStatus(invoice) === "Due soon").length, [openInvoices]);
  const totalInvoiced = useMemo(() => filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0), [filteredInvoices]);
  const sortedInvoices = useMemo(() => [...filteredInvoices].sort((a, b) => invoiceSequence(b.invoice) - invoiceSequence(a.invoice)), [filteredInvoices]);
  const kpiDetails = kpiDetail === "total" ? filteredInvoices : filteredInvoices.filter((invoice) => invoiceStatus(invoice) === kpiDetail);

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">Invoice records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Invoices — View access.</div></motion.div>;

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Invoices</h1><p className="muted-copy">A clear register for valid member invoices, dates and collection status.</p></div><div className="header-actions invoice-register-filters"><TableActionMenu ariaLabel="Invoice actions" items={[{ label: "Automatic invoices", icon: <CalendarClock size={16} />, onSelect: () => { if (!supabaseEnabled) { showToast({ variant: "error", title: "Supabase is not configured", message: "Automatic invoice schedules require the production Supabase connection." }); return; } if (!canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot change invoice automation." }); return; } setAutomationOpen(true); } }, { label: "Export", icon: <Download size={16} />, onSelect: exportInvoices }, { label: "Create invoice", icon: <CirclePlus size={16} />, onSelect: () => setCreating(true) }]} /></div></div><section className="stat-grid finance-stat-grid module-stats"><KpiCard onClick={() => setKpiDetail("total")} icon={<Receipt size={18} />} label="Total invoiced" value={formatInvoiceAmount(filteredInvoices.reduce((total, invoice) => total + invoiceAmount(invoice.amount), 0))} detail={`${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? "" : "s"}`} /><KpiCard onClick={() => setKpiDetail("Paid")} icon={<FileCheck2 size={18} />} label="Paid invoices" value={paid} detail="Recorded payments" /><KpiCard onClick={() => setKpiDetail("Due soon")} icon={<Receipt size={18} />} label="Due soon" value={dueSoon} detail="Within 5 days" /><KpiCard onClick={() => setKpiDetail("Overdue")} icon={<Receipt size={18} />} label="Overdue invoices" value={overdue} detail="Needs attention" /></section><div className="invoice-status-filter-row"><div className="invoice-date-filters"><DatePickerField label="From" value={dateFrom} onChange={setDateFrom} /><DatePickerField label="To" value={dateTo} onChange={setDateTo} /></div><InvoiceStatusChips value={paymentFilter} onChange={setPaymentFilter} /></div><DataTable title="Invoice register" subtitle="Showing only valid member invoices that match the selected filters." columns={createInvoiceColumns(setSelected, setEditing)} data={sortedInvoices} onRowClick={setSelected} /><Dialog open={creating} onClose={() => setCreating(false)} ariaLabel="Create invoice"><InvoiceForm members={members} onCancel={() => setCreating(false)} onSave={addInvoice} /></Dialog><Dialog open={automationOpen} onClose={() => setAutomationOpen(false)} ariaLabel="Automatic invoices"><InvoiceAutomationForm settings={automationQuery.data || defaultInvoiceAutomationSettings} members={members} onCancel={() => setAutomationOpen(false)} onSave={saveAutomation} /></Dialog><Dialog open={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Edit invoice">{editing ? <InvoiceForm members={members} initialInvoice={editing} onCancel={() => setEditing(null)} onSave={updateInvoice} /> : null}</Dialog><Dialog open={Boolean(ledgerInvoice)} onClose={() => setLedgerInvoice(null)} ariaLabel="Invoice ledger">{ledgerInvoice ? <div className="dialog-content invoice-ledger-dialog"><div className="card-heading"><div><span className="seat-details-label">Payment ledger</span><h2>{ledgerInvoice.invoice}</h2><p className="muted-copy">{ledgerInvoice.account}</p></div></div><div className="ledger-summary"><div><span>Amount</span><strong>{ledgerInvoice.amount}</strong></div><div><span>Status</span><strong>{invoiceStatus(ledgerInvoice)}</strong></div><div><span>Issue date</span><strong>{format(new Date(ledgerInvoice.issueDate), "MMM d, yyyy")}</strong></div><div><span>Due</span><strong>{format(new Date(ledgerInvoice.dueDate), "MMM d, yyyy")}</strong></div></div><div className="dialog-actions"><Button variant="ghost" onClick={() => setLedgerInvoice(null)}>Close</Button><Button onClick={() => { setSelected(ledgerInvoice); setLedgerInvoice(null); }}>Open invoice</Button></div></div> : null}</Dialog><Dialog open={Boolean(kpiDetail)} onClose={() => setKpiDetail(null)} ariaLabel="Invoice KPI details">{kpiDetail ? <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">Invoice details</span><h2>{kpiDetail === "total" ? "All invoices" : `${kpiDetail} invoices`}</h2></div></div><div className="ledger-summary"><div><span>Records</span><strong>{kpiDetails.length}</strong></div><div><span>Total</span><strong>{formatInvoiceAmount(kpiDetails.reduce((sum, invoice) => sum + invoiceAmount(invoice.amount), 0))}</strong></div></div><div className="table-card"><div className="table-scroll"><table className="data-table"><tbody>{kpiDetails.slice(0, 12).map((invoice) => <tr key={invoice.invoice}><td>{invoice.invoice}</td><td>{invoice.account}</td><td>{invoice.amount}</td><td>{invoiceStatus(invoice)}</td></tr>)}</tbody></table></div></div></div> : null}</Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Invoice details">{selected ? <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onPaid={markPaid} onEmail={sendInvoice} onWhatsApp={sendInvoiceWhatsApp} sending={sendingInvoice} /> : null}</Dialog></motion.div>;
}
