"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FileText, Mail, MessageCircle, Pencil, PlusCircle, ReceiptText, Send } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { leadRows } from "@/lib/module-b-data";
import DynamicInvoiceTemplate, { invoiceFromRecord } from "@/components/invoices/invoice-template";
import { ChargeEditor, chargeAmount, chargesTotal, getEditableCharges } from "@/components/invoices/charge-editor";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { numericField, numericString } from "@/lib/number-input";
import { useHasPermission } from "@/lib/access-control";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseLeads, mapSupabaseLeadToOsLead } from "@/lib/supabase/leads";
import { createSupabaseQuotation, fetchSupabaseQuotations, updateSupabaseQuotation, updateSupabaseQuotationStatus } from "@/lib/supabase/quotations";
import { z } from "zod";

const amountValue = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const quotationSchema = z.object({
  leadId: z.string().trim().min(1, "Choose a lead."),
  date: z.string().min(1, "Choose a quotation date."),
  itemDescription: z.string().trim().min(1, "Enter an item description."),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid numeric amount.").min(1, "Enter a subtotal."),
  taxEnabled: z.boolean().optional(),
  taxRate: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid WHT rate."),
  salesTaxEnabled: z.boolean().optional(),
  salesTaxRate: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid sales tax rate.").refine((value) => !value || Number(value) < 100, "Sales Tax must be below 100%.")
});

function getEligibleLeads(rows) {
  return rows.map((lead, index) => ({ ...lead, id: lead.id || `lead-${index}`, stage: normalizeLeadStage(lead.stage, lead) })).filter((lead) => lead.stage === "Quotation requested");
}

function mergeLeadWorkflowMetadata(remoteLead, cachedLeads) {
  const cached = cachedLeads.find((lead) => lead.id === remoteLead.id);
  if (!cached) return remoteLead;
  return {
    ...remoteLead,
    company: cached.company ?? remoteLead.company,
    source: cached.source ?? remoteLead.source,
    stage: cached.stage ?? remoteLead.stage,
    assignedTo: cached.assignedTo ?? remoteLead.assignedTo,
    journey: cached.journey ?? remoteLead.journey,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function whatsappPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith("92")) digits = `92${digits}`;
  return digits;
}

function formatQuotationDate(value) {
  const raw = String(value || "");
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatQuotationAmount(value) {
  const amount = amountValue(value);
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

const money = (value: number) => formatQuotationAmount(value);

function getLocalDateTime() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
  };
}

function addQuotationJourneyEntry(lead, quotation, outcome) {
  const journey = Array.isArray(lead.journey) ? lead.journey : [];
  if (journey.some((entry) => entry.entryType === "quotation" && entry.quotationNumber === quotation.quotation && entry.outcome === outcome)) return lead;
  const occurred = getLocalDateTime();
  return {
    ...lead,
    journey: [{
      id: `journey-${quotation.quotation}-${outcome}-${Date.now()}`,
      entryType: "quotation",
      quotationNumber: quotation.quotation,
      visitorIdentity: lead.name,
      occurredDate: occurred.date,
      occurredTime: occurred.time,
      purpose: "Quotation workflow",
      companions: "",
      source: lead.source || "Website",
      mood: "",
      certainty: "",
      objections: "",
      nextFollowUpDate: "",
      nextFollowUpTime: "",
      communicationMode: "Email / WhatsApp",
      conversionProbability: "High",
      conversionReason: "",
      notes: `${quotation.quotation} ${outcome.toLowerCase()}.`,
      outcome
    }, ...journey]
  };
}

function createQuotationColumns(onOpen, onEdit, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("quotation", { header: "Quotation / account", cell: ({ row }) => <div className="table-primary"><strong>{row.original.quotation}</strong><span>{row.original.account}</span></div> }),
    columnHelper.accessor("date", { header: "Date", cell: ({ getValue }) => formatQuotationDate(getValue()) }),
    columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{formatQuotationAmount(getValue())}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Accepted" || getValue() === "Sent" ? "success" : getValue() === "Expired" ? "danger" : "accent"}>{getValue()}</StatusBadge> }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open ${row.original.quotation}`} title="Quotation"><FileText size={16} /></button>{canEdit ? <button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit ${row.original.quotation}`} title="Edit quotation"><Pencil size={16} /></button> : <span className="read-only-label">View only</span>}</div> }),
  ];
}

