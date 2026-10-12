"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { Check, CheckCircle2, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/table";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";

function createApprovalColumns(onAction) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("type", { header: "Request", cell: ({ row }) => <div className="table-primary"><strong>{row.original.title}</strong><span>{row.original.type} · {row.original.risk}</span></div> }),
    columnHelper.accessor("requestedBy", { header: "Requested by" }),
    columnHelper.accessor("createdAt", { header: "Date" }),
    columnHelper.accessor("status", { header: "Status", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Pending" ? "accent" : getValue() === "Approved" ? "success" : "danger"}>{getValue()}</StatusBadge> }),
    columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => row.original.status === "Pending" ? <div className="approval-actions"><button className="approve-button" type="button" onClick={() => onAction(row.original, "Approved")}><Check size={14} /> Approve</button><button className="reject-button" type="button" onClick={() => onAction(row.original, "Rejected")}><X size={14} /> Reject</button></div> : <span className="muted-copy">Completed</span> }),
  ];
}

export default function ApprovalsPage() {
  const { showToast } = useToast();
  const [approvals, setApprovals] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    const savedApprovals = getDemoValue("approvals");
    if (Array.isArray(savedApprovals)) setApprovals(savedApprovals);
  }, []);

  const updateApproval = (id, status) => {
    const next = approvals.map((approval) => approval.id === id ? { ...approval, status } : approval);
    setApprovals(next);
    saveDemoValue("approvals", next);
    showToast({ variant: status === "Approved" ? "success" : "info", title: `Request ${status.toLowerCase()}`, message: "The approval status was saved successfully." });
  };

  const pending = useMemo(() => approvals.filter((approval) => approval.status === "Pending").length, [approvals]);
  const approved = useMemo(() => approvals.filter((approval) => approval.status === "Approved").length, [approvals]);
  const rejected = useMemo(() => approvals.filter((approval) => approval.status === "Rejected").length, [approvals]);
  const confirmAction = () => {
    if (!pendingAction) return;
    updateApproval(pendingAction.id, pendingAction.status);
    setPendingAction(null);
  };

  return <PageShell>
    <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="module-header"><div><h1>Approval Requests</h1><p className="muted-copy">Review sensitive changes and keep the operating team on track.</p></div></div>
      <section className="stat-grid module-stats approval-kpi-grid">
        <KpiCard icon={<ListChecks size={18} />} label="Pending approvals" value={pending} detail="Owner action required" />
        <KpiCard icon={<CheckCircle2 size={18} />} label="Approved" value={approved} detail="Completed requests" />
        <KpiCard icon={<X size={18} />} label="Rejected" value={rejected} detail="Declined requests" />
      </section>
      <div className="section-heading"><div><h2>Approval queue</h2><p className="muted-copy">Review and action requests from the team.</p></div></div>
      <DataTable columns={createApprovalColumns((approval, status) => setPendingAction({ id: approval.id, status, label: status === "Approved" ? "approve" : "reject" }))} data={approvals} emptyMessage="No approval requests yet." />
      <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} ariaLabel="Confirm approval action">
        {pendingAction ? <div className="dialog-content"><span className="setup-check-icon"><ListChecks size={17} /></span><h2>{pendingAction.label === "approve" ? "Approve this request?" : "Reject this request?"}</h2><p className="muted-copy">This demo will update the approval status and save it in the current session.</p><div className="dialog-actions"><Button variant="ghost" onClick={() => setPendingAction(null)}>Cancel</Button><Button onClick={confirmAction}>{pendingAction.label === "approve" ? "Approve request" : "Reject request"}</Button></div></div> : null}
      </Dialog>
    </motion.div>
  </PageShell>;
}
