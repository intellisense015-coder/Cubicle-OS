"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Share2 } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Dialog, Modal } from "@/components/ui/dialog";
import { MemberForm } from "@/components/os/member-form";
import { MemberLifecycleControls, type MemberLifecycleAction } from "@/components/os/member-lifecycle-controls";
import { DataTable } from "@/components/ui/table";
import { DetailPageHeader } from "@/components/ui/detail-page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";
import { fetchCompaniesSnapshot } from "@/lib/company-query";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchQuotationsSnapshot } from "@/lib/quotation-query";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { normalizeMembershipStatus } from "@/lib/member-lifecycle";
import { queryKeys } from "@/lib/query-keys";
import { fetchInvoiceAutomationSettings } from "@/lib/supabase/invoice-automation";
import { mapSupabaseMemberToOsMember, transitionSupabaseMemberLifecycle, updateSupabaseMember } from "@/lib/supabase/members";
import { assignSupabaseMemberToSharedWorkspace, assignSupabaseMemberToWorkspace } from "@/lib/supabase/workspaces";

function formatDate(value) {
  const dateKey = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.startsWith("92") && digits.length === 12) return `+92 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return String(value);
}

function formatCnic(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 13) return value ? String(value) : "—";
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function isInactiveMember(member) {
  return !["active", "activated"].includes(String(member?.status || "").trim().toLowerCase());
}

function getDeactivationDate(member) {
  if (!isInactiveMember(member)) return "";
  if (member?.deactivatedAt) return member.deactivatedAt;
  const periods = Array.isArray(member?.membershipPeriods) ? member.membershipPeriods : [];
  return [...periods].reverse().find((period) => String(period?.status || "").toLowerCase() === "completed" && period?.endDate)?.endDate || "";
}

function MemberDetailItem({ label, value }) {
  return <div className="company-member-detail-item"><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function MemberDetailsModal({ member, onClose }) {
  const { showToast } = useToast();
  if (!member) return null;

  const shareText = [
    `Member: ${member.member || "Unnamed member"}`,
    `Email: ${member.email || "—"}`,
    `Phone: ${formatPhone(member.phone)}`,
    `CNIC: ${formatCnic(member.cnic)}`,
    `Gender: ${member.gender || "—"}`,
    `Vehicle make: ${member.vehicleMake || "—"}`,
    `Vehicle model: ${member.vehicleModel || "—"}`,
    `Vehicle variant: ${member.vehicleVariant || "—"}`,
    `License plate: ${member.vehicleLicensePlate || "—"}`,
    member.vehicleColor ? `Color: ${member.vehicleColor}` : null,
  ].filter(Boolean).join("\n");

  const handleShare = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: member.member || "Member details", text: shareText });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        showToast({ variant: "success", title: "Member details copied", message: "The member information is ready to share." });
      }
    } catch {
      showToast({ variant: "error", title: "Sharing was cancelled", message: "The member details were not shared." });
    }
  };

  return <Modal open={Boolean(member)} onClose={onClose} title={member.member || "Member details"} description={member.company || "Member details"} footerActions={<div className="company-member-detail-actions"><Button variant="danger" size="lg" onClick={onClose}>Close</Button><Button variant="brand" size="lg" onClick={handleShare}><Share2 size={17} /> Share member</Button></div>}>
    <div className="company-member-detail-content">
      <section className="company-member-detail-section">
        <h3>Member details</h3>
        <div className="company-member-detail-grid">
          <MemberDetailItem label="Name" value={member.member} />
          <MemberDetailItem label="Email" value={member.email} />
          <MemberDetailItem label="Phone" value={formatPhone(member.phone)} />
          <MemberDetailItem label="CNIC" value={formatCnic(member.cnic)} />
          <MemberDetailItem label="Gender" value={member.gender} />
        </div>
      </section>
      <section className="company-member-detail-section">
        <h3>Vehicle information</h3>
        <div className="company-member-detail-grid">
          <MemberDetailItem label="Make" value={member.vehicleMake} />
          <MemberDetailItem label="Model" value={member.vehicleModel} />
          <MemberDetailItem label="Variant" value={member.vehicleVariant} />
          {member.vehicleColor ? <MemberDetailItem label="Color" value={member.vehicleColor} /> : null}
          <MemberDetailItem label="License plate" value={member.vehicleLicensePlate} />
        </div>
      </section>
    </div>
  </Modal>;
}

function isActiveCompany(company) {
  return ["active", "activated"].includes(String(company?.status || "").trim().toLowerCase());
}

function assignedSpaceLabel(member: any, workspaces: any[]) {
  const spaceId = String(member?.spaceId || "").trim();
  const rawSpace = String(member?.space || "").trim();
  const workspace = (Array.isArray(workspaces) ? workspaces : []).find((item) => String(item?.id || item?.areaId || "") === spaceId || String(item?.id || item?.areaId || "") === rawSpace);
  return workspace?.label || member?.spaceType || rawSpace || spaceId || "Unassigned";
}

function createMemberColumns(invoiceRecipientIds: Set<string> | null, canEdit: boolean, onEditMember: (member: any) => void, members: any[], onTransition: (member: any, action: MemberLifecycleAction, payload?: Record<string, unknown>) => Promise<unknown>, workspaces: any[], statusChangeId: string | null) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("member", {
      header: "Member",
      cell: ({ row }) => <div className="table-primary"><strong>{row.original.member || "Unnamed member"}</strong><span>{row.original.email || "No email recorded"}</span></div>,
    }),
    columnHelper.accessor("phone", { header: "Phone", cell: ({ getValue }) => formatPhone(getValue()) }),
    columnHelper.accessor("space", { header: "Assigned space", cell: ({ row }) => <WorkspaceBadge value={assignedSpaceLabel(row.original, workspaces)} /> }),
    columnHelper.display({ id: "membership", header: "Membership", cell: ({ row }) => { const inactive = isInactiveMember(row.original); const status = inactive ? "Inactive" : normalizeMembershipStatus(row.original.membershipStatus || row.original.status); return <StatusBadge tone={inactive ? "warning" : status === "Active" ? "success" : "warning"}>{status}</StatusBadge>; } }),
    columnHelper.display({ id: "invoiced", header: "Invoiced", cell: ({ row }) => { const isRecipient = invoiceRecipientIds?.has(String(row.original.id)); return invoiceRecipientIds ? <StatusBadge tone={isRecipient ? "success" : "neutral"}>{isRecipient ? "Yes" : "No"}</StatusBadge> : "—"; } }),
    columnHelper.accessor("joined", { header: "Activation", cell: ({ getValue }) => formatDate(getValue()) }),
    columnHelper.display({ id: "deactivation", header: "Deactivation", cell: ({ row }) => formatDate(getDeactivationDate(row.original)) }),
    columnHelper.accessor("billingStartDate", { header: "Billing start", cell: ({ getValue }) => formatDate(getValue()) }),
    columnHelper.display({
      id: "actions",
      header: "Action",
      cell: ({ row }) => <div className="member-action-cell"><MemberLifecycleControls member={row.original} members={members} workspaces={workspaces} invoiceRecipientIds={invoiceRecipientIds} canEdit={canEdit} loading={statusChangeId === String(row.original.id)} onEdit={() => onEditMember(row.original)} onTransition={(action, payload) => onTransition(row.original, action, payload)} /></div>,
    }),
  ];
}

export default function CompanyMembersPage({ params }) {
  const routeParams = use<any>(params);
  const canView = useHasPermission("companies.read");
  const canEditMembers = useHasPermission("members.write");
  const canViewInvoices = useHasPermission("invoices.read");
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const companiesQuery = useQuery({ queryKey: queryKeys.companies.all, queryFn: fetchCompaniesSnapshot, enabled: canView });
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot, enabled: canView });
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces.all, queryFn: fetchWorkspacesSnapshot, enabled: canView });
  const quotationsQuery = useQuery({ queryKey: queryKeys.quotations.all, queryFn: fetchQuotationsSnapshot, enabled: canView });
  const automationQuery = useQuery({ queryKey: queryKeys.invoices.automation, queryFn: fetchInvoiceAutomationSettings, enabled: canView && canViewInvoices });
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const invoiceRecipientIds = useMemo(() => automationQuery.data ? new Set(automationQuery.data.enabled ? (automationQuery.data.memberIds || []).map((id) => String(id)) : []) : null, [automationQuery.data]);

  const company = useMemo(() => (companiesQuery.data?.companies || []).find((item) => String(item.id) === String(routeParams.id)), [companiesQuery.data, routeParams.id]);
  const companyMembers = useMemo(() => {
    if (!company) return [];
    const companyKey = String(company.name || "").trim().toLowerCase();
    return (membersQuery.data?.members || [])
      .filter((member) => String(member.company || "").trim().toLowerCase() === companyKey)
      .sort((left, right) => {
        const inactiveOrder = Number(isInactiveMember(left)) - Number(isInactiveMember(right));
        if (inactiveOrder !== 0) return inactiveOrder;
        return Number(invoiceRecipientIds?.has(String(right.id)) || false) - Number(invoiceRecipientIds?.has(String(left.id)) || false);
      });
  }, [company, invoiceRecipientIds, membersQuery.data]);

  const openEditMember = (member: any) => {
    setEditingMember(member);
    setEditMemberOpen(true);
  };

  const closeEditMember = () => {
    setEditMemberOpen(false);
    setEditingMember(null);
  };

  const [lifecycleSavingId, setLifecycleSavingId] = useState<string | null>(null);

  const handleLifecycleTransition = async (member: any, action: MemberLifecycleAction, payload: Record<string, unknown> = {}) => {
    if (!canEditMembers) throw new Error("You do not have permission to change member lifecycle.");
    setLifecycleSavingId(String(member.id));
    try {
      const row = await transitionSupabaseMemberLifecycle(String(member.id), action, payload);
      const selectedWorkspaceId = action === "cancel_notice" ? String(payload.workspaceId || "") : "";
      if (action === "cancel_notice" && selectedWorkspaceId) await assignSupabaseMemberToSharedWorkspace(String(row.id), selectedWorkspaceId, member.spaceId || null);
      const savedRow = selectedWorkspaceId ? { ...row, assigned_space: selectedWorkspaceId } : row;
      queryClient.setQueryData(queryKeys.members.all, (current: any) => current ? { ...current, members: (current.members || []).map((item: any) => String(item.id) === String(member.id) ? { ...item, ...mapSupabaseMemberToOsMember(savedRow), id: row.id } : item), errorMessage: "" } : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.automation, refetchType: "active" }),
      ]);
      showToast({ variant: "success", title: action === "start_notice" ? "Notice period started" : action === "cancel_notice" ? "Notice period cancelled" : action === "deactivate" ? "Member deactivated" : "Member reactivated", message: "The lifecycle change was saved successfully." });
      return row;
    } finally {
      setLifecycleSavingId(null);
    }
  };

  const saveCompanyMember = async (values: any) => {
    if (!canEditMembers || !editingMember) return;
    try {
      const requestedWorkspaceId = values.spaceId || null;
      const memberWithoutWorkspace = { ...values, spaceId: "", space: "Unassigned" };
      const row = await updateSupabaseMember(values.id, memberWithoutWorkspace);
      if (requestedWorkspaceId) {
        await assignSupabaseMemberToSharedWorkspace(row.id, requestedWorkspaceId, editingMember?.spaceId || null);
      } else {
        await assignSupabaseMemberToWorkspace(row.id, null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" }),
      ]);
      closeEditMember();
      showToast({ variant: "success", title: "Member updated", message: `${values.member || "Member"}'s details are up to date.` });
    } catch (error) {
      showToast({ variant: "error", title: "Member was not saved", message: error instanceof Error ? error.message : "The requested change could not be saved." });
      throw error;
    }
  };

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title="Company members" description="Company records are restricted for this account." /><div className="table-empty-state">Ask an owner or administrator to grant Companies — View access.</div></motion.div>;

  if (!company && !companiesQuery.isPending) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title="Company not found" description="The requested company could not be found." /><div className="table-empty-state"><Link href="/companies" className="journey-back-button">Back to companies</Link></div></motion.div>;

  const companyName = company?.name || "Company members";
  const status = company && isActiveCompany(company) ? "Activated" : "Deactivated";
  return <motion.div className="module-content company-members-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title={companyName} description={`${status} · ${companyMembers.length} member${companyMembers.length === 1 ? "" : "s"}`} /><DataTable title="Members" subtitle={`Members linked to ${companyName}.`} columns={createMemberColumns(invoiceRecipientIds, canEditMembers, openEditMember, companyMembers, handleLifecycleTransition, workspacesQuery.data?.workspaces || [], lifecycleSavingId)} data={companyMembers} onRowClick={(member) => setSelectedMember(member)} emptyMessage="No members are linked to this company." emptySubtitle="Members added to this company will appear here." /><MemberDetailsModal member={selectedMember} onClose={() => setSelectedMember(null)} /><Dialog open={editMemberOpen} onClose={closeEditMember} ariaLabel="Edit member">{editingMember ? <MemberForm key={String(editingMember.id)} leads={[]} companies={companiesQuery.data?.companies || []} members={membersQuery.data?.members || []} spaces={workspacesQuery.data?.workspaces || []} quotations={quotationsQuery.data?.quotations || []} initialMember={editingMember} isInvoicedMember={Boolean(invoiceRecipientIds?.has(String(editingMember.id)))} onCancel={closeEditMember} onSave={saveCompanyMember} /> : null}</Dialog></motion.div>;
}
