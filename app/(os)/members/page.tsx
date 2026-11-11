"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { BookOpen, Building2, CirclePlus, CreditCard, Pencil, Power, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { DatePickerField, SelectField } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace, mergeWorkspaceRecords, workspaceHasCapacity } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { closeCurrentMembership, createMembershipPeriod, findMemberIdentityMatch, isActiveMember, memberCompanyKey, normalizeMembershipStatus, normalizePhone, reactivateMember, syncCompanyStatuses } from "@/lib/member-lifecycle";
import { numericField, numericString } from "@/lib/number-input";
import { useHasPermission } from "@/lib/access-control";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { createSupabaseCompany, mapSupabaseCompanyToOsCompany } from "@/lib/supabase/companies";
import { updateSupabaseLead } from "@/lib/supabase/leads";
import { createSupabaseMember, mapSupabaseMemberToOsMember, updateSupabaseMember } from "@/lib/supabase/members";
import { assignSupabaseMemberToSharedWorkspace, assignSupabaseMemberToWorkspace } from "@/lib/supabase/workspaces";
import { queryKeys } from "@/lib/query-keys";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchCompaniesSnapshot } from "@/lib/company-query";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { fetchQuotationsSnapshot } from "@/lib/quotation-query";
import { z } from "zod";