function QuotationForm({ initialQuotation, eligibleLeads, onCancel, onSave }) {
  const initialLeadId = initialQuotation?.leadId || eligibleLeads.find((lead) => lead.company === initialQuotation?.account)?.id || "";
  const leadOptions = initialQuotation && !eligibleLeads.some((lead) => lead.id === initialLeadId)
    ? [{ id: initialLeadId, name: initialQuotation.customerName, company: initialQuotation.account }, ...eligibleLeads]
    : eligibleLeads;
  const initialCharges = getEditableCharges(initialQuotation);
  const formApi = useForm({ resolver: zodResolver(quotationSchema), defaultValues: { leadId: initialLeadId, date: initialQuotation?.date || "2026-10-05", itemDescription: initialCharges[0]?.description || "Workspace services", amount: numericString(chargesTotal(initialCharges), "0"), taxEnabled: Boolean(initialQuotation?.whtEnabled ?? initialQuotation?.taxEnabled), taxRate: numericString(initialQuotation?.whtRate ?? initialQuotation?.taxRate, "10"), salesTaxEnabled: Boolean(initialQuotation?.salesTaxEnabled), salesTaxRate: numericString(initialQuotation?.salesTaxRate, "0") }, mode: "onBlur" });
  const { register, handleSubmit, formState, setValue, setError, watch } = formApi;
  const [charges, setCharges] = useState(initialCharges);
  const updateCharges = (nextCharges) => { setCharges(nextCharges); setValue("amount", String(chargesTotal(nextCharges)), { shouldDirty: true }); setValue("itemDescription", nextCharges[0]?.description || "", { shouldDirty: true }); };
  const error = (field) => formState.errors[field]?.message;
  const subtotal = chargesTotal(charges);
  const totals = calculateInvoiceTotals({ subtotal, whtEnabled: watch("taxEnabled"), whtRate: watch("taxRate"), salesTaxEnabled: watch("salesTaxEnabled"), salesTaxRate: watch("salesTaxRate") });
  const save = async (values) => { if (charges.some((charge) => !charge.description.trim())) { setError("itemDescription", { type: "manual", message: "Add a description for each charge." }); return; } const normalizedCharges = charges.map((charge) => ({ description: charge.description.trim(), amount: String(parseAmount(charge.amount)) })); return onSave({ ...values, subtotal: String(totals.subtotal), taxAmount: String(totals.whtAmount), taxRate: values.taxEnabled ? String(totals.whtRate) : "0", whtEnabled: Boolean(values.taxEnabled), whtRate: values.taxEnabled ? String(totals.whtRate) : "0", whtAmount: String(totals.whtAmount), salesTaxEnabled: Boolean(values.salesTaxEnabled), salesTaxRate: values.salesTaxEnabled ? String(totals.salesTaxRate) : "0", salesTaxAmount: String(totals.salesTaxAmount), taxLabel: "WHT TAX", amount: String(totals.total), itemDescription: normalizedCharges[0].description, charges: normalizedCharges, items: normalizedCharges.map((charge) => ({ description: charge.description, price: charge.amount, quantity: 1 })) }); };
  return <div className="dialog-content quotation-form"><div className="card-heading"><div><h2>{initialQuotation ? "Edit quotation" : "Create quotation"}</h2><p className="muted-copy">Sales Tax is included in the total; WHT is withheld from the subtotal when enabled.</p></div></div><form className="inline-form-grid" onSubmit={handleSubmit(save)}><SelectField className="quotation-to-select" label="To" value={watch("leadId")} hint={error("leadId")} disabled={!leadOptions.length} onChange={(event) => setValue("leadId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">{leadOptions.length ? "Select a lead" : "No eligible leads"}</option>{leadOptions.map((lead) => <option value={lead.id} key={lead.id}>{lead.company} - {lead.name}</option>)}</SelectField><label className="settings-label">Date<Input className={error("date") ? "has-error" : ""} type="date" {...register("date")} />{error("date") && <span className="lead-form-error">{error("date")}</span>}</label><input type="hidden" {...register("itemDescription")} /><input type="hidden" {...register("amount")} /><ChargeEditor charges={charges} onChange={updateCharges} />{error("itemDescription") && <span className="lead-form-error charge-editor-error">{error("itemDescription")}</span>}{error("amount") && <span className="lead-form-error charge-editor-error">{error("amount")}</span>}<label className="quotation-tax-toggle"><input type="checkbox" {...register("salesTaxEnabled")} /><span>Include Sales Tax</span><small>Sales Tax is included in the total.</small></label><label className="settings-label">Sales Tax rate (%)<Input className={error("salesTaxRate") ? "has-error" : ""} disabled={!watch("salesTaxEnabled")} {...numericField(register, "salesTaxRate")} placeholder="0" />{error("salesTaxRate") && <span className="lead-form-error">{error("salesTaxRate")}</span>}</label><label className="quotation-tax-toggle"><input type="checkbox" {...register("taxEnabled")} /><span>Include WHT</span><small>WHT is deducted from the subtotal.</small></label><label className="settings-label">WHT rate (%)<Input className={error("taxRate") ? "has-error" : ""} disabled={!watch("taxEnabled")} {...numericField(register, "taxRate")} placeholder="10" />{error("taxRate") && <span className="lead-form-error">{error("taxRate")}</span>}</label><label className="settings-label">Net total<Input value={money(totals.total)} readOnly /></label><div className="quotation-live-summary"><span>Charges {money(totals.subtotal)}</span>{totals.salesTaxAmount > 0 ? <span>Sales Tax {money(totals.salesTaxAmount)}</span> : null}{totals.whtAmount > 0 ? <span>WHT TAX {money(totals.whtAmount)}</span> : null}<strong>Net total {money(totals.total)}</strong></div><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting || !leadOptions.length}><ReceiptText size={15} /> {initialQuotation ? "Save changes" : "Create quotation"}</Button></div></form></div>;
}

export default function QuotationsPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("quotations.read");
  const canWrite = useHasPermission("quotations.write");
  const [quotations, setQuotations] = useState([]);
  const [eligibleLeads, setEligibleLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!canView) {
        if (!cancelled) {
          setQuotations([]);
          setEligibleLeads([]);
        }
        return;
      }
      const saved = getDemoValue("quotations");
      const savedLeads = getDemoValue("leads");
      const cachedQuotations = Array.isArray(saved) ? saved : [];
      const cachedLeads = Array.isArray(savedLeads) ? savedLeads : [];

      if (!isSupabaseLeadsEnabled()) {
        if (cancelled) return;
        setQuotations(cachedQuotations);
        setEligibleLeads(getEligibleLeads(cachedLeads.length ? cachedLeads : leadRows));
        return;
      }

      try {
        const [remoteQuotations, remoteLeads] = await Promise.all([fetchSupabaseQuotations(), fetchSupabaseLeads()]);
        if (cancelled) return;
        const normalizedLeads = remoteLeads.map(mapSupabaseLeadToOsLead).map((lead) => mergeLeadWorkflowMetadata(lead, cachedLeads));
        setQuotations(remoteQuotations);
        setEligibleLeads(getEligibleLeads(normalizedLeads));
        setLoadError("");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error?.message || "Quotations could not be loaded from Supabase.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [canView]);
  const persist = (next) => { setQuotations(next); saveDemoValue("quotations", next); };
  const saveQuotation = async (form) => {
    if (!canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot create or edit quotations." }); return; }
    const storedLeadRows = getDemoValue("leads");
    const allLeads = Array.isArray(storedLeadRows) ? storedLeadRows : leadRows;
    const lead = eligibleLeads.find((item) => item.id === form.leadId) || (editing ? allLeads.find((item) => item.id === form.leadId || item.id === editing.leadId) : null);
    if (!lead) { showToast({ variant: "error", title: "Quotation was not saved", message: "Choose a lead who requested a quotation." }); return; }
    const wasEditing = Boolean(editing);
    const quotationInput = { ...form, id: editing?.id, leadId: lead.id, account: lead.company || "Company", customerName: lead.name, customerPhone: lead.phone || "", customerEmail: lead.email || "", quotation: editing?.quotation, status: editing?.status || "Draft", validUntil: editing?.validUntil };
    try {
      if (isSupabaseLeadsEnabled()) {
        const savedQuotation = wasEditing && editing?.id
          ? await updateSupabaseQuotation(editing.id, quotationInput)
          : await createSupabaseQuotation(quotationInput);
        const next = wasEditing
          ? quotations.map((item) => item.id === savedQuotation.id ? savedQuotation : item)
          : [savedQuotation, ...quotations];
        setQuotations(next);
        setCreating(false); setEditing(null); setSelected(savedQuotation);
        showToast({ variant: "success", title: wasEditing ? "Quotation updated" : "Quotation created", message: `${savedQuotation.quotation} was saved to Supabase.` });
        return;
      }

      const quotation = { ...quotationInput, quotation: editing?.quotation || `QUO-2026-${1001 + quotations.length}` };
      persist(wasEditing ? quotations.map((item) => item.quotation === editing.quotation ? quotation : item) : [quotation, ...quotations]);
      setCreating(false); setEditing(null); setSelected(quotation);
      showToast({ variant: "success", title: wasEditing ? "Quotation updated" : "Quotation created", message: `${quotation.quotation} was saved successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: "Quotation was not saved", message: error?.message || "Quotation could not be saved." });
    }
  };
  const sendQuotation = async (channel) => {
    if (!selected || sending) return;
    const storedLeads = getDemoValue("leads");
    const allLeads = isSupabaseLeadsEnabled() ? eligibleLeads : (Array.isArray(storedLeads) ? storedLeads : eligibleLeads);
    const selectedLead = allLeads.find((lead) => lead.id === selected.leadId || (lead.company === selected.account && (!selected.customerName || lead.name === selected.customerName)));
    const recipientEmail = selected.customerEmail || selectedLead?.email || "";
    const recipientPhone = whatsappPhone(selected.customerPhone || selectedLead?.phone);
    if (channel === "email" && !recipientEmail) {
      showToast({ variant: "error", title: "Email was not opened", message: "This lead does not have an email address saved." });
      return;
    }
    if (channel === "whatsapp" && !recipientPhone) {
      showToast({ variant: "error", title: "WhatsApp was not opened", message: "This lead does not have a phone number saved." });
      return;
    }
    const invoiceElement = document.getElementById("printable-invoice");
    if (!invoiceElement) return;
    setSending(true);
    invoiceElement.classList.add("pdf-exporting");
    const filename = `${selected.quotation}.pdf`;
    const message = `Hello ${selected.customerName || selected.account}, please find your quotation from The Cubicle attached.`;
    try {
      const canvas = await html2canvas(invoiceElement, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageRatio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const imageWidth = canvas.width * imageRatio;
      const imageHeight = canvas.height * imageRatio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight);
      const blob = pdf.output("blob");
      downloadBlob(blob, filename);
      const sentQuotation = canWrite && isSupabaseLeadsEnabled() && selected.id
        ? await updateSupabaseQuotationStatus(selected.id, "Sent")
        : { ...selected, status: "Sent" };
      if (canWrite && isSupabaseLeadsEnabled() && selected.id) {
        setQuotations(quotations.map((quotation) => quotation.id === selected.id ? sentQuotation : quotation));
      } else {
        persist(quotations.map((quotation) => quotation.quotation === selected.quotation ? sentQuotation : quotation));
      }
      setSelected(sentQuotation);
      if (!isSupabaseLeadsEnabled() && selectedLead && Array.isArray(storedLeads)) {
        const nextLeads = storedLeads.map((lead) => lead.id === selectedLead.id
          ? addQuotationJourneyEntry(transitionLead(lead, { type: "quotation-sent" }), sentQuotation, "Quotation sent")
          : lead);
        saveDemoValue("leads", nextLeads);
        setEligibleLeads(getEligibleLeads(nextLeads));
      }
      if (channel === "whatsapp") {
        window.open(`https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        showToast({ variant: "success", title: "WhatsApp opened", message: `${filename} was downloaded. Attach it to the chat before sending.` });
      } else {
        window.location.href = `mailto:${recipientEmail}?subject=${encodeURIComponent(`Quotation ${selected.quotation}`)}&body=${encodeURIComponent(message)}`;
        showToast({ variant: "success", title: "Email opened", message: `${filename} was downloaded. Attach it to the email before sending.` });
      }
      setSendOpen(false);
    } catch (error) {
      console.error("Quotation PDF export failed:", error);
      showToast({ variant: "error", title: "Quotation was not prepared", message: "The PDF could not be prepared. Please try again." });
    } finally {
      invoiceElement.classList.remove("pdf-exporting");
      setSending(false);
    }
  };
  const closeForm = () => { setCreating(false); setEditing(null); };
  if (!canView) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Quotations</h1><p className="muted-copy">Quotation records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Quotations — View access.</div></motion.div></PageShell>;
  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Quotations</h1><p className="muted-copy">Prepare and share workspace quotations using the invoice template.</p>{loadError ? <p className="lead-form-error">{loadError}</p> : null}</div>{canWrite ? <Button className="quotation-create-button" onClick={() => setCreating(true)}><PlusCircle size={16} /> Create quotation</Button> : <span className="read-only-label">View only — print and send enabled</span>}</div><section className="stat-grid finance-stat-grid module-stats quotation-kpi-grid"><KpiCard icon={<FileText size={18} />} label="Total quotations" value={quotations.length} detail={isSupabaseLeadsEnabled() ? "From Supabase" : "Created in this session"} /></section><div className="section-heading"><div><h2>Quotation register</h2><p className="muted-copy">Select a quotation to preview, print, or send it.</p></div></div><DataTable columns={createQuotationColumns(setSelected, setEditing, canWrite)} data={quotations} onRowClick={setSelected} emptyMessage="No quotations created yet." /><Dialog open={creating && canWrite || Boolean(editing) && canWrite} onClose={closeForm} ariaLabel={editing ? "Edit quotation" : "Create quotation"}><QuotationForm initialQuotation={editing} eligibleLeads={eligibleLeads} onCancel={closeForm} onSave={saveQuotation} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Quotation preview">{selected ? <div className="dialog-content invoice-detail-only"><div className="invoice-preview-frame"><DynamicInvoiceTemplate invoice={invoiceFromRecord({ ...selected, invoice: selected.quotation, issueDate: selected.date })} documentTitle="QUOTATION" /></div><div className="dialog-actions invoice-preview-actions quotation-preview-actions"><Button className="quotation-preview-cancel" variant="ghost" onClick={() => { setSendOpen(false); setSelected(null); }}>Cancel</Button><Button className="quotation-preview-print" onClick={() => window.print()}>Print quotation</Button><Button className="quotation-preview-send" onClick={() => setSendOpen(true)}><Send size={15} /> Send quotation</Button></div></div> : null}</Dialog><Dialog open={sendOpen} onClose={() => setSendOpen(false)} ariaLabel="Send quotation"><div className="dialog-content quotation-send-dialog"><div className="card-heading"><div><h2>Send quotation</h2><p className="muted-copy">Choose how you want to share this quotation.</p></div></div><div className="quotation-send-options"><button type="button" className="quotation-send-option" onClick={() => sendQuotation("whatsapp")} disabled={sending}><MessageCircle size={18} /><span><strong>WhatsApp</strong><small>Open the chat with a pre-filled message.</small></span></button><button type="button" className="quotation-send-option" onClick={() => sendQuotation("email")} disabled={sending}><Mail size={18} /><span><strong>Email</strong><small>Open an email with a pre-filled message.</small></span></button></div><div className="dialog-actions quotation-send-actions"><Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>Cancel</Button></div></div></Dialog></motion.div></PageShell>;
}
