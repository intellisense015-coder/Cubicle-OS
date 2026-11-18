"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { BookOpen, CreditCard, Download, Receipt, ShieldCheck, WalletCards, X } from "lucide-react";

import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableActionMenu } from "@/components/ui/table-action-menu";
import { Button } from "@/components/ui/button";
import { DatePickerField, SelectField } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";
import { fetchMembersSnapshot } from "@/lib/member-query";
import { fetchInvoicesSnapshot } from "@/lib/invoice-query";
import { queryKeys } from "@/lib/query-keys";

type LedgerEntry = {
  id: string;
  memberId: string;
  memberName: string;
  company: string;
  date: string;
  description: string;
  type: "Invoice" | "Payment" | "Deposit" | "Charge";
  amount: number;
  status: string;
  invoiceId?: string;
  invoiceNumber?: string;
  reference?: string;
};

const amountValue = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const money = (value: number) => `PKR ${Math.round(value).toLocaleString("en-PK")}`;

function dateValue(value: unknown) {
  return String(value || "").slice(0, 10);
}

function dateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value || "—" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function ledgerCsv(entries: LedgerEntry[]) {
  const header = ["Date", "Member", "Company", "Description", "Type", "Amount (PKR)", "Status", "Reference"];
  const rows = entries.map((entry) => [
    dateLabel(entry.date),
    entry.memberName,
    entry.company,
    entry.description,
    entry.type,
    Math.round(entry.amount).toString(),
    entry.status,
    entry.reference || "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["paid", "held"].includes(normalized)) return "success";
  if (["overdue", "failed", "cancelled"].includes(normalized)) return "danger";
  if (["due soon", "open", "pending"].includes(normalized)) return "warning";
  return "neutral";
}

function statusDescription(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "held") return "Security deposit currently held for the member.";
  if (normalized === "paid") return "The payment has been recorded and the invoice is paid.";
  if (normalized === "due soon") return "The invoice is still due and approaching its due date.";
  if (normalized === "overdue") return "The invoice is past its due date and remains unpaid.";
  return `${status} ledger status`;
}

function invoiceStatus(invoice: any) {
  return String(invoice.paymentStatus || "Due soon");
}

function buildLedgerEntries(members: any[], invoices: any[]) {
  const memberById = new Map(members.map((member) => [String(member.id), member]));
  const entries: LedgerEntry[] = [];

  for (const member of members) {
    const deposit = amountValue(member.deposit);
    if (deposit > 0) {
      entries.push({
        id: `deposit-${member.id}`,
        memberId: String(member.id),
        memberName: member.member || "Unknown member",
        company: member.company || "No company",
        date: dateValue(member.joined || member.firstJoined || member.billingStartDate),
        description: "Security deposit held",
        type: "Deposit",
        amount: deposit,
        status: "Held",
      });
    }
  }

  for (const invoice of invoices) {
    const member = memberById.get(String(invoice.memberId));
    if (!member) continue;
    const amount = amountValue(invoice.amount);
    if (amount <= 0) continue;
    const status = invoiceStatus(invoice);
    const invoiceDate = dateValue(invoice.issueDate || invoice.periodStart);
    entries.push({
      id: `invoice-charge-${invoice.id || invoice.invoice}`,
      memberId: String(member.id),
      memberName: member.member || invoice.account || "Unknown member",
      company: member.company || invoice.account || "No company",
      date: invoiceDate,
      description: invoice.itemDescription || "Workspace invoice",
      type: "Invoice",
      amount,
      status,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice,
      reference: invoice.invoice,
    });
    if (status.toLowerCase() === "paid") {
      entries.push({
        id: `invoice-payment-${invoice.id || invoice.invoice}`,
        memberId: String(member.id),
        memberName: member.member || invoice.account || "Unknown member",
        company: member.company || invoice.account || "No company",
        date: dateValue(invoice.updatedAt || invoice.issueDate),
        description: `Payment received for ${invoice.invoice}`,
        type: "Payment",
        amount,
        status: "Paid",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice,
        reference: invoice.invoice,
      });
    }
  }

  return entries.sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

async function fetchLedgerSnapshot() {
  const [membersSnapshot, invoicesSnapshot] = await Promise.all([fetchMembersSnapshot(), fetchInvoicesSnapshot()]);
  if (membersSnapshot.errorMessage) throw new Error(membersSnapshot.errorMessage);
  if (invoicesSnapshot.errorMessage) throw new Error(invoicesSnapshot.errorMessage);
  const members = membersSnapshot.members;
  return { members, entries: buildLedgerEntries(members, invoicesSnapshot.invoices), dataSource: "supabase" as const };
}

function createLedgerColumns(onOpen: (entry: LedgerEntry) => void) {
  const columnHelper = createColumnHelper<LedgerEntry>();
  return [
    columnHelper.accessor("date", { header: "Date", cell: ({ getValue }) => dateLabel(getValue()) }),
    columnHelper.accessor("memberName", { header: "Member", cell: ({ row }) => <div><strong>{row.original.memberName}</strong><small className="table-secondary-text">{row.original.company}</small></div> }),
    columnHelper.accessor("description", { header: "Description", cell: ({ getValue }) => <span>{getValue()}</span> }),
    columnHelper.accessor("type", { header: "Type" }),
    columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{money(getValue())}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={statusTone(getValue())} title={statusDescription(getValue())}>{getValue()}</StatusBadge> }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <TableActionMenu ariaLabel={`Actions for ${row.original.memberName}`} items={[{ label: "View ledger entry", icon: <BookOpen size={15} />, onSelect: () => onOpen(row.original) }]} /> }),
  ];
}

