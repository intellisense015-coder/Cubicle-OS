"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { History, UsersRound } from "lucide-react";
import { motion } from "motion/react";

import { KpiCard } from "@/components/ui/kpi-card";
import { TablePagination } from "@/components/ui/table";
import { AppSkeleton } from "@/components/ui/skeleton";
import { normalizeLeadStage } from "@/lib/lead-stages";
import { queryKeys } from "@/lib/query-keys";
import { fetchLeadsSnapshot } from "@/lib/lead-query";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";

function formatLeadDate(value: string | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
}

export default function LeadJourneyIndexPage() {
  const { showToast } = useToast();
  const errorShown = useRef(false);
  const canViewLeads = useHasPermission("leads.read");
  const canViewJourney = useHasPermission("leads.journey.read");
  const leadsQuery = useQuery({
    queryKey: queryKeys.leads.all,
    queryFn: fetchLeadsSnapshot,
    enabled: canViewLeads && canViewJourney,
  });
  const leads = leadsQuery.data?.leads ?? [];
  const loading = leadsQuery.isPending;
  const loadError = leadsQuery.data?.errorMessage ?? "";

  useEffect(() => {
    if (!loadError) {
      errorShown.current = false;
      return;
    }
    if (errorShown.current) return;
    errorShown.current = true;
    showToast({ variant: "error", title: "Leads could not be loaded", message: "Showing your saved leads while we reconnect." });
  }, [loadError, showToast]);

  const sortedLeads = useMemo(() => [...leads].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))), [leads]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 20;
  const pagedLeads = useMemo(() => sortedLeads.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), [pageIndex, sortedLeads]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, Math.ceil(sortedLeads.length / pageSize) - 1)));
  }, [sortedLeads.length]);

  if (!canViewLeads || !canViewJourney) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Lead journey</h1><p className="muted-copy">This area is restricted for your account.</p></div></div><div className="table-empty-state">You do not have permission to view lead journeys.</div></motion.div>;

  if (loading) return <AppSkeleton />;

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
    <div className="module-header">
      <div>
        <h1>Lead journey</h1>
        <p className="muted-copy">Choose a lead to review its complete journey and follow-up history.</p>
        {loadError ? <p className="lead-form-error">{loadError}</p> : null}
      </div>
    </div>
    <section className="stat-grid module-stats leads-kpi-grid">
      <KpiCard icon={<UsersRound size={18} />} label="Total leads" value={leads.length} detail="Select a lead below" />
    </section>
    {sortedLeads.length ? <section className="table-card app-table-card lead-journey-index-table"><div className="card-heading app-table-card-heading"><div><h2>Choose a lead</h2><p className="muted-copy">Open a lead to see visits, follow-ups, quotations, proposals and outcomes.</p></div></div><div className="table-scroll app-table-scroll"><table className="data-table app-table"><thead><tr><th>Lead</th><th>Company</th><th>Lead stage</th><th>Created</th><th>Action</th></tr></thead><tbody>{pagedLeads.map((lead) => <tr key={lead.id}><td className="table-primary"><strong>{lead.name || "Unnamed lead"}</strong><span>{lead.email || "—"}</span></td><td>{lead.company || "—"}</td><td>{normalizeLeadStage(lead.stage, lead)}</td><td>{formatLeadDate(lead.createdAt)}</td><td><Link className="action-icon-btn" href={`/leads/${lead.id}`} aria-label={`Open ${lead.name || "lead"} journey`} title="Open journey"><History size={16} /></Link></td></tr>)}</tbody></table></div><TablePagination pageIndex={pageIndex} pageSize={pageSize} total={sortedLeads.length} onPageChange={setPageIndex} /></section> : <div className="empty-state"><strong>No leads yet.</strong><span>Leads will appear here when they are added.</span></div>}
  </motion.div>;
}
