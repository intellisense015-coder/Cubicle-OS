"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { AppSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LeadFollowUpForm } from "@/components/os/lead-journey";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseLead, mapSupabaseLeadToOsLead } from "@/lib/supabase/leads";
import { normalizeLeadJourney } from "@/lib/lead-journey";
import { isTerminalLeadStage, normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { leadRows } from "@/lib/module-b-data";
import { useToast } from "@/components/ui/toast-provider";
import { DetailPageHeader } from "@/components/ui/detail-page-header";

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
  const [lead, setLead] = useState<any>(null);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadLead = async () => {
      const stored = getDemoValue("leads");
      const rows: any[] = Array.isArray(stored) ? stored : [];
      const selected = rows.find((item) => item.id === routeParams.id);
      if (selected) {
        setLead({ ...selected, stage: normalizeLeadStage(selected.stage, selected), journey: normalizeLeadJourney(selected, rows.indexOf(selected)) });
        return;
      }

      if (!isSupabaseLeadsEnabled()) return;
      try {
        const remote = await fetchSupabaseLead(routeParams.id);
        if (!remote || cancelled) return;
        const mapped = mapSupabaseLeadToOsLead(remote);
        saveDemoValue("leads", [mapped], { notify: false });
        setLead({ ...mapped, stage: normalizeLeadStage(mapped.stage, mapped), journey: [] });
      } catch {
        // The page keeps its existing skeleton for a missing or inaccessible lead.
      }
    };
    loadLead();
    return () => { cancelled = true; };
  }, [routeParams.id]);

  const saveFollowUp = ({ entry, outcome, lostReason, nextFollowUpDate, nextFollowUpTime, nextFollowUp }) => {
    if (!lead) return;
    const updated = transitionLead(lead, { type: "follow-up-logged", outcome, lostReason, nextFollowUpDate, nextFollowUpTime, nextFollowUp });
    updated.journey = [entry, ...(Array.isArray(lead.journey) ? lead.journey : [])];
    const stored = getDemoValue("leads");
    const rows: any[] = Array.isArray(stored) ? stored : [];
    saveDemoValue("leads", rows.map((item) => item.id === updated.id ? updated : item));
    setLead(updated);
    setShowFollowUp(false);
    showToast({ variant: "success", title: "Follow-up logged", message: `${updated.name}'s journey was updated successfully.` });
    if (outcome === "Schedule a visit") {
      saveDemoValue("pendingVisitLeadId", updated.id);
      router.push("/visits");
    }
  };

  if (!lead) return <PageShell><AppSkeleton /></PageShell>;

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/leads" backLabel="Back to leads" title={`${lead.name} journey`} description={`${lead.stage} · ${lead.company || "No company linked"}`} actions={!isTerminalLeadStage(lead.stage) ? <Button onClick={() => setShowFollowUp(true)}>Log follow-up</Button> : null} /><section className="table-card lead-journey-table-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Type</th><th>Date and time</th><th>Followed by</th><th>Channel</th><th>Purpose</th><th>Companions</th><th>Mood</th><th>Objections / doubts</th><th>Outcome</th><th>Conversation</th><th>Probability</th><th>Next follow-up</th></tr></thead><tbody>{lead.journey.map((entry) => <tr key={entry.id} onClick={() => setSelectedEntry(entry)}><td>{journeyEntryType(entry)}</td><td>{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</td><td>{entry.followedUpBy || "—"}</td><td>{journeyEntryChannel(entry)}</td><td>{journeyEntryValue(entry, entry.purpose)}</td><td>{journeyEntryValue(entry, entry.companions)}</td><td>{entry.entryType === "follow-up" ? "—" : <span className={moodClass(entry.mood)}>{entry.mood || "—"}</span>}</td><td>{journeyEntryValue(entry, entry.objections)}</td><td>{entry.outcome || "—"}</td><td>{entry.conversationSummary || entry.notes || entry.purpose || "—"}</td><td>{entry.entryType === "follow-up" ? "—" : <span className={`journey-probability journey-probability-${(entry.conversionProbability || "medium").toLowerCase()}`}>{entry.conversionProbability || "—"}</span>}</td><td>{formatJourneyDate(entry.nextFollowUpDate, entry.nextFollowUpTime)}</td></tr>)}</tbody></table></div></section><Dialog open={Boolean(selectedEntry)} onClose={() => setSelectedEntry(null)} ariaLabel="Interaction details">{selectedEntry ? <JourneyEntryDetails entry={selectedEntry} onClose={() => setSelectedEntry(null)} /> : null}</Dialog><Dialog open={showFollowUp} onClose={() => setShowFollowUp(false)} ariaLabel="Log follow-up"><LeadFollowUpForm lead={lead} onCancel={() => setShowFollowUp(false)} onSave={saveFollowUp} /></Dialog></motion.div></PageShell>;
}
