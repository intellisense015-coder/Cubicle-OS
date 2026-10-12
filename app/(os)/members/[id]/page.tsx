"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, FileCheck2, Receipt, WalletCards } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoValue } from "@/lib/demo-session";

const amountValue = (value) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const money = (value) => `PKR ${value.toLocaleString("en-PK")}`;

function createLedgerColumns() {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("date", { header: "Date" }),
    columnHelper.accessor("description", { header: "Description" }),
    columnHelper.accessor("type", { header: "Type" }),
    columnHelper.accessor("amount", { header: "Amount", cell: ({ getValue }) => <strong className="invoice-amount">{getValue()}</strong> }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Settled" ? "success" : getValue() === "Overdue" ? "danger" : "accent"}>{getValue()}</StatusBadge> }),
  ];
}

export default function MemberLedgerPage({ params }) {
  const routeParams = use<any>(params);
  const [member, setMember] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    const members = getDemoValue("members");
    const selected = Array.isArray(members) ? members.find((item) => item.id === routeParams.id) : null;
    if (selected) setMember(selected);
    const savedLedgers = getDemoValue("memberLedgers");
    if (selected && savedLedgers && typeof savedLedgers === "object") setLedger(Array.isArray(savedLedgers[selected.member]) ? savedLedgers[selected.member] : []);
    const savedInvoices = getDemoValue("invoices");
    if (Array.isArray(savedInvoices)) setInvoices(savedInvoices);
  }, [routeParams.id]);

  const matchingInvoices = useMemo(() => member ? invoices.filter((invoice) => invoice.account === member.member || invoice.account === member.company || invoice.account?.includes(member.member)) : [], [invoices, member]);
  const history = useMemo(() => [...ledger, ...matchingInvoices.filter((invoice) => invoice.paymentStatus === "Paid").map((invoice) => ({ id: `invoice-${invoice.invoice}`, date: invoice.issueDate, description: invoice.itemDescription || "Invoice payment", type: "Invoice", amount: invoice.amount, status: "Settled" }))].sort((a, b) => String(b.date).localeCompare(String(a.date))), [ledger, matchingInvoices]);
  const totalPaid = useMemo(() => history.filter((item) => item.status === "Settled" || item.type === "Payment").reduce((total, item) => total + amountValue(item.amount), 0), [history]);
  const dueInvoices = matchingInvoices.filter((invoice) => invoice.paymentStatus !== "Paid").length;
  const deposit = amountValue(member?.deposit);

  if (!member) return <PageShell><div className="module-content"><p className="muted-copy">Member not found.</p><Link href="/members" className="journey-back-button"><ArrowLeft size={14} /> Back to members</Link></div></PageShell>;

  return <PageShell><motion.div className="module-content member-ledger-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><Link href="/members" className="journey-back-button"><ArrowLeft size={14} /> Back to members</Link><h1>{member.member}</h1><p className="muted-copy">{member.company || "No company"} · {member.space || "Unassigned"}</p></div></div><section className="stat-grid finance-stat-grid module-stats"><KpiCard icon={<WalletCards size={18} />} label="Total amount paid" value={money(totalPaid)} detail="Recorded payment history" /><KpiCard icon={<FileCheck2 size={18} />} label="Due invoices" value={dueInvoices} detail={dueInvoices ? "Needs attention" : "No outstanding invoices"} /><KpiCard icon={<Receipt size={18} />} label="Security deposit" value={money(deposit)} detail="Held for this member" /><KpiCard icon={<CreditCard size={18} />} label="Member since" value={member.joined || "Not recorded"} detail="Joining date" /></section><div className="section-heading invoice-register-heading"><div><h2>Payment history</h2><p className="muted-copy">All recorded payments and settled invoices for this member.</p></div></div><DataTable columns={createLedgerColumns()} data={history} emptyMessage="No payment history yet." /></motion.div></PageShell>;
}
