"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { Building2, ChevronDown, CirclePlus, CreditCard, Pencil, UserRound } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { SelectField } from "@/components/ui/primitives";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { closeCurrentMembership, createMembershipPeriod, findMemberIdentityMatch, isActiveMember, memberCompanyKey, MEMBERSHIP_STATUS_OPTIONS, normalizeMembershipStatus, normalizePhone, reactivateMember, syncCompanyStatuses } from "@/lib/member-lifecycle";
import { numericField, numericString } from "@/lib/number-input";
import { useIsAdmin } from "@/lib/access-control";
import { z } from "zod";

const memberSchema = z.object({
  leadId: z.string().optional(), member: z.string().trim().min(1, "Enter the member's name."), phone: z.string().optional(), email: z.string().optional(), company: z.string().optional(), team: z.string().optional(), space: z.string().optional(), rent: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid numeric rent."), deposit: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid numeric deposit."), billingStartDate: z.string().min(1, "Choose a billing start date."), dueDay: z.string().regex(/^\d+$/, "Enter a whole-number due day.").refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."), joined: z.string().min(1, "Choose a joining date."), membershipStatus: z.enum(["Active", "Notice period"]), noticeStartDate: z.string().optional(), expectedLeavingDate: z.string().optional(), noticeNotes: z.string().optional(), reactivateMemberId: z.string().optional(),
}).superRefine((values, context) => {
  if (values.membershipStatus === "Notice period" && !values.noticeStartDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["noticeStartDate"], message: "Choose the notice start date." });
  if (values.membershipStatus === "Notice period" && !values.expectedLeavingDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedLeavingDate"], message: "Choose the expected leaving date." });
});

function addOneMonth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function MemberLeadSelect({ leads, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = leads.find((lead) => lead.id === value);
  const conversionLeads = leads.filter((lead) => ["Quotation Approved", "Proposal Approved"].includes(normalizeLeadStage(lead.stage, lead)));
  return <div className="settings-label lead-source-field"><span>Member from approved quotation</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? selected.name : "Create manually"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu"><button type="button" className={!value ? "is-selected" : ""} onClick={() => { onChange(""); setOpen(false); }}>Create manually</button>{conversionLeads.length ? conversionLeads.map((lead) => <button type="button" key={lead.id} className={value === lead.id ? "is-selected" : ""} onClick={() => { onChange(lead.id); setOpen(false); }}>{lead.name} · {lead.company || "No company"}</button>) : <span className="dropdown-empty">No leads with an approved quotation</span>}</div>}</div></div>;
}

function MemberSpaceSelect({ spaces, value, onChange, currentMemberId = "" }) {
  const [open, setOpen] = useState(false);
  const selected = spaces.find((space) => space.id === value);
  return <div className="settings-label lead-source-field"><span>Assigned space</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? selected.label : "Unassigned"}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu"><button type="button" className={!value ? "is-selected" : ""} onClick={() => { onChange(""); setOpen(false); }}>Unassigned</button>{spaces.filter((space) => isAssignableWorkspace(space) && (space.status === "available" || space.id === value || space.memberId === currentMemberId)).map((space) => <button type="button" key={space.id} className={value === space.id ? "is-selected" : ""} onClick={() => { onChange(space.id, space); setOpen(false); }}>{space.label} · {space.zone}</button>)}</div>}</div></div>;
}

