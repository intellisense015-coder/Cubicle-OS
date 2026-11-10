"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CirclePlus, Power, Search, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { SelectField } from "@/components/ui/primitives";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";
import { closeCurrentMembership } from "@/lib/member-lifecycle";
import { useHasPermission } from "@/lib/access-control";
import { createSupabaseCompany, mapSupabaseCompanyToOsCompany, updateSupabaseCompanyStatus } from "@/lib/supabase/companies";
import { createSupabaseMember, mapSupabaseMemberToOsMember, updateSupabaseMember } from "@/lib/supabase/members";
import { assignSupabaseMemberToSharedWorkspace, assignSupabaseMemberToWorkspace } from "@/lib/supabase/workspaces";
import { queryKeys } from "@/lib/query-keys";
import { fetchCompaniesSnapshot } from "@/lib/company-query";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { workspaceHasCapacity } from "@/lib/workspace-records";

const companySchema = z.object({ name: z.string().trim().min(1, "Enter the company name.") });
const teamMemberSchema = z.object({
  member: z.string().trim().min(1, "Enter the member's name."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")),
  cnic: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  vehicleLicensePlate: z.string().trim().optional(),
  space: z.string().trim().min(1, "Choose an available space."),
});

function normalizeCompanyRecord(company, index = 0) {
  const record = typeof company === "string" ? { name: company } : (company || {});
  return { ...record, id: record.id || `company-${index}`, name: String(record.name || record.company || "").trim(), status: record.status === "Inactive" || record.status === "Deactivated" ? "Inactive" : "Active" };
}

function isActiveCompany(company) {
  return ["active", "activated"].includes(String(company?.status || "").trim().toLowerCase());
}

function createCompanyColumns(onToggleStatus, onAddTeamMember, canEdit, canAddTeamMember) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("name", {
      header: "Company",
      cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong></div>,
    }),
    columnHelper.accessor("memberCount", { header: "Members" }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ getValue }) => <span className={`status-tag status-${String(getValue() || "Inactive").toLowerCase().replaceAll(" ", "-")}`}>{getValue() === "Active" ? "Activated" : "Deactivated"}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Action",
      cell: ({ row }) => canEdit ? <div className="company-action-cell"><TableActionMenu ariaLabel={`Actions for ${row.original.name}`} items={[...(canAddTeamMember ? [{ label: "Add team member", icon: <UserPlus size={15} />, onSelect: () => onAddTeamMember(row.original) }] : []), { label: row.original.status === "Active" ? "Deactivate company" : "Activate company", icon: <Power size={15} />, onSelect: () => onToggleStatus(row.original), destructive: row.original.status === "Active" }]} /></div> : <span className="read-only-label">Read only</span>,
    }),
  ];
}

function CompanyForm({ onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(companySchema), defaultValues: { name: "" }, mode: "onBlur" });
  const { register, handleSubmit, formState } = formApi;
  const error = formState.errors.name?.message;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">New company</span><h2>Add company</h2><p className="muted-copy">Create a company record for member assignments.</p></div></div><form onSubmit={handleSubmit((values) => onSave({ id: `company-${Date.now()}`, name: values.name.trim(), status: "Active" }))}><label className="settings-label">Company name<Input className={error ? "has-error" : ""} {...register("name")} aria-invalid={Boolean(error)} />{error && <span className="lead-form-error">{error}</span>}</label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}><Building2 size={15} /> Save company</Button></div></form></div>;
}

