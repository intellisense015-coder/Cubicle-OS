"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ChevronDown, Download, FileText, Mail, MessageCircle, Pencil, PlusCircle, ReceiptText, Send, X } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { numericField, numericString } from "@/lib/number-input";
import { getSupabaseBrowserClient, isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseLeads, mapSupabaseLeadToOsLead } from "@/lib/supabase/leads";
import { fetchSupabaseMembers, mapSupabaseMemberToOsMember } from "@/lib/supabase/members";
import { createSupabaseProposal, fetchSupabaseProposals, updateSupabaseProposal, updateSupabaseProposalStatus } from "@/lib/supabase/proposals";
import { emailTemplates } from "@/features/email-templates/data";
import { z } from "zod";
import { useHasPermission } from "@/lib/access-control";

const amountValue = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const money = (value: number) => `PKR ${value.toLocaleString("en-PK")}`;
const officeSelections = {
  "1": { x: 10.86, y: 6.2, width: 10.36, height: 20.16 }, "2": { x: 1.2, y: 9.22, width: 9.08, height: 17.13 },
  "3": { x: 10.79, y: 32.87, width: 12.78, height: 10.78 }, "4": { x: 10.79, y: 44.11, width: 12.78, height: 8.6 },
  "5": { x: 10.79, y: 53.26, width: 12.78, height: 12.33 }, "6": { x: 1.14, y: 32.87, width: 9.16, height: 16.36 },
  "7": { x: 1.14, y: 49.77, width: 9.16, height: 15.81 }, "8": { x: 0.99, y: 72.48, width: 5.68, height: 16.59 },
  "9": { x: 7.1, y: 72.48, width: 8.73, height: 14.96 }, "10": { x: 16.32, y: 72.48, width: 7.24, height: 5.27 },
  "11": { x: 16.32, y: 78.29, width: 7.24, height: 9.15 }, "12": { x: 29.74, y: 81.09, width: 7.81, height: 11.24 },
  "13": { x: 37.97, y: 81.09, width: 5.46, height: 8.53 }, "14": { x: 33.21, y: 63.88, width: 5.18, height: 10.62 },
  "15": { x: 52.16, y: 63.88, width: 5.04, height: 10.62 }, "16": { x: 57.91, y: 69.38, width: 7.38, height: 5.12 },
  "17": { x: 57.91, y: 63.88, width: 7.38, height: 5.04 }, "18": { x: 71.33, y: 49.69, width: 19.92, height: 10.31 },
  "19": { x: 71.33, y: 36.43, width: 19.92, height: 12.71 }, "20": { x: 71.54, y: 6.28, width: 19.8, height: 28.76 },
};
const defaultSelection = officeSelections["11"];
const selectionForOffice = (office: unknown) => {
  const officeNumber = String(office || "").trim().toLowerCase().replace(/^office\s*/, "").trim();
  return officeSelections[officeNumber] || defaultSelection;
};

function whatsappPhone(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith("92")) digits = `92${digits}`;
  return digits;
}

function proposalEmailTemplate() {
  const fallback = emailTemplates.find((template) => template.id === "send-proposal");
  const saved = getDemoValue("email-template-send-proposal");
  const template = saved && typeof saved === "object" ? saved : fallback;
  return {
    subject: String(template?.subject || "Proposal {{proposal_number}} from The Cubicle"),
    body: String(template?.body || "Hello {{recipient_name}}, your workspace proposal {{proposal_number}} is ready. The complete proposal PDF is attached for your review."),
  };
}