const memberSchema = z.object({
  leadId: z.string().optional(), member: z.string().trim().min(1, "Enter the member's name."), phone: z.string().optional(), email: z.string().optional(), cnic: z.string().optional(), gender: z.string().optional(), vehicleLicensePlate: z.string().optional(), company: z.string().optional(), team: z.string().optional(), space: z.string().optional(), rent: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid numeric rent."), deposit: z.string().optional().refine((value) => !value || /^\d+(\.\d+)?$/.test(value), "Enter a valid numeric deposit."), billingStartDate: z.string().min(1, "Choose a billing start date."), dueDay: z.string().regex(/^\d+$/, "Enter a whole-number due day.").refine((value) => Number(value) >= 1 && Number(value) <= 31, "Due day must be between 1 and 31."), joined: z.string().min(1, "Choose a joining date."), membershipStatus: z.enum(["Active", "Notice period"]), noticeStartDate: z.string().optional(), expectedLeavingDate: z.string().optional(), noticeNotes: z.string().optional(), reactivateMemberId: z.string().optional(),
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

function isSupabaseId(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function createMemberConversionJourneyEntry(lead: any) {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const occurredDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const occurredTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const session = getDemoSession();
  const actor = String(getDemoValue("profileName") || session.email || "Current user").trim() || "Current user";
  const previousStage = normalizeLeadStage(lead.stage, lead);
  const nextStage = "Converted";

  return {
    id: `journey-stage-${lead.id}-${Date.now()}`,
    entryType: "stage-change",
    visitorIdentity: lead.name,
    occurredDate,
    occurredTime,
    previousStage,
    stage: nextStage,
    purpose: "Lead converted to member",
    companions: "",
    source: lead.source || "Website",
    mood: "",
    certainty: "Sure",
    objections: "",
    nextFollowUpDate: "",
    nextFollowUpTime: "",
    communicationMode: "System",
    communicationChannel: "System",
    followedUpBy: actor,
    conversationSummary: `Lead converted to member. Stage changed from ${previousStage} to ${nextStage}.`,
    outcome: nextStage,
    conversionProbability: "",
    conversionReason: "Member added",
    notes: `Stage changed from ${previousStage} to ${nextStage}.`,
  };
}

function MemberLeadSelect({ leads, value, onChange }) {
  const conversionLeads = leads.filter((lead) => ["Converted", "Quotation Approved", "Proposal Approved"].includes(normalizeLeadStage(lead.stage, lead)));
  return <div className="lead-source-field"><SelectField label="Member from converted lead" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Create manually</option>{conversionLeads.length ? conversionLeads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name} · {lead.company || "No company"}</option>) : null}</SelectField></div>;
}

function findLeadQuotation(quotations, leadId) {
  const matches = quotations.filter((quotation) => String(quotation?.leadId || "") === String(leadId || ""));
  return matches.sort((left, right) => {
    const leftAccepted = String(left?.status || "").toLowerCase() === "accepted" ? 1 : 0;
    const rightAccepted = String(right?.status || "").toLowerCase() === "accepted" ? 1 : 0;
    if (leftAccepted !== rightAccepted) return rightAccepted - leftAccepted;
    return new Date(String(right?.updatedAt || right?.createdAt || "")).getTime() - new Date(String(left?.updatedAt || left?.createdAt || "")).getTime();
  })[0] || null;
}

function quotationSecurityDeposit(quotation) {
  const directDeposit = quotation?.securityDeposit ?? quotation?.deposit;
  if (directDeposit !== undefined && directDeposit !== null && String(directDeposit).trim() !== "") return numericString(directDeposit, "0");
  const lines = [...(Array.isArray(quotation?.charges) ? quotation.charges : []), ...(Array.isArray(quotation?.items) ? quotation.items : [])];
  const depositLine = lines.find((line) => /security\s*deposit|deposit/i.test(String(line?.description || line?.itemDescription || line?.name || "")));
  return numericString(depositLine?.amount ?? depositLine?.price ?? depositLine?.lineTotal ?? depositLine?.line_total, "0");
}

function MemberSpaceSelect({ spaces, members, value, onChange, currentMemberId = "" }) {
  const allSpaces = spaces.filter((space) => isAssignableWorkspace(space));
  const isSelectable = (space) => workspaceHasCapacity(space, members, currentMemberId);
  return <div className="lead-source-field"><SelectField label="Assigned space" value={value} onChange={(event) => { const nextSpace = allSpaces.find((space) => space.id === event.target.value); onChange(event.target.value, nextSpace); }} renderOption={(option) => { const space = allSpaces.find((item) => item.id === option.value); return option.value ? <span className="member-space-option"><WorkspaceBadge value={space?.type || space?.label || String(option.label)} /><span>{space?.label || String(option.label)}{space?.zone ? ` · ${space.zone}` : ""}</span></span> : <WorkspaceBadge value="Unassigned" />; }}><option value="">Unassigned</option>{allSpaces.map((space) => <option value={space.id} disabled={!isSelectable(space)} key={space.id}>{space.label} · {space.zone}{space.status !== "available" ? " · Occupied" : ""}</option>)}</SelectField></div>;
}

function MemberForm({ leads, companies, members, spaces, quotations = [], onCancel, onSave, initialMember = null }) {
  const initialMembershipStatus = normalizeMembershipStatus(initialMember?.membershipStatus);
  const initialNoticeStartDate = initialMember?.noticeStartDate || (initialMembershipStatus === "Notice period" ? initialMember?.billingStartDate || initialMember?.joined || "" : "");
  const initialExpectedLeavingDate = initialMember?.expectedLeavingDate || (initialMembershipStatus === "Notice period" ? addOneMonth(initialNoticeStartDate) : "");
  const formApi = useForm({ resolver: zodResolver(memberSchema), defaultValues: { leadId: initialMember?.leadId || "", member: initialMember?.member || "", phone: initialMember?.phone || "", email: initialMember?.email || "", cnic: initialMember?.cnic || "", gender: initialMember?.gender || "", vehicleLicensePlate: initialMember?.vehicleLicensePlate || "", company: initialMember?.company || "", team: initialMember?.team || "", space: initialMember?.spaceId || "", rent: numericString(initialMember?.rent, "0"), deposit: numericString(initialMember?.deposit, "0"), joined: initialMember?.joined || "2026-10-05", billingStartDate: initialMember?.billingStartDate || initialMember?.joined || "2026-10-05", dueDay: numericString(initialMember?.dueDay, "5"), membershipStatus: initialMembershipStatus, noticeStartDate: initialNoticeStartDate, expectedLeavingDate: initialExpectedLeavingDate, noticeNotes: initialMember?.noticeNotes || "", reactivateMemberId: "" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const saveInFlightRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const error = (field) => formState.errors[field]?.message;
  const selectedLeadId = watch("leadId");
  const selectedLead = leads.find((item) => item.id === selectedLeadId);
  const leadSelected = !initialMember && Boolean(selectedLeadId);
  const companyLocked = leadSelected && Boolean(String(selectedLead?.company || "").trim());
  const companyOptions = [...companies].sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  const selectLead = (leadId) => { const lead = leads.find((item) => item.id === leadId); setValue("leadId", leadId, { shouldDirty: true, shouldValidate: true }); setValue("member", lead ? lead.name : "", { shouldDirty: true, shouldValidate: true }); setValue("company", lead ? lead.company || "" : "", { shouldDirty: true }); setValue("phone", lead ? lead.phone || "" : "", { shouldDirty: true }); setValue("email", lead ? lead.email || "" : "", { shouldDirty: true }); if (lead) { const quotation = findLeadQuotation(quotations, lead.id); setValue("rent", quotation ? numericString(quotation.monthlyRent, "0") : "0", { shouldDirty: true, shouldValidate: true }); setValue("deposit", quotation ? quotationSecurityDeposit(quotation) : "0", { shouldDirty: true, shouldValidate: true }); } };
  const handleNoticeStartChange = (event) => { const start = event.target.value; setValue("noticeStartDate", start, { shouldDirty: true, shouldValidate: true }); if (watch("membershipStatus") === "Notice period") setValue("expectedLeavingDate", addOneMonth(start), { shouldDirty: true, shouldValidate: true }); };
  const onSubmit = async (values) => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSave({ ...values, membershipStatus: normalizeMembershipStatus(values.membershipStatus), rent: numericString(values.rent, "0"), deposit: numericString(values.deposit, "0"), id: initialMember?.id || `member-${Date.now()}`, status: initialMember?.status || "Active", joined: values.joined, spaceId: values.space, space: spaces.find((item) => item.id === values.space)?.label || "Unassigned", dueDay: Number(values.dueDay) || 5, reactivateMemberId: "" });
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };
  const rent = Number(numericString(watch("rent"), "0")) || 0;
  const deposit = Number(numericString(watch("deposit"), "0")) || 0;
  return <div className="dialog-content member-form-card"><div className="card-heading"><div><h2>{initialMember ? "Edit member" : "Add member"}</h2><p className="muted-copy">Keep contact details, billing, and workspace assignment together.</p></div></div><form className="inline-form-grid member-form-grid" onSubmit={handleSubmit(onSubmit)}>{!initialMember ? <MemberLeadSelect leads={leads} value={watch("leadId")} onChange={selectLead} /> : null}<div className="member-form-section-heading"><h3>Contact details</h3></div><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} readOnly={leadSelected} aria-readonly={leadSelected} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} readOnly={leadSelected} aria-readonly={leadSelected} placeholder="0300 1234567" /></label><label className="settings-label">Email address<Input type="email" {...register("email")} readOnly={leadSelected} aria-readonly={leadSelected} placeholder="member@example.com" /></label><label className="settings-label">CNIC<Input {...register("cnic")} placeholder="35202-1234567-1" /></label><SelectField label="Gender" value={watch("gender")} onChange={(event) => setValue("gender", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></SelectField><label className="settings-label">Vehicle license plate<Input {...register("vehicleLicensePlate")} placeholder="ABC-123" /></label><SelectField label="Company" value={watch("company")} disabled={companyLocked} onChange={(event) => setValue("company", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Unassigned</option>{companyOptions.map((company) => <option value={company.name} key={company.id || company.name}>{company.name}</option>)}</SelectField><div className="member-form-section-heading"><h3>Workspace and billing</h3></div><MemberSpaceSelect spaces={spaces} members={members} value={watch("space")} currentMemberId={initialMember?.id} onChange={(value, space) => { setValue("space", value, { shouldDirty: true }); if (!leadSelected && space?.monthlyRent && (!initialMember || value !== initialMember.spaceId)) setValue("rent", numericString(space.monthlyRent, "0"), { shouldDirty: true }); }} /><label className="settings-label">Monthly rent<Input className={error("rent") ? "has-error" : ""} {...numericField(register, "rent")} aria-invalid={Boolean(error("rent"))} />{error("rent") && <span className="lead-form-error">{error("rent")}</span>}</label><label className="settings-label">Security deposit<Input className={error("deposit") ? "has-error" : ""} {...numericField(register, "deposit")} placeholder="0" aria-invalid={Boolean(error("deposit"))} />{deposit > rent ? <span className="lead-form-warning">Security deposit is higher than monthly rent.</span> : null}{error("deposit") && <span className="lead-form-error">{error("deposit")}</span>}</label><div className="member-form-section-heading"><h3>Dates</h3></div><DatePickerField label="Billing start date" value={watch("billingStartDate")} hint={error("billingStartDate")} onChange={(value) => setValue("billingStartDate", value, { shouldDirty: true, shouldValidate: true })} /><DatePickerField label="Joining date" value={watch("joined")} hint={error("joined")} onChange={(value) => setValue("joined", value, { shouldDirty: true, shouldValidate: true })} /><div className="inline-form-actions member-form-actions"><Button type="button" variant="danger" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" loading={isSaving} disabled={isSaving}><CirclePlus size={15} /> {initialMember ? "Save changes" : "Save member"}</Button></div></form></div>;
}

function createMemberColumns(onView, onEdit, onToggleStatus, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("member", { header: "Member", cell: ({ row }) => <div className="table-primary"><strong>{row.original.member}</strong><span>{row.original.phone || row.original.joined}</span></div> }), columnHelper.accessor("company", { header: "Company", cell: ({ row }) => <div className="table-primary"><strong>{row.original.company || "Unassigned"}</strong>{row.original.team ? <span>{row.original.team}</span> : null}</div> }), columnHelper.accessor("space", { header: "Assigned space", cell: ({ getValue, row }) => <WorkspaceBadge value={row.original.spaceType || getValue()} /> }), columnHelper.accessor("rent", { header: "Monthly rent" }), columnHelper.accessor("membershipStatus", { header: "Membership", cell: ({ getValue }) => { const value = normalizeMembershipStatus(getValue()); return <span className={`status-tag status-membership-${value === "Notice period" ? "notice" : "active"}`}>{value}</span>; } }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => canEdit ? <div className="member-action-cell"><TableActionMenu ariaLabel={`Actions for ${row.original.member}`} items={[{ label: "Edit member", icon: <Pencil size={15} />, onSelect: () => onEdit(row.original) }, { label: isActiveMember(row.original) ? "Suspend member" : "Reactivate member", icon: <Power size={15} />, onSelect: () => onToggleStatus(row.original), destructive: isActiveMember(row.original) }, { label: "View ledger", icon: <BookOpen size={15} />, onSelect: () => onView(row.original) }]} /></div> : <span className="read-only-label">Read only</span> })];
}

function updateExistingMember(previous, values) {
  const placementChanged = memberCompanyKey(previous) !== memberCompanyKey(values) || String(previous?.team || "").trim().toLowerCase() !== String(values?.team || "").trim().toLowerCase();
  if (isActiveMember(previous) && placementChanged) return reactivateMember(closeCurrentMembership(previous), values);
  return { ...previous, ...values, id: previous.id, currentMembershipId: previous.currentMembershipId || createMembershipPeriod(values, previous).id };
}

export default function MembersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const canEdit = useHasPermission("members.write");
  const canWriteCompanies = useHasPermission("companies.write");
  const canWriteLeads = useHasPermission("leads.write");
  const queryClient = useQueryClient();
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot });
  const companiesQuery = useQuery({ queryKey: queryKeys.companies.all, queryFn: fetchCompaniesSnapshot });
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces.all, queryFn: fetchWorkspacesSnapshot });
  const quotationsQuery = useQuery({ queryKey: queryKeys.quotations.all, queryFn: fetchQuotationsSnapshot });
  const [members, setMembers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [monthFilter, setMonthFilter] = useState("");
  const [memberView, setMemberView] = useState<"active" | "suspended">("active");

  useEffect(() => {
    const savedLeads = getDemoValue("leads");
    setLeads(Array.isArray(savedLeads) ? savedLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) })) : []);
    const handleChange = (event) => {
      const key = event.detail?.key || "";
      if (key === "members") void queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" });
      if (key === "companies") void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" });
      if (key === "workspaces") void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" });
      if (key === "leads") {
        const nextLeads = getDemoValue("leads");
        setLeads(Array.isArray(nextLeads) ? nextLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) })) : []);
      }
    };
    window.addEventListener("cubicle-demo-change", handleChange);
    return () => window.removeEventListener("cubicle-demo-change", handleChange);
  }, [queryClient]);

  useEffect(() => {
    if (companiesQuery.data) setCompanies(companiesQuery.data.companies);
    if (companiesQuery.data?.errorMessage) showToast({ variant: "error", title: "Members company data could not be refreshed", message: companiesQuery.data.errorMessage });
  }, [companiesQuery.data, showToast]);

  useEffect(() => {
    if (quotationsQuery.data?.errorMessage) showToast({ variant: "error", title: "Quotation pricing could not be refreshed", message: quotationsQuery.data.errorMessage });
  }, [quotationsQuery.data, showToast]);

  useEffect(() => {
    if (!membersQuery.data || !workspacesQuery.data) return;
    const loadedSpaces = mergeWorkspaceRecords(workspacesQuery.data.workspaces);
    const loadedMembers = membersQuery.data.members.map((member) => {
      const assignedSpace = loadedSpaces.find((space) => String(space.id) === String(member.spaceId || "") && isAssignableWorkspace(space)) || loadedSpaces.find((space) => space.memberId === member.id && isAssignableWorkspace(space) && space.status === "occupied");
      return assignedSpace
        ? { ...member, spaceId: assignedSpace.id, space: assignedSpace.label }
        : member.spaceId
          ? { ...member, spaceId: member.spaceId, space: member.space || member.spaceId }
          : { ...member, spaceId: "", space: "Unassigned" };
    });
    setMembers(loadedMembers);
    setSpaces(loadedSpaces);
    saveDemoValue("members", loadedMembers, { notify: false });
    saveDemoValue("workspaces", loadedSpaces, { notify: false });
    if (membersQuery.data.errorMessage) showToast({ variant: "error", title: "Members could not be refreshed", message: membersQuery.data.errorMessage });
    if (workspacesQuery.data.errorMessage) showToast({ variant: "error", title: "Member workspaces could not be refreshed", message: workspacesQuery.data.errorMessage });
  }, [membersQuery.data, showToast, workspacesQuery.data]);

  const persistMembers = (nextMembers) => {
    setMembers(nextMembers);
    saveDemoValue("members", nextMembers, { notify: false });
    queryClient.setQueryData(queryKeys.members.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), members: nextMembers, errorMessage: "" }));
  };
  const persistCompanies = (nextCompanies) => {
    setCompanies(nextCompanies);
    saveDemoValue("companies", nextCompanies, { notify: false });
    queryClient.setQueryData(queryKeys.companies.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), companies: nextCompanies, errorMessage: "" }));
  };
  const persistSpaces = (nextSpaces) => {
    setSpaces(nextSpaces);
    saveDemoValue("workspaces", nextSpaces, { notify: false });
    queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), workspaces: nextSpaces, errorMessage: "" }));
  };
  const closeForm = () => { setFormOpen(false); setEditingMember(null); };

  const updateSpacesForMember = (currentSpaces, member, previousMember = null) => currentSpaces.map((space) => {
    if (previousMember?.spaceId && previousMember.spaceId !== member.spaceId && space.id === previousMember.spaceId) return { ...space, occupant: "", company: "Unassigned", memberId: "", membershipPeriodId: "", membershipStatus: "Active", noticeStartDate: "", expectedLeavingDate: "", noticeNotes: "", status: "available" };
    if (space.id !== member.spaceId) return space;
    const membershipStatus = normalizeMembershipStatus(member.membershipStatus);
    return { ...space, occupant: member.member, company: member.company || "Unassigned", memberId: member.id, membershipPeriodId: member.currentMembershipId || "", membershipStatus, noticeStartDate: member.noticeStartDate || "", expectedLeavingDate: member.expectedLeavingDate || "", noticeNotes: member.noticeNotes || "", status: isActiveMember(member) ? "occupied" : "available", monthlyRent: member.rent, billingStartDate: member.billingStartDate || member.joined, dueDay: member.dueDay || 5, gracePeriodDays: 3 };
  });

  const saveMember = async (values) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can edit member records." }); return; }
    const identityMatch = findMemberIdentityMatch(values, members, editingMember?.id);
    if (identityMatch && identityMatch.id !== values.reactivateMemberId) { showToast({ variant: "error", title: "Duplicate member contact", message: `That phone number or email belongs to ${identityMatch.member}. Edit the existing member instead.` }); return; }
    try {
      const existing = values.reactivateMemberId ? members.find((item) => item.id === values.reactivateMemberId) : null;
      const previous = editingMember ? members.find((item) => item.id === editingMember.id) : null;
      let savedMember;
      if (existing) savedMember = reactivateMember(existing, values);
      else if (previous) savedMember = updateExistingMember(previous, values);
      else { const period = createMembershipPeriod(values); savedMember = { ...values, status: "Active", firstJoined: values.joined, currentMembershipId: period.id, membershipPeriods: [period], contactHistory: { phones: values.phone ? [{ value: values.phone, normalized: normalizePhone(values.phone) }] : [] } }; }

      const isNewMember = !previous && !existing;
      const linkedLead = isNewMember && savedMember.leadId ? leads.find((lead) => lead.id === savedMember.leadId) : null;
      const companyName = String(savedMember.company || "").trim();
      const matchingCompany = companies.find((company) => String(company.name || "").trim().toLowerCase() === memberCompanyKey(savedMember));
      const needsRemoteCompany = Boolean(companyName && companyName.toLowerCase() !== "unassigned" && (!matchingCompany || matchingCompany.backend !== "supabase"));

      if (isSupabaseLeadsEnabled() && isNewMember && savedMember.leadId) {
        if (!linkedLead || !isSupabaseId(savedMember.leadId)) throw new Error("The selected lead could not be verified in Supabase.");
        if (!canWriteLeads) throw new Error("Lead conversion permission is required before adding a member from a lead.");
      }
      if (isSupabaseLeadsEnabled() && needsRemoteCompany && !canWriteCompanies) {
        throw new Error("Company creation permission is required before adding this member.");
      }

      const requestedWorkspaceId = savedMember.spaceId || null;
      const memberWithoutWorkspace = { ...savedMember, spaceId: "", space: "Unassigned" };
      const row = previous || existing
        ? await updateSupabaseMember(savedMember.id, memberWithoutWorkspace)
        : await createSupabaseMember(memberWithoutWorkspace);
      if (requestedWorkspaceId) await assignSupabaseMemberToSharedWorkspace(row.id, requestedWorkspaceId, previous?.spaceId || existing?.spaceId || null);
      else await assignSupabaseMemberToWorkspace(row.id, null);
      savedMember = { ...savedMember, ...mapSupabaseMemberToOsMember(row), id: row.id, spaceId: requestedWorkspaceId || "", space: requestedWorkspaceId ? savedMember.space || requestedWorkspaceId : "Unassigned" };

      let nextCompanies = companies;
      if (companyName && companyName.toLowerCase() !== "unassigned") {
        if (isSupabaseLeadsEnabled() && needsRemoteCompany) {
          const companyRow = await createSupabaseCompany(companyName);
          const persistedCompany = mapSupabaseCompanyToOsCompany(companyRow);
          nextCompanies = [persistedCompany, ...companies.filter((company) => company.id !== persistedCompany.id && String(company.name || "").trim().toLowerCase() !== companyName.toLowerCase())];
        } else if (!matchingCompany) {
          nextCompanies = [{ id: `company-${Date.now()}`, name: companyName, status: "Active" }, ...companies];
        }
      }
      const linkedCompany = nextCompanies.find((company) => String(company.name || "").trim().toLowerCase() === memberCompanyKey(savedMember));
      savedMember = { ...savedMember, companyId: linkedCompany?.id || "" };
      const nextMembers = previous ? members.map((item) => item.id === previous.id ? savedMember : item) : existing ? members.map((item) => item.id === existing.id ? savedMember : item) : [savedMember, ...members];
      nextCompanies = syncCompanyStatuses(nextCompanies, nextMembers);
      const nextSpaces = updateSpacesForMember(spaces, savedMember, previous || existing);
      persistMembers(nextMembers); persistCompanies(nextCompanies); persistSpaces(nextSpaces);
      if (savedMember.leadId && isNewMember) {
        const currentLead = linkedLead || leads.find((lead) => lead.id === savedMember.leadId);
        if (currentLead) {
          const conversionEntry = createMemberConversionJourneyEntry(currentLead);
          const convertedLead = { ...transitionLead(currentLead, { type: "converted" }), journey: [conversionEntry, ...(Array.isArray(currentLead.journey) ? currentLead.journey : [])] };
          if (isSupabaseLeadsEnabled() && isSupabaseId(savedMember.leadId)) {
            await updateSupabaseLead(savedMember.leadId, {
              visited: Boolean(currentLead.visited),
              stage: "Converted",
              journeyEntry: conversionEntry,
            }, "lead.update");
          }
          const nextLeads = leads.map((lead) => lead.id === savedMember.leadId ? convertedLead : lead);
          setLeads(nextLeads);
          saveDemoValue("leads", nextLeads);
          await queryClient.invalidateQueries({ queryKey: queryKeys.leads.all, refetchType: "active" });
        }
      }
      if (isSupabaseLeadsEnabled()) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" });
        await queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" });
      }
      closeForm(); showToast({ variant: "success", title: existing ? "Member reactivated" : previous ? "Member updated" : "Member added", message: `${savedMember.member}'s details and workspace assignment are up to date.` });
    } catch (error) {
      showToast({ variant: "error", title: "Member was not saved", message: error instanceof Error ? error.message : "We couldn’t save this member. Please try again." });
    }
  };

  const toggleMemberStatus = async (member) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can change member status." }); return; }
    try {
      if (isActiveMember(member)) {
        const closed = closeCurrentMembership(member);
        const nextMember = { ...closed, status: "Inactive" };
        const row = await updateSupabaseMember(member.id, { ...nextMember, spaceId: "", space: "Unassigned" });
        await assignSupabaseMemberToWorkspace(row.id, null);
        const persistedMember = { ...nextMember, ...mapSupabaseMemberToOsMember(row), id: row.id, spaceId: "", space: "Unassigned" };
        const nextMembers = members.map((item) => item.id === member.id ? persistedMember : item);
        const nextSpaces = spaces.map((space) => space.memberId === member.id ? { ...space, status: "available" } : space);
        persistMembers(nextMembers); persistSpaces(nextSpaces); persistCompanies(syncCompanyStatuses(companies, nextMembers));
        showToast({ variant: "success", title: "Member deactivated", message: `${member.member} is inactive and the workspace is available again.` }); return;
      }
      const restorableSpace = spaces.find((space) => space.memberId === member.id && (space.status === "available" || space.memberId === member.id));
      const reactivated = reactivateMember(member, { ...member, billingStartDate: new Date().toISOString().slice(0, 10), spaceId: restorableSpace?.id || "", space: restorableSpace?.label || "Unassigned" });
      const requestedWorkspaceId = reactivated.spaceId || null;
      const row = await updateSupabaseMember(member.id, { ...reactivated, spaceId: "", space: "Unassigned" });
      if (requestedWorkspaceId) await assignSupabaseMemberToSharedWorkspace(row.id, requestedWorkspaceId);
      else await assignSupabaseMemberToWorkspace(row.id, null);
      const persistedMember = { ...reactivated, ...mapSupabaseMemberToOsMember(row), id: row.id, spaceId: requestedWorkspaceId || "", space: requestedWorkspaceId ? reactivated.space || requestedWorkspaceId : "Unassigned" };
      const nextMembers = members.map((item) => item.id === member.id ? persistedMember : item);
      const nextSpaces = updateSpacesForMember(spaces, persistedMember);
      persistMembers(nextMembers); persistSpaces(nextSpaces); persistCompanies(syncCompanyStatuses(companies, nextMembers));
      showToast({ variant: "success", title: "Member reactivated", message: `${member.member} is active again and the workspace assignment was restored.` });
    } catch (error) {
      showToast({ variant: "error", title: "Member status was not changed", message: "We couldn’t update this member. Please try again." });
    }
  };

  const filteredMembers = useMemo(() => members.filter((member) => (memberView === "active" ? isActiveMember(member) : !isActiveMember(member)) && (!monthFilter || String(member.joined || "").startsWith(monthFilter))), [members, memberView, monthFilter]);
  const activeCount = members.filter(isActiveMember).length;
  const suspendedCount = members.length - activeCount;
  const deposits = members.reduce((total, member) => total + (Number(String(member.deposit || "0").replace(/[^0-9.-]/g, "")) || 0), 0);

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Members</h1><p className="muted-copy">One permanent member record can contain multiple stays and teams.</p></div><div className="header-actions"><label className="month-filter">Month <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>{canEdit && memberView === "active" && suspendedCount > 0 ? <Button variant="soft" onClick={() => setMemberView("suspended")}><Power size={16} /> Reactivate member</Button> : null}{canEdit ? <Button onClick={() => { setEditingMember(null); setFormOpen(true); }}><CirclePlus size={16} /> Add member</Button> : <span className="read-only-label">Admin editing only</span>}</div></div><section className="stat-grid module-stats"><KpiCard icon={<UserRound size={18} />} label="Active members" value={activeCount} detail="Current active records" /><KpiCard icon={<CreditCard size={18} />} label="Security deposits" value={`PKR ${deposits.toLocaleString("en-PK")}`} detail="Recorded member deposits" /></section><div className="section-heading"><div><h2>{memberView === "active" ? "Active members" : "Suspended members"}</h2><p className="muted-copy">Use the toggle to show only active or suspended member accounts.</p></div><div className="directory-view-toggle" role="group" aria-label="Member status filter"><button className={memberView === "active" ? "is-selected" : ""} type="button" onClick={() => setMemberView("active")}>Active ({activeCount})</button><button className={memberView === "suspended" ? "is-selected" : ""} type="button" onClick={() => setMemberView("suspended")}>Suspended ({suspendedCount})</button></div></div><DataTable title={memberView === "active" ? "Active members" : "Suspended members"} subtitle="Use the toggle to show only active or suspended member accounts." columns={createMemberColumns((member) => router.push(`/members/${member.id}`), (member) => { setEditingMember(member); setFormOpen(true); }, toggleMemberStatus, canEdit)} data={filteredMembers} onRowClick={(member) => router.push(`/members/${member.id}`)} emptyMessage={memberView === "active" ? "No active members yet." : "No suspended members."} /><Dialog open={formOpen} onClose={closeForm} ariaLabel={editingMember ? "Edit member" : "Add member"}><MemberForm key={editingMember?.id || "new-member"} leads={leads} companies={companies} members={members} spaces={spaces} quotations={quotationsQuery.data?.quotations || []} initialMember={editingMember} onCancel={closeForm} onSave={saveMember} /></Dialog></motion.div>;
}
