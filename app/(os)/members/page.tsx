"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { ArrowUpRight, Building2, ChevronDown, CirclePlus, CreditCard, Pencil, UserRound } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { z } from "zod";

const memberSchema = z.object({
  leadId: z.string().optional(),
  member: z.string().trim().min(1, "Enter the member's name."),
  company: z.string().optional(),
  space: z.string().optional(),
  rent: z.string().trim().min(1, "Enter the monthly rent."),
  deposit: z.string().optional(),
  billingStartDate: z.string().min(1, "Choose a billing start date."),
  dueDay: z.string().refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."),
  joined: z.string().min(1, "Choose a joining date.")
});

const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name.")
});

// TITLE: MEMBER TABLE
function createMemberColumns(onView, onEdit, onToggleStatus) { const columnHelper = createColumnHelper<any>(); return [columnHelper.accessor("member", { header: "Member", cell: ({ row }) => <div className="table-primary"><strong>{row.original.member}</strong><span>{row.original.joined}</span></div> }), columnHelper.accessor("company", { header: "Company" }), columnHelper.accessor("space", { header: "Assigned space" }), columnHelper.accessor("rent", { header: "Monthly rent" }), columnHelper.accessor("status", { header: "Account status", cell: ({ getValue }) => <span className={`status-tag status-${String(getValue() || "Inactive").toLowerCase().replaceAll(" ", "-")}`}>{getValue() || "Inactive"}</span> }), columnHelper.display({ id: "actions", header: "", cell: ({ row }) => <div className="member-primary-actions"><button className="member-action-edit" type="button" onClick={() => onEdit(row.original)} title="Edit member space" aria-label={`Edit ${row.original.member}`}><Pencil size={15} /> Edit space</button><button className="member-action-toggle" type="button" onClick={() => onToggleStatus(row.original)}>{row.original.status === "Active" ? "Deactivate" : "Activate"}</button><button className="member-action-ledger" type="button" onClick={() => onView(row.original)}>View ledger <ArrowUpRight size={14} /></button></div> })]; }

