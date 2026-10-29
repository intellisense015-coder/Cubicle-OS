"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { Building2, CirclePlus, Power, Search } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";
import { closeCurrentMembership } from "@/lib/member-lifecycle";
import { useHasPermission } from "@/lib/access-control";
import { createSupabaseCompany, fetchSupabaseCompanies, mapSupabaseCompanyToOsCompany, updateSupabaseCompanyStatus } from "@/lib/supabase/companies";
import { fetchSupabaseMembers, mapSupabaseMemberToOsMember, updateSupabaseMember } from "@/lib/supabase/members";
import { assignSupabaseMemberToWorkspace } from "@/lib/supabase/workspaces";

const companySchema = z.object({ name: z.string().trim().min(1, "Enter the company name.") });

function normalizeCompanyRecord(company, index = 0) {
  const record = typeof company === "string" ? { name: company } : (company || {});
  return { ...record, id: record.id || `company-${index}`, name: String(record.name || record.company || "").trim(), status: record.status === "Inactive" || record.status === "Deactivated" ? "Inactive" : "Active" };
}

function isActiveCompany(company) {
  return ["active", "activated"].includes(String(company?.status || "").trim().toLowerCase());
}

function isActiveMember(member) {
  return ["active", "activated"].includes(String(member?.status || "").trim().toLowerCase());
}

function createCompanyColumns(onToggleStatus, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("name", {
      header: "Company",
      cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong><span>{row.original.memberCount} member{row.original.memberCount === 1 ? "" : "s"}</span></div>,
    }),
    columnHelper.accessor("memberCount", { header: "Members" }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ getValue }) => <span className={`status-tag status-${String(getValue() || "Inactive").toLowerCase().replaceAll(" ", "-")}`}>{getValue() === "Active" ? "Activated" : "Deactivated"}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Action",
      cell: ({ row }) => canEdit ? <button className="table-action" type="button" onClick={() => onToggleStatus(row.original)}><Power size={13} /> {row.original.status === "Active" ? "Deactivate" : "Activate"}</button> : <span className="read-only-label">Read only</span>,
    }),
  ];
}

function CompanyForm({ onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(companySchema), defaultValues: { name: "" }, mode: "onBlur" });
  const { register, handleSubmit, formState } = formApi;
  const error = formState.errors.name?.message;
  return <div className="dialog-content"><div className="card-heading"><div><span className="seat-details-label">New company</span><h2>Add company</h2><p className="muted-copy">Create a company record for member assignments.</p></div></div><form onSubmit={handleSubmit((values) => onSave({ id: `company-${Date.now()}`, name: values.name.trim(), status: "Active" }))}><label className="settings-label">Company name<Input className={error ? "has-error" : ""} {...register("name")} aria-invalid={Boolean(error)} />{error && <span className="lead-form-error">{error}</span>}</label><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Building2 size={15} /> Save company</Button></div></form></div>;
}

