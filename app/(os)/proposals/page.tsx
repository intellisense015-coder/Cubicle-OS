"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronDown, FileText, Pencil, PlusCircle, ReceiptText } from "lucide-react";
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
import { z } from "zod";

const amountValue = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const money = (value: number) => `PKR ${value.toLocaleString("en-PK")}`;
const defaultSelection = { x: 76.9047, y: 73.2135, width: 10.833, height: 8.923 };
const selectionForOffice = (office: unknown) => String(office || "").trim().toLowerCase().replace("office", "").trim() === "1" ? defaultSelection : defaultSelection;

const proposalSchema = z.object({
  proposalNumber: z.string().optional(),
  date: z.string().min(1, "Choose a proposal date."),
  title: z.string().trim().min(1, "Enter a proposal title."),
  subtitle: z.string().optional(),
  account: z.string().trim().min(1, "Choose a lead or member."),
  totalSeats: z.string().min(1, "Enter the number of seats."),
  pricePerSeat: z.string().min(1, "Enter the price per seat."),
  discount: z.string().optional(),
  monthlyMembership: z.string().optional()
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

function createProposalColumns(onOpen: (proposal: any) => void, onEdit: (proposal: any) => void) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("proposalNumber", { header: "Proposal / account", cell: ({ row }) => <div className="table-primary"><strong>{row.original.proposalNumber}</strong><span>{row.original.account}</span></div> }),
    columnHelper.accessor("date", { header: "Date" }),
    columnHelper.accessor("title", { header: "Title" }),
    columnHelper.accessor("total", { header: "Total", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => { const status = getValue() === "Approved" || getValue() === "Accepted" ? "Approved" : "Sent"; return <StatusBadge tone={status === "Approved" ? "success" : "accent"}>{status}</StatusBadge>; } }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open ${row.original.proposalNumber}`} title="Open proposal"><FileText size={16} /></button><button className="action-icon-btn" type="button" onClick={() => onEdit(row.original)} aria-label={`Edit ${row.original.proposalNumber}`} title="Edit proposal"><Pencil size={16} /></button></div> }),
  ];
}

function ProposalForm({ leads, members, initialProposal, onCancel, onSave }: any) {
  const initialLead = leads.find((lead: any) => `${lead.name} - ${lead.company || "No company"}` === initialProposal?.account);
  const initialMember = members.find((member: any) => `${member.member} - ${member.company || "No company"}` === initialProposal?.account);
  const [recipientId, setRecipientId] = useState(initialLead ? `lead:${initialLead.id}` : initialMember ? `member:${initialMember.id}` : "");
  const formApi = useForm({ resolver: zodResolver(proposalSchema), defaultValues: { proposalNumber: initialProposal?.proposalNumber || "", date: initialProposal?.date || "2026-10-05", title: initialProposal?.title || "", subtitle: initialProposal?.subtitle || "", account: initialProposal?.account || "", office: initialProposal?.office || "Office 1", totalSeats: initialProposal?.totalSeats || "1", pricePerSeat: initialProposal?.pricePerSeat || "PKR 0", discount: initialProposal?.discount || "PKR 0", monthlyMembership: initialProposal?.monthlyMembership || "PKR 0" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const total = useMemo(() => Math.max(0, amountValue(watch("totalSeats")) * amountValue(watch("pricePerSeat")) - amountValue(watch("discount"))), [watch("totalSeats"), watch("pricePerSeat"), watch("discount")]);
  const error = (field: string) => formState.errors[field]?.message;
  const save = (values: any) => onSave({ ...values, proposalNumber: values.proposalNumber || undefined, total: money(total), selection: initialProposal?.selection || selectionForOffice(values.office) });
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">{initialProposal ? "Edit proposal" : "New proposal"}</span><h2>{initialProposal ? "Edit proposal" : "Create proposal"}</h2></div></div><form className="inline-form-grid" onSubmit={handleSubmit(save)}><label className="settings-label">Proposal number<Input {...register("proposalNumber")} value={watch("proposalNumber") || "Generated on save"} readOnly /></label><label className="settings-label">Date of proposal<Input className={error("date") ? "has-error" : ""} type="date" {...register("date")} />{error("date") && <span className="lead-form-error">{error("date")}</span>}</label><label className="settings-label">Title<Input className={error("title") ? "has-error" : ""} {...register("title")} placeholder="Workspace proposal" />{error("title") && <span className="lead-form-error">{error("title")}</span>}</label><label className="settings-label">Subtitle<Input {...register("subtitle")} placeholder="A tailored workspace plan" /></label><ProposalRecipientSelect leads={leads} members={members} value={recipientId} onChange={(recipient: any) => { setRecipientId(recipient.id); setValue("account", recipient.label, { shouldDirty: true }); }} />{error("account") && <span className="lead-form-error">{error("account")}</span>}<label className="settings-label">Total seats<Input className={error("totalSeats") ? "has-error" : ""} type="number" min="1" {...register("totalSeats")} />{error("totalSeats") && <span className="lead-form-error">{error("totalSeats")}</span>}</label><label className="settings-label">Price per seat<Input className={error("pricePerSeat") ? "has-error" : ""} {...register("pricePerSeat")} placeholder="PKR 0" />{error("pricePerSeat") && <span className="lead-form-error">{error("pricePerSeat")}</span>}</label><label className="settings-label">Total<Input value={money(total)} readOnly /></label><label className="settings-label">Discount<Input {...register("discount")} placeholder="PKR 0" /></label><label className="settings-label">Monthly membership<Input {...register("monthlyMembership")} placeholder="PKR 0" /></label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><ReceiptText size={15} /> {initialProposal ? "Save changes" : "Create proposal"}</Button></div></form></div>;
}

function ProposalTemplatePreview({ proposal, onChange }: any) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const data = useMemo(() => ({ proposal_number: proposal.proposalNumber, date: proposal.date, seat_title: proposal.title || `${proposal.totalSeats} seats`, subtitle: proposal.subtitle || "", client_name: proposal.account || "", office: proposal.office || "", seats: Math.max(1, amountValue(proposal.totalSeats)), rate: amountValue(proposal.pricePerSeat), discount: amountValue(proposal.discount), selection: proposal.selection || selectionForOffice(proposal.office) }), [proposal]);
  const sendData = () => frameRef.current?.contentWindow?.postMessage({ type: "proposal-template-data", payload: data }, "*");
  useEffect(() => { const handleMessage = (event: MessageEvent) => { if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "proposal-template-change") return; onChange(event.data.payload); }; window.addEventListener("message", handleMessage); return () => window.removeEventListener("message", handleMessage); }, [onChange]);
  return <iframe ref={frameRef} className="proposal-template-frame" src="/proposal-template/preview.html" title="Proposal template preview" onLoad={sendData} />;
}

export default function ProposalsPage() {
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  useEffect(() => { const saved = getDemoValue("proposals"); const savedLeads = getDemoValue("leads"); const savedMembers = getDemoValue("members"); if (Array.isArray(saved)) setProposals(saved); if (Array.isArray(savedLeads)) setLeads(savedLeads); if (Array.isArray(savedMembers)) setMembers(savedMembers); }, []);
  const persist = (next: any[]) => { setProposals(next); saveDemoValue("proposals", next); };
  const saveProposal = (form: any) => { if (!form?.account?.trim() || !form?.title?.trim()) { showToast({ variant: "error", title: "Proposal was not saved", message: "Choose a recipient and add a proposal title." }); return; } const proposal = { ...form, proposalNumber: form.proposalNumber || `PROP-2026-${1001 + proposals.length}`, status: editing?.status || "Sent" }; persist(editing ? proposals.map((item) => item.proposalNumber === editing.proposalNumber ? proposal : item) : [proposal, ...proposals]); setCreating(false); setEditing(null); setSelected(proposal); showToast({ variant: "success", title: editing ? "Proposal updated" : "Proposal created", message: `${proposal.proposalNumber} was saved successfully.` }); };
  const updatePreview = (payload: any) => { if (!selected) return; const next = { ...selected, selection: payload.selection, total: money(Math.max(0, Number(payload.seats) * Number(payload.rate) - Number(payload.discount))), totalSeats: String(payload.seats), pricePerSeat: money(Number(payload.rate)), discount: money(Number(payload.discount)) }; setSelected(next); persist(proposals.map((item) => item.proposalNumber === selected.proposalNumber ? next : item)); };
  const filteredProposals = useMemo(() => proposals.filter((proposal) => !monthFilter || String(proposal.date || "").startsWith(monthFilter)), [proposals, monthFilter]);
  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Proposals</h1><p className="muted-copy">Prepare workspace proposals for leads and members.</p></div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label><Button onClick={() => setCreating(true)}><PlusCircle size={16} /> Create proposal</Button></div></div><section className="stat-grid finance-stat-grid proposal-kpi-grid"><KpiCard icon={<FileText size={18} />} label="Total proposals" value={filteredProposals.length} detail="Created in this session" /></section><div className="section-heading"><div><h2>Proposal register</h2><p className="muted-copy">Select a proposal to preview or edit it.</p></div></div><DataTable columns={createProposalColumns(setSelected, setEditing)} data={filteredProposals} onRowClick={setSelected} emptyMessage="No proposals created yet." /><Dialog open={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} ariaLabel={editing ? "Edit proposal" : "Create proposal"}><ProposalForm leads={leads} members={members} initialProposal={editing} onCancel={() => { setCreating(false); setEditing(null); }} onSave={saveProposal} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Proposal preview">{selected ? <div className="dialog-content proposal-preview-dialog"><ProposalTemplatePreview proposal={selected} onChange={updatePreview} /><div className="dialog-actions invoice-preview-actions"><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div></div> : null}</Dialog></motion.div></PageShell>;
}