async function renderProposalPdf(frameRef: { current: HTMLIFrameElement | null }, proposal: any) {
  const frameDocument = frameRef.current?.contentDocument;
  const pages = Array.from(frameDocument?.querySelectorAll<HTMLElement>(".page") || []);
  if (!pages.length) throw new Error("The proposal preview is not ready. Please wait a moment and try again.");
  if (frameDocument?.fonts?.ready) await frameDocument.fonts.ready;

  const templateImages = Array.from(frameDocument?.images || []);
  await Promise.all(templateImages.map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => resolve(), { once: true }); });
    if (typeof image.decode === "function") await image.decode().catch(() => undefined);
  }));
  const imageSources = templateImages.map((image) => image.currentSrc || image.src);
  const stylesheetUrls = Array.from(frameDocument?.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]') || []).map((link) => link.href);
  stylesheetUrls.push(new URL("fields.css", frameDocument?.baseURI || window.location.href).href);
  const stylesheetText = (await Promise.all([...new Set(stylesheetUrls)].map(async (url) => {
    try {
      const response = await fetch(url);
      const css = await response.text();
      return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_match, quote, value) => `url("${new URL(value, url).href}")`);
    } catch {
      return "";
    }
  }))).join("\n");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  for (const [index, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      scale: 1.5,
      useCORS: true,
      logging: false,
      width: 612,
      height: 792,
      onclone: (clonedDocument) => {
        if (stylesheetText) {
          const style = clonedDocument.createElement("style");
          style.textContent = stylesheetText;
          clonedDocument.head.appendChild(style);
        }
        Array.from(clonedDocument.images).forEach((image, imageIndex) => {
          if (imageSources[imageIndex]) image.src = imageSources[imageIndex];
        });
      },
    });
    if (index > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  const dataUri = pdf.output("datauristring");
  const content = dataUri.split(",")[1] || "";
  if (!content) throw new Error("The proposal PDF could not be prepared.");
  return { filename: `${proposal.proposalNumber}.pdf`, content, pdf };
}

const proposalSchema = z.object({
  proposalNumber: z.string().optional(),
  date: z.string().min(1, "Choose a proposal date."),
  title: z.string().trim().min(1, "Enter a proposal title."),
  subtitle: z.string().optional(),
  account: z.string().trim().min(1, "Choose a lead or member."),
  totalSeats: z.string().regex(/^\d+$/, "Enter a whole number of seats.").min(1, "Enter the number of seats."),
  pricePerSeat: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid numeric price.").min(1, "Enter the price per seat."),
  discount: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid numeric discount."),
  monthlyMembership: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid numeric membership amount.")
  ,office: z.string().optional()
});

function ProposalRecipientSelect({ leads, members, value, onChange }: any) {
  const [open, setOpen] = useState(false);
  const recipients = [
    ...leads.map((lead: any) => ({ id: `lead:${lead.id}`, label: `${lead.name} - ${lead.company || "No company"}`, type: "Lead" })),
    ...members.map((member: any) => ({ id: `member:${member.id}`, label: `${member.member} - ${member.company || "No company"}`, type: "Member" })),
  ];
  const selected = recipients.find((recipient) => recipient.id === value);
  return <div className="settings-label lead-source-field"><span>To</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? `${selected.type}: ${selected.label}` : "Select a lead or member"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{recipients.length ? recipients.map((recipient) => <button type="button" key={recipient.id} className={value === recipient.id ? "is-selected" : ""} onClick={() => { onChange(recipient); setOpen(false); }}>{recipient.type}: {recipient.label}</button>) : <span className="dropdown-empty">No leads or members added yet</span>}</div>}</div></div>;
}

function createProposalColumns(onOpen: (proposal: any) => void, onEdit: (proposal: any) => void, canEdit: boolean) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("proposalNumber", { header: "Proposal / account", cell: ({ row }) => <div className="table-primary"><strong>{row.original.proposalNumber}</strong><span>{row.original.account}</span></div> }),
    columnHelper.accessor("date", { header: "Date" }),
    columnHelper.accessor("title", { header: "Title" }),
    columnHelper.accessor("total", { header: "Total", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => { const value = String(getValue() || "Draft"); const status = value === "Approved" || value === "Accepted" ? "Approved" : value === "Sent" ? "Sent" : "Draft"; return <StatusBadge tone={status === "Approved" || status === "Sent" ? "success" : "accent"}>{status}</StatusBadge>; } }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open ${row.original.proposalNumber}`} title="Open proposal"><FileText size={16} /></button>{canEdit ? <button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit ${row.original.proposalNumber}`} title="Edit proposal"><Pencil size={16} /></button> : <span className="read-only-label">View only</span>}</div> }),
  ];
}

