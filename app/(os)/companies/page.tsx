"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CirclePlus, Download, Eye, Power, Search, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { SelectField } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";
import { useHasPermission } from "@/lib/access-control";
import { isActiveMember } from "@/lib/member-lifecycle";
import { createSupabaseCompany, mapSupabaseCompanyToOsCompany, updateSupabaseCompanyStatus } from "@/lib/supabase/companies";
import { createSupabaseMember, mapSupabaseMemberToOsMember } from "@/lib/supabase/members";
import { assignSupabaseMemberToSharedWorkspace } from "@/lib/supabase/workspaces";
import { queryKeys } from "@/lib/query-keys";
import { fetchCompaniesSnapshot } from "@/lib/company-query";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { fetchInvoiceAutomationSettings } from "@/lib/supabase/invoice-automation";
import { isAssignableWorkspace, workspaceHasCapacity } from "@/lib/workspace-records";

const companySchema = z.object({ name: z.string().trim().min(1, "Enter the company name.") });
const teamMemberSchema = z.object({
  member: z.string().trim().min(1, "Enter the member's name."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")),
  cnic: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  vehicleMake: z.string().trim().optional(),
  vehicleModel: z.string().trim().optional(),
  vehicleVariant: z.string().trim().optional(),
  vehicleColor: z.string().trim().optional(),
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

function companyWorkspaceHasCapacity(workspace, members, companyName) {
  if (!isAssignableWorkspace(workspace)) return false;
  if (workspace?.operationalStatus && workspace.operationalStatus !== "ACTIVE") return false;
  if (workspace?.maintenanceStatus && workspace.maintenanceStatus !== "deactivated") return false;
  if (["maintenance", "reserved"].includes(String(workspace?.status || "").toLowerCase())) return false;
  const workspaceId = String(workspace?.id || workspace?.areaId || "");
  const companyKey = String(companyName || "").trim().toLowerCase();
  const companyMembers = members.filter((member) => String(member?.company || "").trim().toLowerCase() === companyKey).length;
  const externalActiveMembers = members.filter((member) => isActiveMember(member) && String(member?.spaceId || "") === workspaceId && String(member?.company || "").trim().toLowerCase() !== companyKey).length;
  const capacity = Math.max(1, Number(workspace?.capacity) || 1);
  return companyMembers > 0 && externalActiveMembers + companyMembers <= capacity;
}

function formatCompanyMonthlyRent(companyName, members, invoiceRecipientIds) {
  if (!invoiceRecipientIds) return "—";
  const companyKey = String(companyName || "").trim().toLowerCase();
  const activeMembers = members.filter((member) => String(member?.company || "").trim().toLowerCase() === companyKey && isActiveMember(member) && invoiceRecipientIds.has(String(member?.id)));
  if (!activeMembers.length) return "—";
  const total = activeMembers
    .reduce((sum, member) => sum + Number(String(member?.rent || "").replace(/[^0-9.-]/g, "")) || 0, 0);
  return `PKR ${total.toLocaleString("en-PK")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function companiesCsv(companies) {
  const header = ["Company", "Members", "Monthly rent", "Status"];
  return [header, ...companies.map((company) => [
    company.name,
    company.memberCount,
    company.monthlyRent,
    isActiveCompany(company) ? "Activated" : "Deactivated",
  ])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function createCompanyColumns(onToggleStatus, onReactivateCompany, onAddTeamMember, onViewMembers, canEdit, canAddTeamMember, statusChangingId, members, invoiceRecipientIds) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("name", {
      header: "Company",
      cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong></div>,
    }),
    columnHelper.accessor("memberCount", { header: "Members" }),
    columnHelper.display({ id: "monthly-rent", header: "Monthly rent", cell: ({ row }) => formatCompanyMonthlyRent(row.original.name, members, invoiceRecipientIds) }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ getValue }) => <span className={`status-tag status-${String(getValue() || "Inactive").toLowerCase().replaceAll(" ", "-")}`}>{getValue() === "Active" ? "Activated" : "Deactivated"}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Action",
      cell: ({ row }) => <div className="company-action-cell"><TableActionMenu ariaLabel={`Actions for ${row.original.name}`} loading={statusChangingId === String(row.original.id)} items={[{ label: "View members", icon: <Eye size={15} />, onSelect: () => onViewMembers(row.original) }, ...(canEdit && canAddTeamMember && isActiveCompany(row.original) ? [{ label: "Add team member", icon: <UserPlus size={15} />, onSelect: () => onAddTeamMember(row.original) }] : []), ...(canEdit ? [{ label: isActiveCompany(row.original) ? "Deactivate company" : "Reactivate company", icon: <Power size={15} />, onSelect: () => isActiveCompany(row.original) ? onToggleStatus(row.original) : onReactivateCompany(row.original), destructive: isActiveCompany(row.original) }] : [])]} /></div>,
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
  const formApi = useForm({ resolver: zodResolver(teamMemberSchema), defaultValues: { member: "", phone: "", email: "", cnic: "", gender: "", vehicleMake: "", vehicleModel: "", vehicleVariant: "", vehicleColor: "", vehicleLicensePlate: "", space: "" }, mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  return <div className="dialog-content member-form-card team-member-form"><div className="card-heading"><div><h2>Add team member</h2><p className="muted-copy">Add a person to {company.name}. The company is already linked.</p></div></div><form className="inline-form-grid member-form-grid" onSubmit={handleSubmit((values) => onSave({ ...values, company: company.name }))}><div className="member-form-section-heading"><h3>Member details</h3></div><label className="settings-label">Member name<Input className={error("member") ? "has-error" : ""} {...register("member")} aria-invalid={Boolean(error("member"))} />{error("member") && <span className="lead-form-error">{error("member")}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} placeholder="0300 1234567" /></label><label className="settings-label">Email address<Input type="email" {...register("email")} placeholder="member@example.com" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">CNIC<Input {...register("cnic")} placeholder="35202-1234567-1" /></label><SelectField label="Gender" value={watch("gender")} onChange={(event) => setValue("gender", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></SelectField><div className="member-form-section-heading"><h3>Vehicle information</h3></div><label className="settings-label">Make<Input {...register("vehicleMake")} placeholder="Toyota" /></label><label className="settings-label">Model<Input {...register("vehicleModel")} placeholder="Corolla" /></label><label className="settings-label">Variant<Input {...register("vehicleVariant")} placeholder="Altis" /></label><label className="settings-label">Color <span className="muted-copy">(optional)</span><Input {...register("vehicleColor")} placeholder="White" /></label><label className="settings-label">Vehicle license plate<Input {...register("vehicleLicensePlate")} placeholder="ABC-123" /></label><div className="member-form-section-heading"><h3>Workspace assignment</h3></div><SelectField label="Assigned space" value={watch("space")} hint={error("space")} disabled={!spaces.length} onChange={(event) => setValue("space", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">{spaces.length ? "Select an available space" : "No available spaces"}</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.label}{space.zone ? ` · ${space.zone}` : ""}</option>)}</SelectField>{!spaces.length ? <p className="lead-form-info">There are no available spaces. Add or free a workspace before adding this member.</p> : null}<div className="inline-form-actions member-form-actions"><Button type="button" variant="danger" onClick={onCancel} disabled={formState.isSubmitting}>Cancel</Button><Button type="submit" loading={formState.isSubmitting} disabled={formState.isSubmitting || !spaces.length}><UserPlus size={15} /> Add team member</Button></div></form></div>;
}

function CompanyReactivationDialog({ company, members, spaces, canEditInvoices, loading, onCancel, onSave }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [invoiceRecipientId, setInvoiceRecipientId] = useState("");
  const [rentError, setRentError] = useState("");
  const companySpaces = useMemo(() => spaces.filter((space) => companyWorkspaceHasCapacity(space, members, company?.name)), [company?.name, members, spaces]);
  const companyMembers = useMemo(() => members.filter((member) => String(member?.company || "").trim().toLowerCase() === String(company?.name || "").trim().toLowerCase()), [company?.name, members]);

  const submit = () => {
    const parsedRent = Number(String(monthlyRent || "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsedRent) || parsedRent <= 0) {
      setRentError("Enter a monthly rent greater than PKR 0.");
      return;
    }
    setRentError("");
    void onSave(workspaceId, parsedRent, invoiceRecipientId || null);
  };

  return <Dialog open onClose={() => { if (!loading) onCancel(); }} ariaLabel="Reactivate company">
    <div className="dialog-content member-form-card member-lifecycle-dialog">
      <div className="card-heading"><div><h2>Reactivate company</h2><p className="muted-copy">Choose the workspace and monthly rent for all {companyMembers.length} linked member{companyMembers.length === 1 ? "" : "s"}.</p></div></div>
      <div className="company-reactivation-fields">
        <SelectField label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
          <option value="">Select a workspace</option>
          {companySpaces.map((space) => <option value={space.id} key={space.id}>{space.label}{space.zone ? ` · ${space.zone}` : ""}</option>)}
        </SelectField>
        <SelectField label="Invoice recipient (optional)" value={invoiceRecipientId} disabled={!canEditInvoices} onChange={(event) => setInvoiceRecipientId(event.target.value)}>
          <option value="">Configure later</option>
          {companyMembers.map((member) => <option value={member.id} key={member.id}>{member.member}{member.email ? ` · ${member.email}` : ""}</option>)}
        </SelectField>
      </div>
      {!companySpaces.length ? <p className="lead-form-info">No workspace has enough available capacity for all company members.</p> : null}
      <label className="settings-label">Monthly rent<Input type="number" min="0.01" step="0.01" value={monthlyRent} onChange={(event) => { setMonthlyRent(event.target.value); if (rentError) setRentError(""); }} className={rentError ? "has-error" : ""} placeholder="0" aria-invalid={Boolean(rentError)} />{rentError ? <span className="lead-form-error">{rentError}</span> : null}</label>
      {!canEditInvoices ? <p className="lead-form-info">Invoice recipients can be configured later by a user with invoice management permission.</p> : null}
      <div className="member-form-actions inline-form-actions">
        <Button type="button" variant="danger" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button type="button" loading={loading} disabled={loading || !workspaceId || !monthlyRent} onClick={submit}><Power size={15} /> Reactivate company</Button>
      </div>
    </div>
  </Dialog>;
}

export default function CompaniesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const canView = useHasPermission("companies.read");
  const canEdit = useHasPermission("companies.write");
  const canAddTeamMember = useHasPermission("members.write");
  const canViewInvoices = useHasPermission("invoices.read");
  const canEditInvoices = useHasPermission("invoices.write");
  const queryClient = useQueryClient();
  const companiesQuery = useQuery({ queryKey: queryKeys.companies.all, queryFn: fetchCompaniesSnapshot, enabled: canView });
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot, enabled: canView });
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces.all, queryFn: fetchWorkspacesSnapshot, enabled: canView });
  const automationQuery = useQuery({ queryKey: queryKeys.invoices.automation, queryFn: fetchInvoiceAutomationSettings, enabled: canView && canViewInvoices });
  const hydratedMissingKey = useRef("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [companyView, setCompanyView] = useState("active");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [teamMemberCompany, setTeamMemberCompany] = useState<any | null>(null);
  const [reactivatingCompany, setReactivatingCompany] = useState<any | null>(null);
  const [statusChangingId, setStatusChangingId] = useState("");
  const invoiceRecipientIds = useMemo(() => automationQuery.data ? new Set(automationQuery.data.enabled ? (automationQuery.data.memberIds || []).map((id) => String(id)) : []) : null, [automationQuery.data]);

  useEffect(() => {
    if (!canView) {
      setCompanies([]);
      setMembers([]);
      return;
    }
    return undefined;
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

    if (canEdit && missingCompanies.length > 0 && hydratedMissingKey.current !== missingKey) {
      hydratedMissingKey.current = missingKey;
      void Promise.all(missingCompanies.map((name) => createSupabaseCompany(name))).then((createdRows) => {
        const nextCompanies = [...loadedCompanies, ...createdRows.map(mapSupabaseCompanyToOsCompany)];
        setCompanies(nextCompanies);
        queryClient.setQueryData(queryKeys.companies.all, (current: any) => ({ ...(current || { dataSource: "supabase", errorMessage: "" }), companies: nextCompanies, errorMessage: "" }));
      }).catch((error) => showToast({ variant: "error", title: "Companies could not be completed", message: error?.message || "We couldn’t create the missing company records. Please try again." }));
    }

    if (membersQuery.data.errorMessage) showToast({ variant: "error", title: "Company members could not be refreshed", message: membersQuery.data.errorMessage });
    if (companiesQuery.data.errorMessage) showToast({ variant: "error", title: "Companies could not be refreshed", message: companiesQuery.data.errorMessage });
  }, [canEdit, canView, companiesQuery.data, membersQuery.data, queryClient, showToast]);

  useEffect(() => {
    if (!canView || !workspacesQuery.data) return;
    setSpaces(workspacesQuery.data.workspaces);
    if (workspacesQuery.data.errorMessage) showToast({ variant: "error", title: "Workspaces could not be refreshed", message: workspacesQuery.data.errorMessage });
  }, [canView, showToast, workspacesQuery.data]);

  const persistCompanies = (nextCompanies) => {
    setCompanies(nextCompanies);
    queryClient.setQueryData(queryKeys.companies.all, (current: any) => ({ ...(current || { dataSource: "supabase", errorMessage: "" }), companies: nextCompanies, errorMessage: "" }));
  };
  const persistMembers = (nextMembers) => {
    setMembers(nextMembers);
    queryClient.setQueryData(queryKeys.members.all, (current: any) => ({ ...(current || { dataSource: "supabase", errorMessage: "" }), members: nextMembers, errorMessage: "" }));
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
    if (!isActiveCompany(teamMemberCompany)) {
      showToast({ variant: "error", title: "Company is deactivated", message: "Reactivate the company before adding a team member." });
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
      vehicleMake: values.vehicleMake?.trim() || "",
      vehicleModel: values.vehicleModel?.trim() || "",
      vehicleVariant: values.vehicleVariant?.trim() || "",
      vehicleColor: values.vehicleColor?.trim() || "",
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
      queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({ ...(current || { dataSource: "supabase", errorMessage: "" }), workspaces: nextSpaces, errorMessage: "" }));
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
    setStatusChangingId(String(company.id));
    try {
      const companyRow = await updateSupabaseCompanyStatus(company.id, nextStatus === "Active" ? "active" : "inactive");
      const nextCompany = mapSupabaseCompanyToOsCompany(companyRow);
      const nextCompanies = companies.map((item) => item.id === company.id ? { ...item, ...nextCompany } : item);
      persistCompanies(nextCompanies);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.automation, refetchType: "active" }),
      ]);
      showToast({
        variant: "success",
        title: `Company ${nextStatus === "Active" ? "activated" : "deactivated"}`,
        message: `${company.name} was updated successfully.`,
      });
    } catch (error) {
      showToast({ variant: "error", title: "Company status was not changed", message: "We couldn’t update this company. Please try again." });
    } finally {
      setStatusChangingId("");
    }
  };

  const reactivateCompany = async (company, workspaceId, monthlyRent, invoiceRecipientId) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can change company status." }); return; }
    setStatusChangingId(String(company.id));
    try {
      const companyRow = await updateSupabaseCompanyStatus(company.id, "active", workspaceId, monthlyRent, invoiceRecipientId);
      const nextCompany = mapSupabaseCompanyToOsCompany(companyRow);
      persistCompanies(companies.map((item) => item.id === company.id ? { ...item, ...nextCompany } : item));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.automation, refetchType: "active" }),
      ]);
      setReactivatingCompany(null);
      showToast({ variant: "success", title: "Company reactivated", message: invoiceRecipientId ? `${company.name} and its members were assigned to the selected workspace and billing was configured.` : `${company.name} and its members were assigned to the selected workspace. You can configure billing later.` });
    } catch (error) {
      showToast({ variant: "error", title: "Company reactivation failed", message: error instanceof Error ? error.message : "The company could not be reactivated." });
    } finally {
      setStatusChangingId("");
    }
  };

  const visibleCompanies = useMemo(() => companies.map((company) => ({ ...company, memberCount: members.filter((member) => String(member.company || "").trim().toLowerCase() === company.name.trim().toLowerCase()).length })).filter((company) => (companyView === "active" ? isActiveCompany(company) : !isActiveCompany(company)) && company.name.toLowerCase().includes(query.toLowerCase().trim())), [companies, members, companyView, query]);
  const activeCount = companies.filter(isActiveCompany).length;
  const deactivatedCount = companies.length - activeCount;
  const availableSpaces = useMemo(() => spaces.filter((space) => workspaceHasCapacity(space, members)), [spaces, members]);
  const exportCompanies = () => {
    if (!visibleCompanies.length) {
      showToast({ variant: "error", title: "Nothing to export", message: "No companies match the current search and view." });
      return;
    }
    const rows = visibleCompanies.map((company) => ({ ...company, monthlyRent: formatCompanyMonthlyRent(company.name, members, invoiceRecipientIds) }));
    const blob = new Blob([`\uFEFF${companiesCsv(rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast({ variant: "success", title: "Companies exported", message: `${rows.length} compan${rows.length === 1 ? "y" : "ies"} downloaded as CSV.` });
  };

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Company records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Companies — View access.</div></motion.div>;

  return <motion.div className="module-content companies-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Manage company records separately from the member directory.</p></div><div className="header-actions"><Button onClick={exportCompanies} disabled={!visibleCompanies.length}><Download size={16} /> Export companies</Button>{canEdit ? <Button onClick={() => setShowForm(true)}><CirclePlus size={16} /> Add company</Button> : <span className="read-only-label">Admin editing only</span>}</div></div><section className="stat-grid module-stats"><KpiCard icon={<Building2 size={18} />} label="Total companies" value={companies.length} detail="Saved company records" /><KpiCard icon={<Building2 size={18} />} label="Activated" value={activeCount} detail="Available for assignments" /><KpiCard icon={<Power size={18} />} label="Deactivated" value={deactivatedCount} detail="Hidden from the active view" /></section><div className="leads-toolbar page-search-row"><div className="header-search-wrap page-search-wrap"><Search size={14} className="search-leading-icon" /><input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search companies" className="search-input" /><div className="search-kbd-pill"><span>Ctrl K</span></div></div></div><div className="section-heading"><div><h2>{companyView === "active" ? "Activated companies" : "Deactivated companies"}</h2><p className="muted-copy">Keep this table focused and easy to scan.</p></div><div className="directory-view-toggle" role="group" aria-label="Company status filter"><button className={companyView === "active" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("active")}>Activated ({activeCount})</button><button className={companyView === "deactivated" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("deactivated")}>Deactivated ({deactivatedCount})</button></div></div><DataTable title={companyView === "active" ? "Activated companies" : "Deactivated companies"} subtitle="Keep this table focused and easy to scan." columns={createCompanyColumns(toggleCompanyStatus, (company) => setReactivatingCompany(company), (company) => setTeamMemberCompany(company), (company) => router.push(`/companies/${encodeURIComponent(String(company.id))}`), canEdit, canAddTeamMember, statusChangingId, members, invoiceRecipientIds)} data={visibleCompanies} onRowClick={(company) => router.push(`/companies/${encodeURIComponent(String(company.id))}`)} emptyMessage={companyView === "active" ? "No activated companies found." : "No deactivated companies found."} /><Dialog open={showForm} onClose={() => setShowForm(false)} ariaLabel="Add company"><CompanyForm onCancel={() => setShowForm(false)} onSave={addCompany} /></Dialog><Dialog open={Boolean(teamMemberCompany)} onClose={() => setTeamMemberCompany(null)} ariaLabel="Add team member">{teamMemberCompany ? <TeamMemberForm company={teamMemberCompany} spaces={availableSpaces} onCancel={() => setTeamMemberCompany(null)} onSave={addTeamMember} /> : null}</Dialog>{reactivatingCompany ? <CompanyReactivationDialog company={reactivatingCompany} members={members} spaces={spaces} canEditInvoices={canEditInvoices} loading={statusChangingId === String(reactivatingCompany.id)} onCancel={() => setReactivatingCompany(null)} onSave={(workspaceId, monthlyRent, invoiceRecipientId) => reactivateCompany(reactivatingCompany, workspaceId, monthlyRent, invoiceRecipientId)} /> : null}</motion.div>;
}
