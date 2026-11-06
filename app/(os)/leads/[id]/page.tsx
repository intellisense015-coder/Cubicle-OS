"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { motion } from "motion/react";

import { AppSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LeadFollowUpForm } from "@/components/os/lead-journey";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { normalizeLeadJourney } from "@/lib/lead-journey";
import { isTerminalLeadStage, normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { leadRows } from "@/lib/module-b-data";
import { useToast } from "@/components/ui/toast-provider";
import { DetailPageHeader } from "@/components/ui/detail-page-header";
import { queryKeys } from "@/lib/query-keys";
import { fetchLeadsSnapshot, type LeadsQuerySnapshot } from "@/lib/lead-query";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { updateSupabaseLead } from "@/lib/supabase/leads";
import { useHasPermission } from "@/lib/access-control";

function formatJourneyDate(date, time) {
  if (!date) return "—";
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date}${time ? ` · ${time}` : ""}`;
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function moodClass(mood) {
  return `journey-mood journey-mood-${(mood || "neutral").toLowerCase().replace(/\s+/g, "-")}`;
}

function journeyEntryType(entry) {
  if (entry.entryType === "visit") return "Visit";
  if (entry.entryType === "follow-up") return "Follow-up";
  if (entry.entryType === "quotation") return "Quotation";
  return "Interaction";
}

function journeyEntryChannel(entry) {
  return entry.entryType === "visit" ? "In-person" : entry.communicationChannel || entry.communicationMode || "—";
}

function journeyEntryValue(entry, value, fallback = "—") {
  return entry.entryType === "follow-up" ? "—" : value || fallback;
}

function JourneyEntryDetails({ entry, onClose }) {
  return <div className="inline-form-card journey-entry-details"><div className="card-heading"><div><h2>Interaction details</h2><p className="muted-copy">A read-only summary of this lead journey step.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close interaction details"><X size={17} /></button></div><div className="journey-entry-details-grid"><div><span>Type</span><strong>{journeyEntryType(entry)}</strong></div><div><span>Date and time</span><strong>{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</strong></div><div><span>Followed up by</span><strong>{entry.followedUpBy || "—"}</strong></div><div><span>Communication channel</span><strong>{journeyEntryChannel(entry)}</strong></div><div><span>Purpose</span><strong>{journeyEntryValue(entry, entry.purpose)}</strong></div><div><span>Companions</span><strong>{journeyEntryValue(entry, entry.companions)}</strong></div><div><span>Mood</span><strong>{journeyEntryValue(entry, entry.mood)}</strong></div><div><span>Objections / doubts</span><strong>{journeyEntryValue(entry, entry.objections)}</strong></div><div><span>Outcome</span><strong>{entry.outcome || "—"}</strong></div><div><span>Next follow-up</span><strong>{formatJourneyDate(entry.nextFollowUpDate, entry.nextFollowUpTime)}</strong></div><div><span>Conversion probability</span><strong>{journeyEntryValue(entry, entry.conversionProbability)}</strong></div><div className="journey-entry-detail-wide"><span>Conversation summary</span><strong>{entry.conversationSummary || entry.notes || entry.purpose || "—"}</strong></div></div><div className="inline-form-actions"><Button onClick={onClose}>Close</Button></div></div>;
}

export default function LeadJourneyPage({ params }) {
  const routeParams = use<any>(params);
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canViewLeads = useHasPermission("leads.read");
  const canViewJourney = useHasPermission("leads.journey.read");
  const canWriteJourney = useHasPermission("leads.journey.write");
  const leadsQuery = useQuery({
    queryKey: queryKeys.leads.all,
    queryFn: fetchLeadsSnapshot,
    enabled: canViewLeads && canViewJourney,
  });
  const [lead, setLead] = useState<any>(null);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);

  useEffect(() => {
    const rows = leadsQuery.data?.leads ?? [];
    const selectedIndex = rows.findIndex((item) => item.id === routeParams.id);
    if (selectedIndex < 0) return;
    const selected = rows[selectedIndex];
    setLead({ ...selected, stage: normalizeLeadStage(selected.stage, selected), journey: normalizeLeadJourney(selected, selectedIndex) });
  }, [leadsQuery.data, routeParams.id]);

  const saveFollowUp = async ({ entry, outcome, lostReason, lostMonthlyValue, nextFollowUpDate, nextFollowUpTime, nextFollowUp }) => {
    if (!lead || !canWriteJourney) {
      showToast({ variant: "error", title: "View-only access", message: "You can view this journey, but your account cannot edit it." });
      return;
    }
    const transitioned = transitionLead(lead, { type: "follow-up-logged", outcome, lostReason, nextFollowUpDate, nextFollowUpTime, nextFollowUp });
    const updated = {
      ...transitioned,
      lostReason: outcome === "Not interested" ? lostReason || "" : "",
      lostMonthlyValue: outcome === "Not interested" ? lostMonthlyValue : null,
      lostAt: outcome === "Not interested" ? new Date().toISOString() : "",
      journey: [entry, ...(Array.isArray(lead.journey) ? lead.journey : [])],
    };

    try {
      if (isSupabaseLeadsEnabled() && lead.backend === "supabase") {
        await updateSupabaseLead(updated.id, {
          workspace: updated.workspace,
          stage: updated.stage,
          lostReason: updated.lostReason,
          lostMonthlyValue: updated.lostMonthlyValue,
        }, "lead.journey.update");
      }
      const stored = getDemoValue("leads");
      const rows: any[] = Array.isArray(stored) ? stored : [];
      const nextLeads = rows.map((item) => item.id === updated.id ? updated : item);
      saveDemoValue("leads", nextLeads);
      queryClient.setQueryData<LeadsQuerySnapshot>(queryKeys.leads.all, (current) => current ? {
        ...current,
        leads: current.leads.map((item) => item.id === updated.id ? updated : item),
      } : current);
      setLead(updated);
      setShowFollowUp(false);
      showToast({ variant: "success", title: "Follow-up logged", message: `${updated.name}'s journey was updated successfully.` });
      if (outcome === "Schedule a visit") {
        saveDemoValue("pendingVisitLeadId", updated.id);
        router.push("/visits");
      }
    } catch (error) {
      showToast({ variant: "error", title: "Follow-up was not saved", message: error?.message || "The follow-up could not be saved." });
    }
  };

  if (!canViewLeads || !canViewJourney) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Lead journey</h1><p className="muted-copy">This area is restricted for your account.</p></div></div><div className="table-empty-state">You do not have permission to view lead journeys.</div></motion.div>;
  if (leadsQuery.isPending || !lead) return <AppSkeleton />;

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/leads" backLabel="Back to leads" title={`${lead.name} journey`} description={`${lead.stage} · ${lead.company || "No company linked"}`} actions={canWriteJourney && !isTerminalLeadStage(lead.stage) ? <Button onClick={() => setShowFollowUp(true)}>Log follow-up</Button> : null} /><section className="table-card lead-journey-table-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Type</th><th>Date and time</th><th>Followed by</th><th>Channel</th><th>Purpose</th><th>Companions</th><th>Mood</th><th>Objections / doubts</th><th>Outcome</th><th>Conversation</th><th>Probability</th><th>Next follow-up</th></tr></thead><tbody>{lead.journey.map((entry) => <tr key={entry.id} onClick={() => setSelectedEntry(entry)}><td>{journeyEntryType(entry)}</td><td>{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</td><td>{entry.followedUpBy || "—"}</td><td>{journeyEntryChannel(entry)}</td><td>{journeyEntryValue(entry, entry.purpose)}</td><td>{journeyEntryValue(entry, entry.companions)}</td><td>{entry.entryType === "follow-up" ? "—" : <span className={moodClass(entry.mood)}>{entry.mood || "—"}</span>}</td><td>{journeyEntryValue(entry, entry.objections)}</td><td>{entry.outcome || "—"}</td><td>{entry.conversationSummary || entry.notes || entry.purpose || "—"}</td><td>{entry.entryType === "follow-up" ? "—" : <span className={`journey-probability journey-probability-${(entry.conversionProbability || "medium").toLowerCase()}`}>{entry.conversionProbability || "—"}</span>}</td><td>{formatJourneyDate(entry.nextFollowUpDate, entry.nextFollowUpTime)}</td></tr>)}</tbody></table></div></section><Dialog open={Boolean(selectedEntry)} onClose={() => setSelectedEntry(null)} ariaLabel="Interaction details">{selectedEntry ? <JourneyEntryDetails entry={selectedEntry} onClose={() => setSelectedEntry(null)} /> : null}</Dialog><Dialog open={showFollowUp} onClose={() => setShowFollowUp(false)} ariaLabel="Log follow-up"><LeadFollowUpForm lead={lead} onCancel={() => setShowFollowUp(false)} onSave={saveFollowUp} /></Dialog></motion.div>;
}