function TeamMemberForm({ company, spaces, onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(teamMemberSchema), defaultValues: { member: "", phone: "", email: "", cnic: "", gender: "", vehicleLicensePlate: "", space: "" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content member-form-card team-member-form"><div className="card-heading"><div><h2>Add team member</h2><p className="muted-copy">Add a person to {company.name}. The company is already linked.</p></div></div><form className="inline-form-grid member-form-grid" onSubmit={handleSubmit((values) => onSave({ ...values, company: company.name }))}><div className="member-form-section-heading"><h3>Member details</h3></div><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} placeholder="0300 1234567" /></label><label className="settings-label">Email address<Input type="email" {...register("email")} placeholder="member@example.com" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">CNIC<Input {...register("cnic")} placeholder="35202-1234567-1" /></label><SelectField label="Gender" value={watch("gender")} onChange={(event) => setValue("gender", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></SelectField><label className="settings-label">Vehicle license plate<Input {...register("vehicleLicensePlate")} placeholder="ABC-123" /></label><div className="member-form-section-heading"><h3>Workspace assignment</h3></div><SelectField label="Assigned space" value={watch("space")} hint={error("space")} disabled={!spaces.length} onChange={(event) => setValue("space", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">{spaces.length ? "Select an available space" : "No available spaces"}</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.label}{space.zone ? ` · ${space.zone}` : ""}</option>)}</SelectField>{!spaces.length ? <p className="lead-form-info">There are no available spaces. Add or free a workspace before adding this member.</p> : null}<div className="inline-form-actions member-form-actions"><Button type="button" variant="danger" onClick={onCancel} disabled={formState.isSubmitting}>Cancel</Button><Button type="submit" loading={formState.isSubmitting} disabled={formState.isSubmitting || !spaces.length}><UserPlus size={15} /> Add team member</Button></div></form></div>;
}

export default function CompaniesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const canView = useHasPermission("companies.read");
  const canEdit = useHasPermission("companies.write");
  const canAddTeamMember = useHasPermission("members.write");
  const queryClient = useQueryClient();
  const companiesQuery = useQuery({ queryKey: queryKeys.companies.all, queryFn: fetchCompaniesSnapshot, enabled: canView });
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot, enabled: canView });
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces.all, queryFn: fetchWorkspacesSnapshot, enabled: canView });
  const hydratedMissingKey = useRef("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [companyView, setCompanyView] = useState("active");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [teamMemberCompany, setTeamMemberCompany] = useState<any | null>(null);

  useEffect(() => {
    if (!canView) {
      setCompanies([]);
      setMembers([]);
      return;
    }
    const handleDemoChange = (event) => {
      const key = event.detail?.key || "";
      if (key === "members") void queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" });
      if (key === "companies") void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" });
      if (key === "workspaces") void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" });
    };
    window.addEventListener("cubicle-demo-change", handleDemoChange);
    return () => window.removeEventListener("cubicle-demo-change", handleDemoChange);
  }, [canView, queryClient]);

  useEffect(() => {
    if (!canView || !membersQuery.data || !companiesQuery.data) return;
    const loadedMembers = membersQuery.data.members;
    const loadedCompanies = companiesQuery.data.companies;
    const knownNames = new Set(loadedCompanies.map((company) => String(company.name || "").trim().toLowerCase()));
    const missingCompanies = [...new Set(loadedMembers.map((member) => String(member.company || "").trim()).filter((name) => name && name !== "Unassigned" && name !== "No company" && !knownNames.has(name.toLowerCase())))];
    const missingKey = missingCompanies.slice().sort().join("|");

    setMembers(loadedMembers);
    setCompanies(loadedCompanies);
    saveDemoValue("members", loadedMembers, { notify: false });
    saveDemoValue("companies", loadedCompanies, { notify: false });

    if (canEdit && missingCompanies.length > 0 && hydratedMissingKey.current !== missingKey) {
      hydratedMissingKey.current = missingKey;
      void Promise.all(missingCompanies.map((name) => createSupabaseCompany(name))).then((createdRows) => {
        const nextCompanies = [...loadedCompanies, ...createdRows.map(mapSupabaseCompanyToOsCompany)];
        setCompanies(nextCompanies);
        saveDemoValue("companies", nextCompanies, { notify: false });
        queryClient.setQueryData(queryKeys.companies.all, (current: any) => ({ ...(current || { dataSource: "supabase", errorMessage: "" }), companies: nextCompanies, errorMessage: "" }));
      }).catch((error) => showToast({ variant: "error", title: "Companies could not be completed", message: error?.message || "We couldn’t create the missing company records. Please try again." }));
    } else if (!canEdit && missingCompanies.length > 0) {
      setCompanies([...loadedCompanies, ...missingCompanies.map((name, index) => ({ id: `inferred-company-${index}`, name, status: "Active" }))]);
    }

    if (membersQuery.data.errorMessage) showToast({ variant: "error", title: "Company members could not be refreshed", message: membersQuery.data.errorMessage });
    if (companiesQuery.data.errorMessage) showToast({ variant: "error", title: "Companies could not be refreshed", message: companiesQuery.data.errorMessage });
  }, [canEdit, canView, companiesQuery.data, membersQuery.data, queryClient, showToast]);

  useEffect(() => {
    if (!canView || !workspacesQuery.data) return;
    setSpaces(workspacesQuery.data.workspaces);
    saveDemoValue("workspaces", workspacesQuery.data.workspaces, { notify: false });
    if (workspacesQuery.data.errorMessage) showToast({ variant: "error", title: "Workspaces could not be refreshed", message: workspacesQuery.data.errorMessage });
  }, [canView, showToast, workspacesQuery.data]);

  const persistCompanies = (nextCompanies) => {
    setCompanies(nextCompanies);
    saveDemoValue("companies", nextCompanies, { notify: false });
    queryClient.setQueryData(queryKeys.companies.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), companies: nextCompanies, errorMessage: "" }));
  };
  const persistMembers = (nextMembers) => {
    setMembers(nextMembers);
    saveDemoValue("members", nextMembers, { notify: false });
    queryClient.setQueryData(queryKeys.members.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), members: nextMembers, errorMessage: "" }));
  };

  const addCompany = async (company) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can add company records." }); return; }
    try {
      const row = await createSupabaseCompany(company.name);
      const nextCompany = normalizeCompanyRecord(mapSupabaseCompanyToOsCompany(row), companies.length);
      const nextCompanies = [nextCompany, ...companies.filter((item) => item.name.toLowerCase() !== nextCompany.name.toLowerCase())];
      persistCompanies(nextCompanies);
      setShowForm(false);
      showToast({ variant: "success", title: "Company added", message: `${nextCompany.name} was added successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: "Company was not saved", message: "We couldn’t save this company. Please try again." });
    }
  };

  const addTeamMember = async (values) => {
    if (!canAddTeamMember || !teamMemberCompany) {
      showToast({ variant: "error", title: "Permission required", message: "You do not have permission to add members." });
      return;
    }
    const selectedSpace = spaces.find((space) => String(space.id) === String(values.space) && workspaceHasCapacity(space, members));
    if (!selectedSpace) {
      showToast({ variant: "error", title: "Available space required", message: "Choose an available workspace before adding this member." });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const monthlyRent = selectedSpace.monthlyRent || "0";
    const member = {
      id: `member-${Date.now()}`,
      member: values.member.trim(),
      phone: values.phone?.trim() || "",
      email: values.email?.trim() || "",
      cnic: values.cnic?.trim() || "",
      gender: values.gender?.trim() || "",
      vehicleLicensePlate: values.vehicleLicensePlate?.trim() || "",
      company: teamMemberCompany.name,
      spaceId: selectedSpace.id,
      space: selectedSpace.label,
      rent: monthlyRent,
      deposit: "0",
      billingStartDate: today,
      dueDay: 5,
      joined: today,
      status: "Active",
      membershipStatus: "Active",
      membershipPeriods: [],
      contactHistory: {},
    };
    try {
      const row = await createSupabaseMember(member);
      await assignSupabaseMemberToSharedWorkspace(row.id, selectedSpace.id);
      const savedMember = { ...member, ...mapSupabaseMemberToOsMember(row), id: row.id, spaceId: selectedSpace.id, space: selectedSpace.label, rent: monthlyRent };
      const existingOccupants = members.filter((item) => String(item.spaceId || "") === String(selectedSpace.id) && String(item.status || "Active").toLowerCase() !== "inactive").length;
      const nextSpaces = spaces.map((space) => space.id === selectedSpace.id ? { ...space, status: "occupied", memberId: space.memberId || row.id, occupant: existingOccupants ? `${existingOccupants + 1} members` : savedMember.member, company: existingOccupants ? space.company : savedMember.company, monthlyRent } : space);
      persistMembers([savedMember, ...members]);
      setSpaces(nextSpaces);
      saveDemoValue("workspaces", nextSpaces, { notify: false });
      queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), workspaces: nextSpaces, errorMessage: "" }));
      await queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" });
      setTeamMemberCompany(null);
      showToast({ variant: "success", title: "Team member added", message: `${savedMember.member} was linked to ${teamMemberCompany.name}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Team member was not saved", message: error?.message || "We couldn’t save this team member. Please try again." });
    }
  };

  const toggleCompanyStatus = async (company) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can change company status." }); return; }
    const nextStatus = isActiveCompany(company) ? "Inactive" : "Active";
    try {
      const companyRow = await updateSupabaseCompanyStatus(company.id, nextStatus === "Active" ? "active" : "inactive");
      const nextCompany = mapSupabaseCompanyToOsCompany(companyRow);
      const nextCompanies = companies.map((item) => item.id === company.id ? { ...item, ...nextCompany } : item);
      const companyKey = company.name.trim().toLowerCase();
      const associatedMembers = members.filter((member) => String(member.company || "").trim().toLowerCase() === companyKey);
      let nextMembers = members;

      if (nextStatus === "Inactive" && associatedMembers.length > 0) {
        const deactivatedMembers = await Promise.all(associatedMembers.map(async (member) => {
          const nextMember = { ...closeCurrentMembership(member), status: "Inactive" };
          const row = await updateSupabaseMember(member.id, { ...nextMember, spaceId: "", space: "Unassigned" });
          await assignSupabaseMemberToWorkspace(row.id, null);
          return { ...nextMember, ...mapSupabaseMemberToOsMember(row), id: row.id, spaceId: "", space: "Unassigned" };
        }));
        const updatedById = new Map(deactivatedMembers.map((member) => [member.id, member]));
        nextMembers = members.map((member) => updatedById.get(member.id) || member);

        const savedWorkspaces = getDemoValue("workspaces");
        if (Array.isArray(savedWorkspaces)) {
          const associatedMemberIds = new Set(associatedMembers.map((member) => member.id));
          const nextWorkspaces = savedWorkspaces.map((workspace) => associatedMemberIds.has(workspace.memberId) ? { ...workspace, status: "available" } : workspace);
          saveDemoValue("workspaces", nextWorkspaces, { notify: false });
          queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), workspaces: nextWorkspaces, errorMessage: "" }));
        }
      }

      persistCompanies(nextCompanies);
      persistMembers(nextMembers);
      showToast({
        variant: "success",
        title: `Company ${nextStatus === "Active" ? "activated" : "deactivated"}`,
        message: nextStatus === "Inactive" && associatedMembers.length > 0
          ? `${company.name} and ${associatedMembers.length} associated member${associatedMembers.length === 1 ? "" : "s"} were updated successfully.`
          : `${company.name} was updated successfully.`,
      });
    } catch (error) {
      showToast({ variant: "error", title: "Company status was not changed", message: "We couldn’t update this company. Please try again." });
    }
  };

  const visibleCompanies = useMemo(() => companies.map((company) => ({ ...company, memberCount: members.filter((member) => String(member.company || "").trim().toLowerCase() === company.name.trim().toLowerCase()).length })).filter((company) => (companyView === "active" ? isActiveCompany(company) : !isActiveCompany(company)) && company.name.toLowerCase().includes(query.toLowerCase().trim())), [companies, members, companyView, query]);
  const activeCount = companies.filter(isActiveCompany).length;
  const deactivatedCount = companies.length - activeCount;
  const availableSpaces = useMemo(() => spaces.filter((space) => workspaceHasCapacity(space, members)), [spaces, members]);

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Company records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Companies — View access.</div></motion.div>;

  return <motion.div className="module-content companies-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Manage company records separately from the member directory.</p></div>{canEdit ? <Button onClick={() => setShowForm(true)}><CirclePlus size={16} /> Add company</Button> : <span className="read-only-label">Admin editing only</span>}</div><section className="stat-grid module-stats"><KpiCard icon={<Building2 size={18} />} label="Total companies" value={companies.length} detail="Saved company records" /><KpiCard icon={<Building2 size={18} />} label="Activated" value={activeCount} detail="Available for assignments" /><KpiCard icon={<Power size={18} />} label="Deactivated" value={deactivatedCount} detail="Hidden from the active view" /></section><div className="leads-toolbar page-search-row"><div className="header-search-wrap page-search-wrap"><Search size={14} className="search-leading-icon" /><input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search companies" className="search-input" /><div className="search-kbd-pill"><span>Ctrl K</span></div></div></div><div className="section-heading"><div><h2>{companyView === "active" ? "Activated companies" : "Deactivated companies"}</h2><p className="muted-copy">Keep this table focused and easy to scan.</p></div><div className="directory-view-toggle" role="group" aria-label="Company status filter"><button className={companyView === "active" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("active")}>Activated ({activeCount})</button><button className={companyView === "deactivated" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("deactivated")}>Deactivated ({deactivatedCount})</button></div></div><DataTable title={companyView === "active" ? "Activated companies" : "Deactivated companies"} subtitle="Keep this table focused and easy to scan." columns={createCompanyColumns(toggleCompanyStatus, (company) => setTeamMemberCompany(company), canEdit, canAddTeamMember)} data={visibleCompanies} onRowClick={(company) => router.push(`/companies/${encodeURIComponent(String(company.id))}`)} emptyMessage={companyView === "active" ? "No activated companies found." : "No deactivated companies found."} /><Dialog open={showForm} onClose={() => setShowForm(false)} ariaLabel="Add company"><CompanyForm onCancel={() => setShowForm(false)} onSave={addCompany} /></Dialog><Dialog open={Boolean(teamMemberCompany)} onClose={() => setTeamMemberCompany(null)} ariaLabel="Add team member">{teamMemberCompany ? <TeamMemberForm company={teamMemberCompany} spaces={availableSpaces} onCancel={() => setTeamMemberCompany(null)} onSave={addTeamMember} /> : null}</Dialog></motion.div>;
}