function ProposalForm({ leads, members, initialProposal, onCancel, onSave }: any) {
  const initialLead = leads.find((lead: any) => `${lead.name} - ${lead.company || "No company"}` === initialProposal?.account);
  const initialMember = members.find((member: any) => `${member.member} - ${member.company || "No company"}` === initialProposal?.account);
  const [recipientId, setRecipientId] = useState(initialLead ? `lead:${initialLead.id}` : initialMember ? `member:${initialMember.id}` : "");
  const formApi = useForm({ resolver: zodResolver(proposalSchema), defaultValues: { proposalNumber: initialProposal?.proposalNumber || "", date: initialProposal?.date || "2026-10-05", title: initialProposal?.title || "", subtitle: initialProposal?.subtitle || "", account: initialProposal?.account || "", office: initialProposal?.office || "Office 1", totalSeats: numericString(initialProposal?.totalSeats, "1"), pricePerSeat: numericString(initialProposal?.pricePerSeat, "0"), discount: numericString(initialProposal?.discount, "0"), monthlyMembership: numericString(initialProposal?.monthlyMembership, "0") }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const total = useMemo(() => Math.max(0, amountValue(watch("totalSeats")) * amountValue(watch("pricePerSeat")) - amountValue(watch("discount"))), [watch("totalSeats"), watch("pricePerSeat"), watch("discount")]);
  const error = (field: string) => formState.errors[field]?.message;
  const save = (values: any) => onSave({ ...values, proposalNumber: values.proposalNumber || undefined, total: money(total), selection: selectionForOffice(values.office) });
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">{initialProposal ? "Edit proposal" : "New proposal"}</span><h2>{initialProposal ? "Edit proposal" : "Create proposal"}</h2></div></div><form className="inline-form-grid" onSubmit={handleSubmit(save)}><label className="settings-label">Proposal number<Input {...register("proposalNumber")} placeholder="Generated on save" readOnly /></label><label className="settings-label">Date of proposal<Input className={error("date") ? "has-error" : ""} type="date" {...register("date")} />{error("date") && <span className="lead-form-error">{error("date")}</span>}</label><label className="settings-label">Title<Input className={error("title") ? "has-error" : ""} {...register("title")} placeholder="Workspace proposal" />{error("title") && <span className="lead-form-error">{error("title")}</span>}</label><label className="settings-label">Subtitle<Input {...register("subtitle")} placeholder="A tailored workspace plan" /></label><ProposalRecipientSelect leads={leads} members={members} value={recipientId} onChange={(recipient: any) => { setRecipientId(recipient.id); setValue("account", recipient.label, { shouldDirty: true }); }} />{error("account") && <span className="lead-form-error">{error("account")}</span>}<label className="settings-label">Office Number<Input {...register("office")} placeholder="Office 11" /></label><label className="settings-label">Total seats<Input className={error("totalSeats") ? "has-error" : ""} type="text" {...numericField(register, "totalSeats", true)} />{error("totalSeats") && <span className="lead-form-error">{error("totalSeats")}</span>}</label><label className="settings-label">Price per seat<Input className={error("pricePerSeat") ? "has-error" : ""} {...numericField(register, "pricePerSeat")} placeholder="0" />{error("pricePerSeat") && <span className="lead-form-error">{error("pricePerSeat")}</span>}</label><label className="settings-label">Total<Input value={money(total)} readOnly /></label><label className="settings-label">Discount<Input {...numericField(register, "discount")} placeholder="0" /></label><label className="settings-label">Monthly membership<Input {...numericField(register, "monthlyMembership")} placeholder="0" /></label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><ReceiptText size={15} /> {initialProposal ? "Save changes" : "Create proposal"}</Button></div></form></div>;
}

function ProposalTemplatePreview({ proposal, onChange, frameRef }: any) {
  const data = useMemo(() => ({ proposal_number: proposal.proposalNumber, date: proposal.date, seat_title: proposal.title || `${proposal.totalSeats} seats`, subtitle: proposal.subtitle || "", client_name: proposal.account || "", office: proposal.office || "", seats: Math.max(1, amountValue(proposal.totalSeats)), rate: amountValue(proposal.pricePerSeat), discount: amountValue(proposal.discount), selection: proposal.selection || selectionForOffice(proposal.office) }), [proposal]);
  const sendData = () => frameRef.current?.contentWindow?.postMessage({ type: "proposal-template-data", payload: data }, "*");
  useEffect(() => { const handleMessage = (event: MessageEvent) => { if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "proposal-template-change") return; onChange(event.data.payload); }; window.addEventListener("message", handleMessage); return () => window.removeEventListener("message", handleMessage); }, [onChange]);
  return <iframe ref={frameRef} className="proposal-template-frame" src="/proposal-template/preview.html" title="Proposal template preview" onLoad={sendData} />;
}

export default function ProposalsPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("proposals.read");
  const canWrite = useHasPermission("proposals.write");
  const [proposals, setProposals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendingProposal, setSendingProposal] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  const [loadError, setLoadError] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!canView) {
        if (!cancelled) {
          setProposals([]);
          setLeads([]);
          setMembers([]);
        }
        return;
      }
      const saved = getDemoValue("proposals");
      const savedLeads = getDemoValue("leads");
      const savedMembers = getDemoValue("members");
      const cachedLeads = Array.isArray(savedLeads) ? savedLeads : [];
      const cachedMembers = Array.isArray(savedMembers) ? savedMembers : [];

      if (!isSupabaseLeadsEnabled()) {
        if (cancelled) return;
        if (Array.isArray(saved)) setProposals(saved);
        if (cachedLeads.length) setLeads(cachedLeads);
        if (cachedMembers.length) setMembers(cachedMembers);
        return;
      }

      try {
        const [proposalRows, leadRows, memberRows] = await Promise.all([
          fetchSupabaseProposals(),
          fetchSupabaseLeads(),
          fetchSupabaseMembers(),
        ]);
        if (cancelled) return;
        const normalizedLeads = leadRows.map(mapSupabaseLeadToOsLead).map((lead) => {
          const cached = cachedLeads.find((item) => item.id === lead.id);
          return cached ? { ...lead, company: cached.company ?? lead.company } : lead;
        });
        setProposals(proposalRows);
        setLeads(normalizedLeads);
        setMembers(memberRows);
        setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Proposals could not be loaded from Supabase.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [canView]);
  const persist = (next: any[]) => { setProposals(next); saveDemoValue("proposals", next); };
  const saveProposal = async (form: any) => {
    if (!canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot create or edit proposals." }); return; }
    if (!form?.account?.trim() || !form?.title?.trim()) { showToast({ variant: "error", title: "Proposal was not saved", message: "Choose a recipient and add a proposal title." }); return; }
    const leadRecipient = leads.find((lead) => `${lead.name} - ${lead.company || "No company"}` === form.account);
    const memberRecipient = members.find((member) => `${member.member} - ${member.company || "No company"}` === form.account);
    if (isSupabaseLeadsEnabled() && !leadRecipient && !memberRecipient) {
      showToast({ variant: "error", title: "Proposal was not saved", message: "Choose a valid lead or member from the recipient list." });
      return;
    }

    const wasEditing = Boolean(editing);
    const proposalInput = {
      ...form,
      id: editing?.id,
      proposalNumber: editing?.proposalNumber || form.proposalNumber,
      status: editing?.status || "Draft",
      leadId: leadRecipient?.id || null,
      memberId: memberRecipient?.id || null,
      recipientName: form.account,
      recipientEmail: leadRecipient?.email || memberRecipient?.email || editing?.recipientEmail || "",
      recipientPhone: leadRecipient?.phone || memberRecipient?.phone || editing?.recipientPhone || "",
    };

    try {
      if (isSupabaseLeadsEnabled()) {
        const savedProposal = wasEditing && editing?.id
          ? await updateSupabaseProposal(editing.id, proposalInput)
          : await createSupabaseProposal(proposalInput);
        const next = wasEditing
          ? proposals.map((item) => item.id === savedProposal.id ? savedProposal : item)
          : [savedProposal, ...proposals];
        setProposals(next);
        setCreating(false); setEditing(null); setSelected(savedProposal);
        showToast({ variant: "success", title: wasEditing ? "Proposal updated" : "Proposal created", message: `${savedProposal.proposalNumber} was saved to Supabase.` });
        return;
      }

      const proposal = { ...proposalInput, proposalNumber: form.proposalNumber || `PROP-2026-${1001 + proposals.length}` };
      persist(wasEditing ? proposals.map((item) => item.proposalNumber === editing.proposalNumber ? proposal : item) : [proposal, ...proposals]);
      setCreating(false); setEditing(null); setSelected(proposal);
      showToast({ variant: "success", title: wasEditing ? "Proposal updated" : "Proposal created", message: `${proposal.proposalNumber} was saved successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: "Proposal was not saved", message: error?.message || "Proposal could not be saved." });
    }
  };
  const updatePreview = (payload: any) => { if (!canWrite || !selected || !payload || typeof payload !== "object") return; const seats = Math.max(1, Math.floor(Number(payload.seats) || amountValue(selected.totalSeats) || 1)); const rate = Math.max(0, Number(payload.rate) || amountValue(selected.pricePerSeat)); const discount = Math.min(Math.max(0, Number(payload.discount) || 0), seats * rate); const next = { ...selected, selection: payload.selection, total: money(Math.max(0, seats * rate - discount)), totalSeats: String(seats), pricePerSeat: money(rate), discount: money(discount) }; setSelected(next); persist(proposals.map((item) => item.proposalNumber === selected.proposalNumber ? next : item)); };
  const markSelectedAsSent = async () => { if (!selected) return; const next = canWrite && isSupabaseLeadsEnabled() && selected.id ? await updateSupabaseProposalStatus(selected.id, "Sent") : { ...selected, status: "Sent" }; setSelected(next); if (canWrite && isSupabaseLeadsEnabled() && selected.id) setProposals(proposals.map((item) => item.id === selected.id ? next : item)); else persist(proposals.map((item) => item.proposalNumber === selected.proposalNumber ? next : item)); return next; };
  const savePdf = () => { frameRef.current?.contentWindow?.postMessage({ type: "proposal-template-action", action: "save-pdf" }, "*"); showToast({ variant: "success", title: "Save as PDF", message: "The print dialog was opened. Choose ‘Save as PDF’ to download the proposal." }); };
  const sendPdf = () => { if (selected) setSendOpen(true); };
  const sendProposal = async (channel: "whatsapp" | "email") => {
    if (!selected || sendingProposal) return;
    if (!canWrite) {
      showToast({ variant: "error", title: "View-only access", message: "Your account cannot send proposals." });
      return;
    }
    setSendingProposal(true);
    try {
      const { filename, content, pdf } = await renderProposalPdf(frameRef, selected);
      if (channel === "whatsapp") {
        const recipientPhone = whatsappPhone(selected.recipientPhone);
        if (!recipientPhone) throw new Error("This recipient does not have a phone number saved.");
        pdf.save(filename);
        const next = await markSelectedAsSent();
        const message = `Hello ${next?.account || selected.account}, please find proposal ${selected.proposalNumber} from The Cubicle attached.`;
        setSendOpen(false);
        window.open(`https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        showToast({ variant: "success", title: "WhatsApp opened", message: `${filename} was downloaded. Attach it to the chat before sending.` });
        return;
      }

      if (!isSupabaseLeadsEnabled() || !selected.id) throw new Error("This proposal is not synchronized with Supabase yet.");
      const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again before sending a proposal.");
      const response = await fetch(`/api/proposals/${encodeURIComponent(selected.id)}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ attachment: { filename, content }, template: proposalEmailTemplate() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The proposal email could not be delivered.");
      const next = { ...selected, status: "Sent" };
      setSelected(next);
      setProposals(proposals.map((item) => item.id === selected.id ? next : item));
      setSendOpen(false);
      showToast({ variant: "success", title: "Proposal sent", message: `${selected.proposalNumber} was delivered to ${result.delivery?.recipientEmail || "the recipient"} with a PDF attachment.` });
    } catch (error) {
      showToast({ variant: "error", title: "Proposal was not sent", message: error?.message || "The proposal could not be delivered." });
    } finally {
      setSendingProposal(false);
    }
  };
  const filteredProposals = useMemo(() => proposals.filter((proposal) => !monthFilter || String(proposal.date || "").startsWith(monthFilter)), [proposals, monthFilter]);
  if (!canView) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Proposals</h1><p className="muted-copy">Proposal records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Proposals — View access.</div></motion.div></PageShell>;
  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Proposals</h1><p className="muted-copy">Prepare workspace proposals for leads and members.</p>{loadError ? <p className="lead-form-error">{loadError}</p> : null}</div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>{canWrite ? <Button onClick={() => setCreating(true)}><PlusCircle size={16} /> Create proposal</Button> : <span className="read-only-label">View only — printing enabled</span>}</div></div><section className="stat-grid finance-stat-grid proposal-kpi-grid"><KpiCard icon={<FileText size={18} />} label="Total proposals" value={filteredProposals.length} detail={isSupabaseLeadsEnabled() ? "From Supabase" : "Created in this session"} /></section><div className="section-heading"><div><h2>Proposal register</h2><p className="muted-copy">Select a proposal to preview, print, or send it.</p></div></div><DataTable columns={createProposalColumns(setSelected, setEditing, canWrite)} data={filteredProposals} onRowClick={setSelected} emptyMessage="No proposals created yet." /><Dialog open={creating && canWrite} onClose={() => { setCreating(false); setEditing(null); }} ariaLabel={editing ? "Edit proposal" : "Create proposal"}><ProposalForm leads={leads} members={members} initialProposal={editing} onCancel={() => { setCreating(false); setEditing(null); }} onSave={saveProposal} /></Dialog><Dialog open={Boolean(selected)} onClose={() => { setSelected(null); setSendOpen(false); }} ariaLabel="Proposal preview">{selected ? <div className="dialog-content proposal-preview-dialog"><ProposalTemplatePreview frameRef={frameRef} proposal={selected} onChange={updatePreview} /><div className="dialog-actions invoice-preview-actions proposal-pdf-actions"><Button variant="ghost" onClick={savePdf}><Download size={15} /> Save PDF</Button><Button onClick={sendPdf} disabled={sendingProposal || !canWrite}><Send size={15} /> {sendingProposal ? "Preparing..." : "Send PDF"}</Button><Button variant="ghost" onClick={() => setSelected(null)}><X size={15} /> Close PDF</Button></div></div> : null}</Dialog><Dialog open={sendOpen} onClose={() => !sendingProposal && setSendOpen(false)} ariaLabel="Send proposal PDF"><div className="dialog-content proposal-send-dialog"><div className="card-heading"><div><h2>Send proposal PDF</h2><p className="muted-copy">Email sends automatically with the saved template and PDF attachment.</p></div></div>{sendingProposal ? <div className="proposal-send-progress" role="status" aria-live="polite"><span className="proposal-send-spinner" aria-hidden="true" /><strong>Sending proposal…</strong><p>Preparing the PDF and delivering the email. Please keep this window open.</p></div> : <div className="proposal-send-options"><button type="button" className="proposal-send-option" onClick={() => sendProposal("whatsapp")}><MessageCircle size={18} /><span><strong>WhatsApp</strong><small>Download the PDF and open a ready-to-send chat.</small></span></button><button type="button" className="proposal-send-option" onClick={() => sendProposal("email")}><Mail size={18} /><span><strong>Email</strong><small>Send automatically through the registered recipient email.</small></span></button></div>}<div className="dialog-actions proposal-send-actions"><Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sendingProposal}>Cancel</Button></div></div></Dialog></motion.div></PageShell>;
}