// TITLE: MEMBER LEDGER MODAL
// TITLE: MEMBER FORM
function MemberLeadSelect({ leads, value, onChange }) { const [open, setOpen] = useState(false); const selected = leads.find((lead) => lead.id === value); const conversionLeads = leads.filter((lead) => ["Quotation Approved", "Proposal Approved"].includes(normalizeLeadStage(lead.stage, lead))); return <div className="settings-label lead-source-field member-lead-select"><span>Member from approved quotation</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? selected.name : "Create manually"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu"><button type="button" className={!value ? "is-selected" : ""} onClick={() => { onChange(""); setOpen(false); }}>Create manually</button>{conversionLeads.length ? conversionLeads.map((lead) => <button type="button" key={lead.id} className={value === lead.id ? "is-selected" : ""} onClick={() => { onChange(lead.id); setOpen(false); }}>{lead.name} · {lead.company || "No company"}</button>) : <span className="dropdown-empty">No leads with an approved quotation</span>}</div>}</div></div>; }

function MemberSpaceSelect({ spaces, value, onChange, currentMemberId = "" }) { const [open, setOpen] = useState(false); const selected = spaces.find((space) => space.id === value); return <div className="settings-label lead-source-field member-space-select"><span>Assigned space</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? selected.label : "Unassigned"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu"><button type="button" className={!value ? "is-selected" : ""} onClick={() => { onChange(""); setOpen(false); }}>Unassigned</button>{spaces.filter((space) => isAssignableWorkspace(space) && (space.status === "available" || space.id === value || space.memberId === currentMemberId)).map((space) => <button type="button" key={space.id} className={value === space.id ? "is-selected" : ""} onClick={() => { onChange(space.id, space); setOpen(false); }}>{space.label} · {space.zone}</button>)}</div>}</div></div>; }

function MemberForm({ leads, spaces, onCancel, onSave, initialMember = null }) {
  const formApi = useForm({ resolver: zodResolver(memberSchema), defaultValues: { leadId: initialMember?.leadId || "", member: initialMember?.member || "", company: initialMember?.company || "", space: initialMember?.spaceId || "", rent: initialMember?.rent || "PKR 0", deposit: initialMember?.deposit || "PKR 0", joined: initialMember?.joined || "2026-10-05", billingStartDate: initialMember?.billingStartDate || initialMember?.joined || "2026-10-05", dueDay: String(initialMember?.dueDay || 5) }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  const selectLead = (leadId) => {
    const lead = leads.find((item) => item.id === leadId);
    setValue("leadId", leadId, { shouldDirty: true, shouldValidate: true });
    setValue("member", lead ? lead.name : "", { shouldDirty: true, shouldValidate: true });
    setValue("company", lead ? lead.company || "" : "", { shouldDirty: true });
  };
  const onSubmit = (values) => onSave({ ...values, id: initialMember?.id || `member-${Date.now()}`, status: initialMember?.status || "Active", joined: values.joined, spaceId: values.space, space: spaces.find((item) => item.id === values.space)?.label || "Unassigned", dueDay: Number(values.dueDay) || 5 });
  const rent = Number(String(watch("rent") || "0").replace(/[^0-9.-]/g, "")) || 0;
  const deposit = Number(String(watch("deposit") || "0").replace(/[^0-9.-]/g, "")) || 0;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">{initialMember ? "Edit member" : "New member"}</span><h2>{initialMember ? "Edit member" : "Add member"}</h2></div></div><form className="inline-form-grid" onSubmit={handleSubmit(onSubmit)}><MemberLeadSelect leads={leads} value={watch("leadId")} onChange={selectLead} /><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Company<Input {...register("company")} /></label><MemberSpaceSelect spaces={spaces} value={watch("space")} currentMemberId={initialMember?.id} onChange={(value, space) => { setValue("space", value, { shouldDirty: true }); if (space?.monthlyRent && (!initialMember || value !== initialMember.spaceId)) setValue("rent", space.monthlyRent, { shouldDirty: true }); }} /><label className="settings-label">Monthly rent<Input className={error("rent") ? "has-error" : ""} {...register("rent")} aria-invalid={Boolean(error("rent"))} />{error("rent") && <span className="lead-form-error">{error("rent")}</span>}</label><label className="settings-label">Security deposit<Input {...register("deposit")} placeholder="PKR 0" />{deposit > rent ? <span className="lead-form-warning">Security deposit is higher than monthly rent. Monthly rent is unchanged.</span> : null}</label><label className="settings-label">Billing start date<Input className={error("billingStartDate") ? "has-error" : ""} type="date" {...register("billingStartDate")} />{error("billingStartDate") && <span className="lead-form-error">{error("billingStartDate")}</span>}</label><label className="settings-label">Due day<Input className={error("dueDay") ? "has-error" : ""} type="number" min="1" max="31" {...register("dueDay")} />{error("dueDay") && <span className="lead-form-error">{error("dueDay")}</span>}</label><label className="settings-label">Joining date<Input className={error("joined") ? "has-error" : ""} type="date" {...register("joined")} />{error("joined") && <span className="lead-form-error">{error("joined")}</span>}</label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><CirclePlus size={15} /> {initialMember ? "Save changes" : "Save member"}</Button></div></form></div>;
}

// TITLE: COMPANY FORM
function CompanyForm({ onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(companySchema), defaultValues: { name: "" }, mode: "onBlur" });
  const { register, handleSubmit, formState } = formApi;
  const error = formState.errors.name?.message;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">New company</span><h2>Add company</h2></div></div><form onSubmit={handleSubmit((values) => onSave({ id: `company-${Date.now()}`, name: values.name.trim(), status: "Active" }))}><label className="settings-label">Company name<Input className={error ? "has-error" : ""} {...register("name")} aria-invalid={Boolean(error)} />{error && <span className="lead-form-error">{error}</span>}</label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Building2 size={15} /> Save company</Button></div></form></div>;
}

// TITLE: MEMBERS AND COMPANIES PAGE
export default function MembersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [members, setMembers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [formMode, setFormMode] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [monthFilter, setMonthFilter] = useState("");
  useEffect(() => { const savedMembers = getDemoValue("members"); const savedLeads = getDemoValue("leads"); if (Array.isArray(savedMembers)) setMembers(savedMembers); if (Array.isArray(savedLeads)) setLeads(savedLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) }))); setSpaces(getWorkspaceRecords()); }, []);

  // TITLE: MEMBER ACTIONS
  const addMember = (member) => { const sourceLead = member.leadId ? leads.find((lead) => lead.id === member.leadId) : null; if (!editingMember && sourceLead && !["Quotation Approved", "Proposal Approved"].includes(normalizeLeadStage(sourceLead.stage, sourceLead))) { showToast({ variant: "error", title: "Member was not added", message: "Only leads with an approved quotation can be converted." }); return; } const previous = editingMember ? members.find((item) => item.id === editingMember.id) : null; const nextMembers = editingMember ? members.map((item) => item.id === member.id ? member : item) : [member, ...members]; setMembers(nextMembers); saveDemoValue("members", nextMembers); const nextSpaces = spaces.map((space) => { if (previous?.spaceId && previous.spaceId !== member.spaceId && space.id === previous.spaceId) return { ...space, occupant: "", company: "", memberId: "", status: "available" }; return space.id === member.spaceId ? { ...space, occupant: member.member, company: member.company || "Unassigned", memberId: member.id, status: member.status === "Inactive" ? "available" : "occupied", monthlyRent: member.rent, billingStartDate: member.billingStartDate || member.joined, dueDay: member.dueDay || 5, gracePeriodDays: 3 } : space; }); setSpaces(nextSpaces); saveDemoValue("workspaces", nextSpaces); getWorkspaceRecords(); if (member.leadId && !editingMember) { const nextLeads = leads.map((lead) => lead.id === member.leadId ? transitionLead(lead, { type: "converted" }) : lead); setLeads(nextLeads); saveDemoValue("leads", nextLeads); } setFormMode(null); setEditingMember(null); showToast({ variant: "success", title: editingMember ? "Member updated" : "Member added", message: `${member.member} was saved successfully.` }); };
  const toggleMemberStatus = (member) => { const nextStatus = member.status === "Active" ? "Inactive" : "Active"; const nextMembers = members.map((item) => item.id === member.id ? { ...item, status: nextStatus } : item); setMembers(nextMembers); saveDemoValue("members", nextMembers); const nextSpaces = spaces.map((space) => space.memberId === member.id ? { ...space, status: nextStatus === "Active" ? "occupied" : "available" } : space); setSpaces(nextSpaces); saveDemoValue("workspaces", nextSpaces); getWorkspaceRecords(); showToast({ variant: "success", title: `Member ${nextStatus.toLowerCase()}`, message: `${member.member} is now ${nextStatus.toLowerCase()}.` }); };
  const addCompany = (company) => { const companies = getDemoValue("companies") || []; saveDemoValue("companies", [company, ...companies]); setFormMode(null); showToast({ variant: "success", title: "Company added", message: `${company.name} was added successfully.` }); };
  const activeMembers = useMemo(() => members.filter((member) => member.status === "Active").length, [members]);
  const joiningSoon = useMemo(() => members.filter((member) => member.status === "Joining soon").length, [members]);
  const securityDeposits = useMemo(() => members.reduce((total, member) => total + (Number(String(member.deposit || "0").replace(/[^0-9.-]/g, "")) || 0), 0), [members]);
  const formattedDeposits = `PKR ${securityDeposits.toLocaleString("en-PK")}`;
  const filteredMembers = useMemo(() => members.filter((member) => !monthFilter || String(member.joined || "").startsWith(monthFilter)), [members, monthFilter]);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Members & Companies</h1><p className="muted-copy">Manage people, companies, spaces, ledgers and move-out actions.</p></div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label><Button onClick={() => { setEditingMember(null); setFormMode("member"); }}><CirclePlus size={16} /> Add member</Button></div></div><section className="stat-grid module-stats"><KpiCard icon={<UserRound size={18} />} label="Active members" value={activeMembers} detail={`${joiningSoon} joining soon`} /><KpiCard icon={<CreditCard size={18} />} label="Security deposits" value={formattedDeposits} detail="Recorded member deposits" /></section><div className="section-heading"><div><h2>Member directory</h2><p className="muted-copy">Select a member row to open payment history and account details.</p></div><button className="filter-button" type="button">Active members</button></div><DataTable columns={createMemberColumns((member) => router.push(`/members/${member.id}`), (member) => { setEditingMember(member); setFormMode("member"); }, toggleMemberStatus)} data={filteredMembers} onRowClick={(member) => router.push(`/members/${member.id}`)} /><Dialog open={Boolean(formMode)} onClose={() => { setFormMode(null); setEditingMember(null); }} ariaLabel={editingMember ? "Edit member" : "Add member"}>{formMode === "member" ? <MemberForm key={editingMember?.id || "new-member"} leads={leads} spaces={spaces} initialMember={editingMember} onCancel={() => { setFormMode(null); setEditingMember(null); }} onSave={addMember} /> : null}</Dialog></motion.div></PageShell>;
}