function MemberForm({ leads, members, spaces, onCancel, onSave, initialMember = null }) {
  const initialMembershipStatus = normalizeMembershipStatus(initialMember?.membershipStatus);
  const initialNoticeStartDate = initialMember?.noticeStartDate || (initialMembershipStatus === "Notice period" ? initialMember?.billingStartDate || initialMember?.joined || "" : "");
  const initialExpectedLeavingDate = initialMember?.expectedLeavingDate || (initialMembershipStatus === "Notice period" ? addOneMonth(initialNoticeStartDate) : "");
  const formApi = useForm({ resolver: zodResolver(memberSchema), defaultValues: { leadId: initialMember?.leadId || "", member: initialMember?.member || "", phone: initialMember?.phone || "", email: initialMember?.email || "", company: initialMember?.company || "", team: initialMember?.team || "", space: initialMember?.spaceId || "", rent: numericString(initialMember?.rent, "0"), deposit: numericString(initialMember?.deposit, "0"), joined: initialMember?.joined || "2026-10-05", billingStartDate: initialMember?.billingStartDate || initialMember?.joined || "2026-10-05", dueDay: numericString(initialMember?.dueDay, "5"), membershipStatus: initialMembershipStatus, noticeStartDate: initialNoticeStartDate, expectedLeavingDate: initialExpectedLeavingDate, noticeNotes: initialMember?.noticeNotes || "", reactivateMemberId: "" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const [reactivationId, setReactivationId] = useState("");
  const error = (field) => formState.errors[field]?.message;
  const selectLead = (leadId) => { const lead = leads.find((item) => item.id === leadId); setValue("leadId", leadId, { shouldDirty: true, shouldValidate: true }); setValue("member", lead ? lead.name : "", { shouldDirty: true, shouldValidate: true }); setValue("company", lead ? lead.company || "" : "", { shouldDirty: true }); setValue("phone", lead ? lead.phone || "" : "", { shouldDirty: true }); setValue("email", lead ? lead.email || "" : "", { shouldDirty: true }); };
  const selectExisting = (id) => { setReactivationId(id); setValue("reactivateMemberId", id, { shouldDirty: true }); const existing = members.find((item) => item.id === id); if (existing) { setValue("member", existing.member || "", { shouldDirty: true }); setValue("phone", existing.phone || "", { shouldDirty: true }); setValue("email", existing.email || "", { shouldDirty: true }); setValue("company", existing.company || "", { shouldDirty: true }); setValue("team", existing.team || "", { shouldDirty: true }); setValue("space", existing.spaceId || "", { shouldDirty: true }); setValue("rent", existing.rent || "PKR 0", { shouldDirty: true }); setValue("deposit", existing.deposit || "PKR 0", { shouldDirty: true }); setValue("membershipStatus", normalizeMembershipStatus(existing.membershipStatus), { shouldDirty: true }); setValue("noticeStartDate", existing.noticeStartDate || "", { shouldDirty: true }); setValue("expectedLeavingDate", existing.expectedLeavingDate || "", { shouldDirty: true }); setValue("noticeNotes", existing.noticeNotes || "", { shouldDirty: true }); } };
  const handleMembershipStatusChange = (value) => { setValue("membershipStatus", value, { shouldDirty: true, shouldValidate: true }); if (value === "Notice period") { const start = watch("noticeStartDate") || new Date().toISOString().slice(0, 10); setValue("noticeStartDate", start, { shouldDirty: true, shouldValidate: true }); setValue("expectedLeavingDate", watch("expectedLeavingDate") || addOneMonth(start), { shouldDirty: true, shouldValidate: true }); } };
  const handleNoticeStartChange = (event) => { const start = event.target.value; setValue("noticeStartDate", start, { shouldDirty: true, shouldValidate: true }); if (watch("membershipStatus") === "Notice period") setValue("expectedLeavingDate", addOneMonth(start), { shouldDirty: true, shouldValidate: true }); };
  const onSubmit = (values) => onSave({ ...values, membershipStatus: normalizeMembershipStatus(values.membershipStatus), rent: numericString(values.rent, "0"), deposit: numericString(values.deposit, "0"), id: initialMember?.id || `member-${Date.now()}`, status: initialMember?.status || "Active", joined: values.joined, spaceId: values.space, space: spaces.find((item) => item.id === values.space)?.label || "Unassigned", dueDay: Number(values.dueDay) || 5, reactivateMemberId: reactivationId });
  const rent = Number(numericString(watch("rent"), "0")) || 0;
  const deposit = Number(numericString(watch("deposit"), "0")) || 0;
  const inactiveMembers = members.filter((member) => !isActiveMember(member) && member.id !== initialMember?.id);
  return <div className="dialog-content member-form-card"><div className="card-heading"><div><span className="seat-details-label">{initialMember ? "Edit member" : "New member"}</span><h2>{initialMember ? "Edit member" : "Add member"}</h2><p className="muted-copy">Keep contact details, billing, and workspace assignment together.</p></div></div><form className="inline-form-grid member-form-grid" onSubmit={handleSubmit(onSubmit)}>{!initialMember && <SelectField label="Reactivate existing member" value={reactivationId} onChange={(event) => selectExisting(event.target.value)}><option value="">Create a new member</option>{inactiveMembers.map((member) => <option key={member.id} value={member.id}>{member.member} · {member.company || "No company"}</option>)}</SelectField>}<MemberLeadSelect leads={leads} value={watch("leadId")} onChange={selectLead} /><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} placeholder="0300 1234567" /></label><label className="settings-label">Email address<Input type="email" {...register("email")} placeholder="member@example.com" /></label><label className="settings-label">Company<Input {...register("company")} /></label><label className="settings-label">Team<Input {...register("team")} placeholder="Finance team" /></label><MemberSpaceSelect spaces={spaces} value={watch("space")} currentMemberId={initialMember?.id} onChange={(value, space) => { setValue("space", value, { shouldDirty: true }); if (space?.monthlyRent && (!initialMember || value !== initialMember.spaceId)) setValue("rent", numericString(space.monthlyRent, "0"), { shouldDirty: true }); }} /><label className="settings-label">Monthly rent<Input className={error("rent") ? "has-error" : ""} {...numericField(register, "rent")} aria-invalid={Boolean(error("rent"))} />{error("rent") && <span className="lead-form-error">{error("rent")}</span>}</label><label className="settings-label">Security deposit<Input className={error("deposit") ? "has-error" : ""} {...numericField(register, "deposit")} placeholder="0" aria-invalid={Boolean(error("deposit"))} />{deposit > rent ? <span className="lead-form-warning">Security deposit is higher than monthly rent.</span> : null}{error("deposit") && <span className="lead-form-error">{error("deposit")}</span>}</label><label className="settings-label">Billing start date<Input className={error("billingStartDate") ? "has-error" : ""} type="date" {...register("billingStartDate")} />{error("billingStartDate") && <span className="lead-form-error">{error("billingStartDate")}</span>}</label><label className="settings-label">Due day<Input className={error("dueDay") ? "has-error" : ""} type="text" {...numericField(register, "dueDay", true)} minLength={1} maxLength={2} /><small className="field-help">Day of each month when the invoice becomes due.</small>{error("dueDay") && <span className="lead-form-error">{error("dueDay")}</span>}</label><label className="settings-label">Joining date<Input className={error("joined") ? "has-error" : ""} type="date" {...register("joined")} />{error("joined") && <span className="lead-form-error">{error("joined")}</span>}</label><section className="member-lifecycle-section"><div className="member-lifecycle-heading"><div><span className="settings-label-title">Membership details</span><p className="muted-copy">Set Active or Notice period. Deactivate the member separately when they leave.</p></div></div><div className="member-lifecycle-grid"><SelectField label="Membership status" value={watch("membershipStatus")} hint={error("membershipStatus")} onChange={(event) => handleMembershipStatusChange(event.target.value)}>{MEMBERSHIP_STATUS_OPTIONS.map((status) => <option value={status} key={status}>{status}</option>)}</SelectField><label className="settings-label">Notice start date<Input className={error("noticeStartDate") ? "has-error" : ""} type="date" value={watch("noticeStartDate")} onChange={handleNoticeStartChange} />{error("noticeStartDate") && <span className="lead-form-error">{error("noticeStartDate")}</span>}</label><label className="settings-label">Expected leaving date<Input className={error("expectedLeavingDate") ? "has-error" : ""} type="date" {...register("expectedLeavingDate")} />{error("expectedLeavingDate") && <span className="lead-form-error">{error("expectedLeavingDate")}</span>}</label><label className="settings-label member-notice-notes-field">Notice notes<Input {...register("noticeNotes")} placeholder="Reason or move-out notes" /></label></div></section><div className="dialog-actions member-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit"><CirclePlus size={15} /> {reactivationId ? "Reactivate member" : initialMember ? "Save changes" : "Save member"}</Button></div></form></div>;
}

function createMemberColumns(onView, onEdit, onToggleStatus, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("member", { header: "Member", cell: ({ row }) => <div className="table-primary"><strong>{row.original.member}</strong><span>{row.original.phone || row.original.joined}</span></div> }), columnHelper.accessor("company", { header: "Company", cell: ({ row }) => <div className="table-primary"><strong>{row.original.company || "Unassigned"}</strong><span>{row.original.team || "No team recorded"}</span></div> }), columnHelper.accessor("space", { header: "Assigned space" }), columnHelper.accessor("rent", { header: "Monthly rent" }), columnHelper.accessor("status", { header: "Account status", cell: ({ getValue }) => <span className={`status-tag ${isActiveMember({ status: getValue() }) ? "status-active" : "status-inactive"}`}>{isActiveMember({ status: getValue() }) ? "Activated" : "Deactivated"}</span> }), columnHelper.accessor("membershipStatus", { header: "Membership", cell: ({ getValue }) => { const value = normalizeMembershipStatus(getValue()); return <span className={`status-tag status-membership-${value === "Notice period" ? "notice" : "active"}`}>{value}</span>; } }), columnHelper.display({ id: "actions", header: canEdit ? "Action" : "Access", cell: ({ row }) => canEdit ? <div className="member-primary-actions"><button className="member-action-edit" type="button" onClick={() => onEdit(row.original)}><Pencil size={15} /> Edit</button><button className="member-action-toggle" type="button" onClick={() => onToggleStatus(row.original)}>{isActiveMember(row.original) ? "Deactivate" : "Activate"}</button><button className="member-action-ledger" type="button" onClick={() => onView(row.original)}>View ledger</button></div> : <span className="read-only-label">Read only</span> })];
}

function updateExistingMember(previous, values) {
  const placementChanged = memberCompanyKey(previous) !== memberCompanyKey(values) || String(previous?.team || "").trim().toLowerCase() !== String(values?.team || "").trim().toLowerCase();
  if (isActiveMember(previous) && placementChanged) return reactivateMember(closeCurrentMembership(previous), values);
  return { ...previous, ...values, id: previous.id, currentMembershipId: previous.currentMembershipId || createMembershipPeriod(values, previous).id };
}

export default function MembersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const canEdit = useIsAdmin();
  const [members, setMembers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [monthFilter, setMonthFilter] = useState("");
  const [memberView, setMemberView] = useState("active");

  useEffect(() => {
    const refresh = () => { const savedMembers = getDemoValue("members"); const savedLeads = getDemoValue("leads"); const savedCompanies = getDemoValue("companies"); setMembers(Array.isArray(savedMembers) ? savedMembers : []); setLeads(Array.isArray(savedLeads) ? savedLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) })) : []); setCompanies(Array.isArray(savedCompanies) ? savedCompanies : []); setSpaces(getWorkspaceRecords()); };
    refresh();
    const handleChange = (event) => { if (["members", "companies", "workspaces"].includes(event.detail?.key || "")) refresh(); };
    window.addEventListener("cubicle-demo-change", handleChange);
    return () => window.removeEventListener("cubicle-demo-change", handleChange);
  }, []);

  const persistMembers = (nextMembers) => { setMembers(nextMembers); saveDemoValue("members", nextMembers); };
  const persistCompanies = (nextCompanies) => { setCompanies(nextCompanies); saveDemoValue("companies", nextCompanies); };
  const closeForm = () => { setFormOpen(false); setEditingMember(null); };

  const updateSpacesForMember = (currentSpaces, member, previousMember = null) => currentSpaces.map((space) => {
    if (previousMember?.spaceId && previousMember.spaceId !== member.spaceId && space.id === previousMember.spaceId) return { ...space, occupant: "", company: "Unassigned", memberId: "", membershipPeriodId: "", membershipStatus: "Active", noticeStartDate: "", expectedLeavingDate: "", noticeNotes: "", status: "available" };
    if (space.id !== member.spaceId) return space;
    const membershipStatus = normalizeMembershipStatus(member.membershipStatus);
    return { ...space, occupant: member.member, company: member.company || "Unassigned", memberId: member.id, membershipPeriodId: member.currentMembershipId || "", membershipStatus, noticeStartDate: member.noticeStartDate || "", expectedLeavingDate: member.expectedLeavingDate || "", noticeNotes: member.noticeNotes || "", status: isActiveMember(member) ? "occupied" : "available", monthlyRent: member.rent, billingStartDate: member.billingStartDate || member.joined, dueDay: member.dueDay || 5, gracePeriodDays: 3 };
  });

  const saveMember = (values) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can edit member records." }); return; }
    const identityMatch = findMemberIdentityMatch(values, members, editingMember?.id);
    if (identityMatch && identityMatch.id !== values.reactivateMemberId) { showToast({ variant: "error", title: "Duplicate member contact", message: `That phone number or email belongs to ${identityMatch.member}. Select that member under Reactivate existing member.` }); return; }
    const existing = values.reactivateMemberId ? members.find((item) => item.id === values.reactivateMemberId) : null;
    const previous = editingMember ? members.find((item) => item.id === editingMember.id) : null;
    let savedMember;
    if (existing) savedMember = reactivateMember(existing, values);
    else if (previous) savedMember = updateExistingMember(previous, values);
    else { const period = createMembershipPeriod(values); savedMember = { ...values, status: "Active", firstJoined: values.joined, currentMembershipId: period.id, membershipPeriods: [period], contactHistory: { phones: values.phone ? [{ value: values.phone, normalized: normalizePhone(values.phone) }] : [] } }; }
    const matchingCompany = companies.find((company) => String(company.name || "").trim().toLowerCase() === memberCompanyKey(savedMember));
    let nextCompanies = matchingCompany ? companies : savedMember.company && savedMember.company !== "Unassigned" ? [{ id: `company-${Date.now()}`, name: savedMember.company, status: "Active" }, ...companies] : companies;
    const linkedCompany = nextCompanies.find((company) => String(company.name || "").trim().toLowerCase() === memberCompanyKey(savedMember));
    savedMember = { ...savedMember, companyId: linkedCompany?.id || "" };
    const nextMembers = previous ? members.map((item) => item.id === previous.id ? savedMember : item) : existing ? members.map((item) => item.id === existing.id ? savedMember : item) : [savedMember, ...members];
    nextCompanies = syncCompanyStatuses(nextCompanies, nextMembers);
    const nextSpaces = updateSpacesForMember(spaces, savedMember, previous || existing);
    persistMembers(nextMembers); persistCompanies(nextCompanies); setSpaces(nextSpaces); saveDemoValue("workspaces", nextSpaces);
    if (savedMember.leadId && !previous && !existing) { const nextLeads = leads.map((lead) => lead.id === savedMember.leadId ? transitionLead(lead, { type: "converted" }) : lead); setLeads(nextLeads); saveDemoValue("leads", nextLeads); }
    closeForm(); showToast({ variant: "success", title: existing ? "Member reactivated" : previous ? "Member updated" : "Member added", message: existing ? `${savedMember.member} returned with the same member record and a new membership period.` : `${savedMember.member} was saved successfully.` });
  };

  const toggleMemberStatus = (member) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can change member status." }); return; }
    if (isActiveMember(member)) {
      const closed = closeCurrentMembership(member);
      const nextMembers = members.map((item) => item.id === member.id ? { ...closed, status: "Inactive" } : item);
      const nextSpaces = spaces.map((space) => space.memberId === member.id ? { ...space, status: "available" } : space);
      persistMembers(nextMembers); setSpaces(nextSpaces); saveDemoValue("workspaces", nextSpaces); persistCompanies(syncCompanyStatuses(companies, nextMembers));
      showToast({ variant: "success", title: "Member deactivated", message: `${member.member} was deactivated and their membership period was closed.` }); return;
    }
    const restorableSpace = spaces.find((space) => space.memberId === member.id && (space.status === "available" || space.memberId === member.id));
    const reactivated = reactivateMember(member, { ...member, billingStartDate: new Date().toISOString().slice(0, 10), spaceId: restorableSpace?.id || "", space: restorableSpace?.label || "Unassigned" });
    const nextMembers = members.map((item) => item.id === member.id ? reactivated : item);
    const nextSpaces = updateSpacesForMember(spaces, reactivated);
    persistMembers(nextMembers); setSpaces(nextSpaces); saveDemoValue("workspaces", nextSpaces); persistCompanies(syncCompanyStatuses(companies, nextMembers));
    showToast({ variant: "success", title: "Member reactivated", message: restorableSpace ? `${member.member} is active again and their previous space was restored.` : `${member.member} is active again. Assign a new available space.` });
  };

  const filteredMembers = useMemo(() => members.filter((member) => (memberView === "active" ? isActiveMember(member) : !isActiveMember(member)) && (!monthFilter || String(member.joined || "").startsWith(monthFilter))), [members, memberView, monthFilter]);
  const activeCount = members.filter(isActiveMember).length;
  const deposits = members.reduce((total, member) => total + (Number(String(member.deposit || "0").replace(/[^0-9.-]/g, "")) || 0), 0);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Members</h1><p className="muted-copy">One permanent member record can contain multiple stays and teams.</p></div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>{canEdit ? <Button onClick={() => { setEditingMember(null); setFormOpen(true); }}><CirclePlus size={16} /> Add member</Button> : <span className="read-only-label">Admin editing only</span>}</div></div><section className="stat-grid module-stats"><KpiCard icon={<UserRound size={18} />} label="Active members" value={activeCount} detail="Current active records" /><KpiCard icon={<CreditCard size={18} />} label="Security deposits" value={`PKR ${deposits.toLocaleString("en-PK")}`} detail="Recorded member deposits" /></section><div className="section-heading"><div><h2>{memberView === "active" ? "Active members" : "Deactivated members"}</h2><p className="muted-copy">Returning members can be reactivated without creating duplicate records.</p></div><div className="directory-view-toggle" role="group" aria-label="Member status filter"><button className={memberView === "active" ? "is-selected" : ""} type="button" onClick={() => setMemberView("active")}>Activated ({activeCount})</button><button className={memberView === "deactivated" ? "is-selected" : ""} type="button" onClick={() => setMemberView("deactivated")}>Deactivated ({members.length - activeCount})</button></div></div><DataTable columns={createMemberColumns((member) => router.push(`/members/${member.id}`), (member) => { setEditingMember(member); setFormOpen(true); }, toggleMemberStatus, canEdit)} data={filteredMembers} onRowClick={(member) => router.push(`/members/${member.id}`)} emptyMessage={memberView === "active" ? "No activated members yet." : "No deactivated members."} /><Dialog open={formOpen} onClose={closeForm} ariaLabel={editingMember ? "Edit member" : "Add member"}><MemberForm key={editingMember?.id || "new-member"} leads={leads} members={members} spaces={spaces} initialMember={editingMember} onCancel={closeForm} onSave={saveMember} /></Dialog></motion.div></PageShell>;
}