export default function CompaniesPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("companies.read");
  const canEdit = useHasPermission("companies.write");
  const [companies, setCompanies] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [companyView, setCompanyView] = useState("active");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!canView) {
        setCompanies([]);
        setMembers([]);
        return;
      }
      try {
        const [companyRows, memberRows] = await Promise.all([fetchSupabaseCompanies(), fetchSupabaseMembers()]);
        const loadedMembers = memberRows.map(mapSupabaseMemberToOsMember);
        const loadedCompanies = companyRows.map(mapSupabaseCompanyToOsCompany);
        const knownNames = new Set(loadedCompanies.map((company) => company.name.trim().toLowerCase()));
        const missingCompanies = [...new Set(loadedMembers.map((member) => String(member.company || "").trim()).filter((name) => name && name !== "Unassigned" && name !== "No company" && !knownNames.has(name.toLowerCase())))];
        // Loading a read-only company directory must never try to create rows.
        // Members can contain a company name before a canonical companies row
        // exists, so show that name locally until an editor creates it.
        const createdCompanies = canEdit
          ? await Promise.all(missingCompanies.map((name) => createSupabaseCompany(name)))
          : [];
        const inferredCompanies = canEdit
          ? []
          : missingCompanies.map((name, index) => ({ id: `inferred-company-${index}`, name, status: "Active" }));
        const nextCompanies = [...loadedCompanies, ...createdCompanies.map(mapSupabaseCompanyToOsCompany), ...inferredCompanies];
        if (!cancelled) {
          setMembers(loadedMembers);
          setCompanies(nextCompanies);
          saveDemoValue("members", loadedMembers);
          saveDemoValue("companies", nextCompanies);
        }
      } catch (error) {
        if (!cancelled) {
          setMembers([]);
          setCompanies([]);
          showToast({ variant: "error", title: "Companies could not be loaded", message: error?.message || "Supabase did not return the company records." });
        }
      }
    };
    void refresh();
    const handleDemoChange = (event) => {
      if (["members", "companies"].includes(event.detail?.key || "")) void refresh();
    };
    window.addEventListener("cubicle-demo-change", handleDemoChange);
    return () => { cancelled = true; window.removeEventListener("cubicle-demo-change", handleDemoChange); };
  }, [canEdit, canView, showToast]);

  const addCompany = async (company) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can add company records." }); return; }
    try {
      const row = await createSupabaseCompany(company.name);
      const nextCompany = normalizeCompanyRecord(mapSupabaseCompanyToOsCompany(row), companies.length);
      const nextCompanies = [nextCompany, ...companies.filter((item) => item.name.toLowerCase() !== nextCompany.name.toLowerCase())];
      setCompanies(nextCompanies);
      saveDemoValue("companies", nextCompanies);
      setShowForm(false);
      showToast({ variant: "success", title: "Company added", message: `${nextCompany.name} was saved to Supabase.` });
    } catch (error) {
      showToast({ variant: "error", title: "Company was not saved", message: error?.message || "Supabase could not save this company." });
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
          saveDemoValue("workspaces", nextWorkspaces);
        }
      }

      setCompanies(nextCompanies);
      setMembers(nextMembers);
      saveDemoValue("companies", nextCompanies);
      saveDemoValue("members", nextMembers);
      setSelectedCompany((current) => current?.id === company.id ? { ...company, ...nextCompany } : current);
      showToast({
        variant: "success",
        title: `Company ${nextStatus === "Active" ? "activated" : "deactivated"}`,
        message: nextStatus === "Inactive" && associatedMembers.length > 0
          ? `${company.name} and ${associatedMembers.length} associated member${associatedMembers.length === 1 ? "" : "s"} were saved to Supabase.`
          : `${company.name} was saved to Supabase.`,
      });
    } catch (error) {
      showToast({ variant: "error", title: "Company status was not changed", message: error?.message || "Supabase could not update this company." });
    }
  };

  const visibleCompanies = useMemo(() => companies.map((company) => ({ ...company, memberCount: members.filter((member) => String(member.company || "").trim().toLowerCase() === company.name.trim().toLowerCase()).length })).filter((company) => (companyView === "active" ? isActiveCompany(company) : !isActiveCompany(company)) && company.name.toLowerCase().includes(query.toLowerCase().trim())), [companies, members, companyView, query]);
  const activeCount = companies.filter(isActiveCompany).length;
  const deactivatedCount = companies.length - activeCount;
  const selectedCompanyMembers = selectedCompany ? members.filter((member) => String(member.company || "").trim().toLowerCase() === String(selectedCompany.name || "").trim().toLowerCase()) : [];

  if (!canView) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Company records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Companies — View access.</div></motion.div></PageShell>;

  return <PageShell><motion.div className="module-content companies-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Companies</h1><p className="muted-copy">Manage company records separately from the member directory.</p></div>{canEdit ? <Button onClick={() => setShowForm(true)}><CirclePlus size={16} /> Add company</Button> : <span className="read-only-label">Admin editing only</span>}</div><section className="stat-grid module-stats"><KpiCard icon={<Building2 size={18} />} label="Total companies" value={companies.length} detail="Saved company records" /><KpiCard icon={<Building2 size={18} />} label="Activated" value={activeCount} detail="Available for assignments" /><KpiCard icon={<Power size={18} />} label="Deactivated" value={deactivatedCount} detail="Hidden from the active view" /></section><div className="leads-toolbar"><div className="leads-search-wrap"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies" aria-label="Search companies" /></div></div><div className="section-heading"><div><h2>{companyView === "active" ? "Activated companies" : "Deactivated companies"}</h2><p className="muted-copy">Keep this table focused and easy to scan.</p></div><div className="directory-view-toggle" role="group" aria-label="Company status filter"><button className={companyView === "active" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("active")}>Activated ({activeCount})</button><button className={companyView === "deactivated" ? "is-selected" : ""} type="button" onClick={() => setCompanyView("deactivated")}>Deactivated ({deactivatedCount})</button></div></div><DataTable columns={createCompanyColumns(toggleCompanyStatus, canEdit)} data={visibleCompanies} onRowClick={(company) => setSelectedCompany(company)} emptyMessage={companyView === "active" ? "No activated companies found." : "No deactivated companies found."} /><Dialog open={Boolean(selectedCompany)} onClose={() => setSelectedCompany(null)} ariaLabel="Company details">{selectedCompany ? <div className="dialog-content company-details-dialog"><div className="card-heading"><div><span className="seat-details-label">Company profile</span><h2>{selectedCompany.name}</h2><p className="muted-copy">{selectedCompanyMembers.length} member{selectedCompanyMembers.length === 1 ? "" : "s"} linked to this company</p></div><span className={`status-tag ${isActiveCompany(selectedCompany) ? "status-active" : "status-inactive"}`}>{isActiveCompany(selectedCompany) ? "Activated" : "Deactivated"}</span></div><div className="company-member-detail-list">{selectedCompanyMembers.length > 0 ? selectedCompanyMembers.map((member) => <article className="company-member-detail-card" key={member.id}><div className="company-member-detail-heading"><div><strong>{member.member || "Unnamed member"}</strong><span>{member.email || member.phone || "Contact details not recorded"}</span></div><span className={`status-tag ${isActiveMember(member) ? "status-active" : "status-inactive"}`}>{isActiveMember(member) ? "Activated" : "Deactivated"}</span></div><dl className="company-member-detail-grid"><div><dt>Member ID</dt><dd>{member.id || "—"}</dd></div><div><dt>Email</dt><dd>{member.email || "—"}</dd></div><div><dt>Phone</dt><dd>{member.phone || "—"}</dd></div><div><dt>Assigned space</dt><dd>{member.space || member.spaceId || "Unassigned"}</dd></div><div><dt>Monthly rent</dt><dd>{member.rent || "—"}</dd></div><div><dt>Security deposit</dt><dd>{member.deposit || "—"}</dd></div><div><dt>Joined</dt><dd>{member.joined || "—"}</dd></div><div><dt>Billing start</dt><dd>{member.billingStartDate || "—"}</dd></div><div><dt>Due day</dt><dd>{member.dueDay ? `Day ${member.dueDay}` : "—"}</dd></div></dl></article>) : <div className="table-empty-state">No members are linked to this company.</div>}</div><div className="dialog-actions"><Button variant="ghost" onClick={() => setSelectedCompany(null)}>Close</Button></div></div> : null}</Dialog><Dialog open={showForm} onClose={() => setShowForm(false)} ariaLabel="Add company"><CompanyForm onCancel={() => setShowForm(false)} onSave={addCompany} /></Dialog></motion.div></PageShell>;
}
