"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { CreditCard, FileCheck2, Receipt, WalletCards } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";

import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DetailPageHeader } from "@/components/ui/detail-page-header";
import { normalizeMembershipStatus } from "@/lib/member-lifecycle";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchInvoicesSnapshot } from "@/lib/invoice-query";

const amountValue = (value) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const money = (value) => `PKR ${value.toLocaleString("en-PK")}`;

function createLedgerColumns() {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("date", { header: "Date" }),
    columnHelper.accessor("description", { header: "Description" }),
    columnHelper.accessor("type", { header: "Type" }),
    columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Paid" ? "success" : getValue() === "Overdue" ? "danger" : "accent"}>{getValue()}</StatusBadge> }),
  ];
}

export default function MemberLedgerPage({ params }) {
  const routeParams = use<any>(params);
  const membersQuery = useQuery({ queryKey: queryKeys.members.all, queryFn: fetchMembersSnapshot });
  const invoicesQuery = useQuery({ queryKey: queryKeys.invoices.all, queryFn: fetchInvoicesSnapshot });
  const member = useMemo(() => membersQuery.data?.members.find((item) => String(item.id) === String(routeParams.id)) || null, [membersQuery.data?.members, routeParams.id]);
  const invoices = invoicesQuery.data?.invoices || [];
  const ledger: any[] = [];

  const matchingInvoices = useMemo(() => member ? invoices.filter((invoice) => invoice.memberId ? invoice.memberId === member.id : invoice.account?.includes(member.member)) : [], [invoices, member]);
  const history = useMemo(() => [...ledger, ...matchingInvoices.filter((invoice) => invoice.paymentStatus === "Paid").map((invoice) => ({ id: `invoice-${invoice.invoice}`, date: invoice.issueDate, description: invoice.itemDescription || "Invoice payment", type: "Invoice", amount: invoice.amount, status: "Paid" }))].sort((a, b) => String(b.date).localeCompare(String(a.date))), [ledger, matchingInvoices]);
  const membershipPeriods = Array.isArray(member?.membershipPeriods) ? member.membershipPeriods : [];
  const totalPaid = useMemo(() => history.filter((item) => item.status === "Paid" || item.type === "Payment").reduce((total, item) => total + amountValue(item.amount), 0), [history]);
  const dueInvoices = matchingInvoices.filter((invoice) => invoice.paymentStatus !== "Paid").length;
  const deposit = amountValue(member?.deposit);

  if (membersQuery.isPending || invoicesQuery.isPending) return <div className="module-content"><p className="muted-copy">Loading member ledger…</p></div>;
  if (!member) return <div className="module-content"><p className="muted-copy">Member not found.</p><Link href="/members" className="journey-back-button">Back to members</Link></div>;

  const membershipStatus = normalizeMembershipStatus(member.membershipStatus);
  const membershipSummary = membershipStatus === "Notice period" && member.expectedLeavingDate ? `${membershipStatus} until ${member.expectedLeavingDate}` : membershipStatus;
  return <motion.div className="module-content member-ledger-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/members" backLabel="Back to members" title={member.member} description={`${member.company || "No company"} · ${member.team || "No team"} · ${member.space || "Unassigned"} · ${membershipSummary}`} /><section className="stat-grid finance-stat-grid module-stats"><KpiCard icon={<WalletCards size={18} />} label="Total amount paid" value={money(totalPaid)} detail="Recorded payment history" /><KpiCard icon={<FileCheck2 size={18} />} label="Due invoices" value={dueInvoices} detail={dueInvoices ? "Needs attention" : "No outstanding invoices"} /><KpiCard icon={<Receipt size={18} />} label="Security deposit" value={money(deposit)} detail="Held for this member" /><KpiCard icon={<CreditCard size={18} />} label="Member since" value={member.firstJoined || member.joined || "Not recorded"} detail="First joining date" /></section>{membershipPeriods.length ? <section className="settings-card membership-history-card"><div className="section-heading"><div><h2>Membership history</h2><p className="muted-copy">Previous stays, teams and billing periods remain attached to this member.</p></div></div><div className="membership-history-list">{membershipPeriods.map((period) => <article className="membership-history-row" key={period.id}><div><strong>{period.company || "No company"}</strong><span>{period.team || "No team"} · {period.space || "Unassigned"}</span></div><div><strong>{period.startDate || "—"} {period.endDate ? `→ ${period.endDate}` : "→ Current"}</strong><span>{period.rent || "PKR 0"} · {period.status}</span></div></article>)}</div></section> : null}<DataTable title="Payment history" subtitle="All recorded payments and paid invoices for this member." columns={createLedgerColumns()} data={history} emptyMessage="No payment history yet." /></motion.div>;
}