export default function MemberLedgersPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("invoices.read");
  const [memberFilter, setMemberFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const ledgerQuery = useQuery({
    queryKey: queryKeys.memberLedgers.all,
    queryFn: fetchLedgerSnapshot,
    enabled: canView,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const members = ledgerQuery.data?.members || [];
  const entries = ledgerQuery.data?.entries || [];
  const invoicedMemberIds = useMemo(() => new Set(entries.filter((entry) => entry.type === "Invoice").map((entry) => entry.memberId)), [entries]);
  const invoicedMembers = useMemo(() => members.filter((member) => invoicedMemberIds.has(String(member.id))), [members, invoicedMemberIds]);
  const ledgerEntries = useMemo(() => entries.filter((entry) => invoicedMemberIds.has(entry.memberId)), [entries, invoicedMemberIds]);
  const filteredEntries = useMemo(() => ledgerEntries.filter((entry) => (
    (!memberFilter || entry.memberId === memberFilter)
    && (!dateFrom || entry.date >= dateFrom)
    && (!dateTo || entry.date <= dateTo)
    && (!typeFilter || entry.type === typeFilter)
    && (!statusFilter || entry.status === statusFilter)
  )), [ledgerEntries, memberFilter, dateFrom, dateTo, typeFilter, statusFilter]);
  const selectedMember = invoicedMembers.find((member) => String(member.id) === memberFilter);
  const totalCharges = filteredEntries.filter((entry) => ["Invoice", "Charge"].includes(entry.type)).reduce((sum, entry) => sum + entry.amount, 0);
  const totalPayments = filteredEntries.filter((entry) => entry.type === "Payment").reduce((sum, entry) => sum + entry.amount, 0);
  const totalDeposits = filteredEntries.filter((entry) => entry.type === "Deposit").reduce((sum, entry) => sum + entry.amount, 0);
  const outstanding = Math.max(0, totalCharges - totalPayments);
  const hasActiveFilters = Boolean(memberFilter || dateFrom || dateTo || typeFilter || statusFilter);
  const resetFilters = () => { setMemberFilter(""); setDateFrom(""); setDateTo(""); setTypeFilter(""); setStatusFilter(""); showToast({ variant: "success", title: "Filters cleared", message: "Showing all member ledger entries." }); };
  const exportLedger = () => {
    if (!filteredEntries.length) {
      showToast({ variant: "error", title: "Nothing to export", message: "No ledger entries match the current filters." });
      return;
    }
    const csv = `\uFEFF${ledgerCsv(filteredEntries)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `member-ledger${selectedMember ? `-${selectedMember.member.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast({ variant: "success", title: "Ledger exported", message: `${filteredEntries.length} ledger ${filteredEntries.length === 1 ? "entry" : "entries"} downloaded as CSV.` });
  };

  if (!canView) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><div className="module-header"><div><h1>Member ledgers</h1><p className="muted-copy">Ledger records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Invoices — View access.</div></motion.div>;
  if (ledgerQuery.isLoading) return <div className="module-content"><div className="module-header"><div><h1>Member ledgers</h1><p className="muted-copy">Loading secured ledger records…</p></div></div><div className="table-empty-state">Loading members, invoices and ledger activity.</div></div>;
  if (ledgerQuery.isError) return <div className="module-content"><div className="module-header"><div><h1>Member ledgers</h1><p className="muted-copy">The ledger could not be loaded.</p></div></div><div className="table-empty-state"><strong>Ledger unavailable</strong><span>{ledgerQuery.error instanceof Error ? ledgerQuery.error.message : "Please try again."}</span><Button variant="ghost" onClick={() => void ledgerQuery.refetch()}>Try again</Button></div></div>;

  return <motion.div className="module-content member-ledger-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
    <div className="module-header"><div><h1>Member ledgers</h1><p className="muted-copy">One secure view of member charges, payments, deposits and outstanding balances.</p></div><Button onClick={exportLedger} disabled={!filteredEntries.length}><Download size={16} /> Export ledger</Button></div>
    <section className="stat-grid finance-stat-grid module-stats"><KpiCard icon={<Receipt size={18} />} label="Charges" value={money(totalCharges)} detail={`${filteredEntries.filter((entry) => ["Invoice", "Charge"].includes(entry.type)).length} charge entries`} /><KpiCard icon={<WalletCards size={18} />} label="Payments received" value={money(totalPayments)} detail="Recorded payments" /><KpiCard icon={<ShieldCheck size={18} />} label="Security deposits" value={money(totalDeposits)} detail="Held for members" /><KpiCard icon={<CreditCard size={18} />} label="Outstanding" value={money(outstanding)} detail="Charges less payments" /></section>
    <div className="invoice-status-filter-row member-ledger-filters"><div className="invoice-date-filters"><SelectField label="Member" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} searchable searchPlaceholder="Search invoiced members..."><option value="">All invoiced members</option>{invoicedMembers.map((member) => <option key={member.id} value={member.id}>{member.member}</option>)}</SelectField><DatePickerField label="From" value={dateFrom} onChange={setDateFrom} /><DatePickerField label="To" value={dateTo} min={dateFrom} onChange={setDateTo} /></div><div className="invoice-status-switchers"><SelectField label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option><option value="Invoice">Invoice</option><option value="Payment">Payment</option><option value="Deposit">Deposit</option><option value="Charge">Charge</option></SelectField><SelectField label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{[...new Set(ledgerEntries.map((entry) => entry.status))].sort().map((status) => <option value={status} key={status}>{status}</option>)}</SelectField></div>{hasActiveFilters ? <Button variant="danger" size="sm" className="member-ledger-clear-filter" onClick={resetFilters} aria-label="Clear filters" title="Clear filters"><X size={16} /></Button> : null}</div>
    <DataTable title={selectedMember ? `${selectedMember.member}'s ledger` : "Member ledger register"} subtitle="Charges, recorded payments and security deposits are shown in one table." columns={createLedgerColumns(setSelectedEntry)} data={filteredEntries} onRowClick={setSelectedEntry} emptyMessage="No ledger entries match these filters." emptySubtitle="Clear a filter or record a member invoice/payment to see activity." />
    <Dialog open={Boolean(selectedEntry)} onClose={() => setSelectedEntry(null)} ariaLabel="Ledger entry details"><div className="dialog-content"><div className="card-heading"><div><h2>{selectedEntry?.description || "Entry details"}</h2><p className="muted-copy">{selectedEntry?.memberName}</p></div></div><div className="ledger-summary"><div><span>Date</span><strong>{selectedEntry ? dateLabel(selectedEntry.date) : "—"}</strong></div><div><span>Type</span><strong>{selectedEntry?.type || "—"}</strong></div><div><span>Amount</span><strong>{selectedEntry ? money(selectedEntry.amount) : "—"}</strong></div><div><span>Status</span><strong>{selectedEntry?.status || "—"}</strong></div><div><span>Reference</span><strong>{selectedEntry?.reference || "No reference"}</strong></div></div></div></Dialog>
  </motion.div>;
}
