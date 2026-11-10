"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";

import { DataTable } from "@/components/ui/table";
import { DetailPageHeader } from "@/components/ui/detail-page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";
import { useHasPermission } from "@/lib/access-control";
import { fetchCompaniesSnapshot } from "@/lib/company-query";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { normalizeMembershipStatus } from "@/lib/member-lifecycle";
import { queryKeys } from "@/lib/query-keys";

function formatDate(value) {
  const dateKey = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function isActiveCompany(company) {
  return ["active", "activated"].includes(String(company?.status || "").trim().toLowerCase());
}

function createMemberColumns() {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("member", {
      header: "Member",
      cell: ({ row }) => <div className="table-primary"><strong>{row.original.member || "Unnamed member"}</strong><span>{row.original.email || "No email recorded"}</span></div>,
    }),
    columnHelper.accessor("phone", { header: "Phone", cell: ({ getValue }) => getValue() || "—" }),
    columnHelper.accessor("space", { header: "Assigned space", cell: ({ row }) => <WorkspaceBadge value={row.original.space || row.original.spaceId || "Unassigned"} /> }),
    columnHelper.display({ id: "membership", header: "Membership", cell: ({ row }) => { const status = normalizeMembershipStatus(row.original.membershipStatus || row.original.status); return <StatusBadge tone={status === "Active" ? "success" : "warning"}>{status}</StatusBadge>; } }),
    columnHelper.accessor("joined", { header: "Joined", cell: ({ getValue }) => formatDate(getValue()) }),
    columnHelper.accessor("billingStartDate", { header: "Billing start", cell: ({ getValue }) => formatDate(getValue()) }),
  ];
}

export default function CompanyMembersPage({ params }) {
  const routeParams = use<any>(params);
  const canView = useHasPermission("companies.read");
  const companiesQuery = useQuery({ queryKey: queryKeys.companies.all, queryFn: fetchCompaniesSnapshot, enabled: canView });
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot, enabled: canView });

  const company = useMemo(() => (companiesQuery.data?.companies || []).find((item) => String(item.id) === String(routeParams.id)), [companiesQuery.data, routeParams.id]);
  const companyMembers = useMemo(() => {
    if (!company) return [];
    const companyKey = String(company.name || "").trim().toLowerCase();
    return (membersQuery.data?.members || []).filter((member) => String(member.company || "").trim().toLowerCase() === companyKey);
  }, [company, membersQuery.data]);

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title="Company members" description="Company records are restricted for this account." /><div className="table-empty-state">Ask an owner or administrator to grant Companies — View access.</div></motion.div>;

  if (!company && !companiesQuery.isPending) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title="Company not found" description="The requested company could not be found." /><div className="table-empty-state"><Link href="/companies" className="journey-back-button">Back to companies</Link></div></motion.div>;

  const companyName = company?.name || "Company members";
  const status = company && isActiveCompany(company) ? "Activated" : "Deactivated";
  return <motion.div className="module-content company-members-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/companies" backLabel="Back to companies" iconOnlyBack title={companyName} description={`${status} · ${companyMembers.length} member${companyMembers.length === 1 ? "" : "s"}`} /><DataTable title="Members" subtitle={`Members linked to ${companyName}.`} columns={createMemberColumns()} data={companyMembers} emptyMessage="No members are linked to this company." emptySubtitle="Members added to this company will appear here." /></motion.div>;
}
