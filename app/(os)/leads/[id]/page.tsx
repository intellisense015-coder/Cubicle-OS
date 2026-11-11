"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { motion } from "motion/react";

import { AppSkeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { LeadFollowUpForm } from "@/components/os/lead-journey";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { mergeLeadJourneyEntries, normalizeLeadJourney } from "@/lib/lead-journey";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { leadRows } from "@/lib/module-b-data";
import { useToast } from "@/components/ui/toast-provider";
import { DetailPageHeader } from "@/components/ui/detail-page-header";
import { queryKeys } from "@/lib/query-keys";
import { fetchLeadsSnapshot, type LeadsQuerySnapshot } from "@/lib/lead-query";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { updateSupabaseLead } from "@/lib/supabase/leads";
import { useHasPermission } from "@/lib/access-control";
import { scheduleLeadVisit } from "@/lib/visit-scheduling";

function formatJourneyDate(date, time) {
  if (!date) return "—";
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date}${time ? ` · ${time}` : ""}`;
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function journeyEntryChannel(entry) {
  return entry.entryType === "visit" ? "In-person" : entry.communicationChannel || entry.communicationMode || "—";
}

function journeyEntryValue(entry, value, fallback = "—") {
  return entry.entryType === "follow-up" ? "—" : value || fallback;
}

function journeyStage(entry) {
  if (entry.entryType === "lead-added") return "Lead Added";
  if (entry.entryType === "stage-change") return entry.stage || entry.outcome || "Stage Updated";
  const outcome = String(entry.outcome || "").toLowerCase();
  const purpose = String(entry.purpose || "").toLowerCase();
  if (entry.entryType === "visit" && (outcome.includes("cancel") || purpose.includes("cancel"))) return "Visit Cancelled";
  if (entry.entryType === "visit" && outcome.includes("complete")) return "Visit Completed";
  if (entry.entryType === "visit") return "Visit Scheduled";
  if (entry.entryType === "follow-up" && outcome.includes("schedule a visit")) return "Visit Scheduled";
  if (entry.entryType === "follow-up") return "Followed Up";
  if (entry.entryType === "quotation") return "Quotation Sent";
  return "Interaction Logged";
}

function journeyTimestamp(entry) {
  const date = String(entry.occurredDate || "");
  const time = String(entry.occurredTime || "00:00");
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function leadCreatedParts(value) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return { occurredDate: "", occurredTime: "" };
  const pad = (part) => String(part).padStart(2, "0");
  return {
    occurredDate: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    occurredTime: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  };
}

function getJourneySteps(lead) {
  const leadCreated = leadCreatedParts(lead.createdAt);
  const hasLeadAdded = lead.journey.some((entry) => entry.entryType === "lead-added");
  const entries = hasLeadAdded ? [...lead.journey] : [{
    id: `lead-added-${lead.id}`,
    entryType: "lead-added",
    visitorIdentity: lead.name,
    occurredDate: leadCreated.occurredDate,
    occurredTime: leadCreated.occurredTime,
    source: lead.source || "—",
    company: lead.company || "—",
    email: lead.email || "—",
    assignedTo: lead.assignedTo || "—"
  }, ...lead.journey];
  return entries
    .map((entry, index) => ({ ...entry, journeyStage: journeyStage(entry), journeyOrder: index }))
    .sort((left, right) => journeyTimestamp(left) - journeyTimestamp(right) || left.journeyOrder - right.journeyOrder);
}

function cancellationDetail(entry) {
  if (entry.cancellationDetails) return entry.cancellationDetails;
  return entry.conversationSummary || entry.notes || "—";
}

function cancellationReason(entry) {
  if (entry.cancellationReason) return entry.cancellationReason;
  const summary = String(entry.conversationSummary || entry.notes || "");
  return summary.replace(/^Visit cancelled:\s*/i, "").split(" — ")[0] || "—";
}

function JourneyEntryDetails({ entry, onClose }) {
  const stage = entry.journeyStage || journeyStage(entry);
  const isLeadAdded = entry.entryType === "lead-added";
  const isVisit = entry.entryType === "visit";
  const isCancelled = stage === "Visit Cancelled";
  return <div className="inline-form-card journey-entry-details"><div className="card-heading"><div><h2>{stage}</h2><p className="muted-copy">{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close journey step details"><X size={17} /></button></div><div className="journey-entry-details-grid"><div><span>Stage</span><strong>{stage}</strong></div><div><span>Date and time</span><strong>{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</strong></div>{isLeadAdded ? <><div><span>Lead</span><strong>{entry.visitorIdentity || "—"}</strong></div><div><span>Email</span><strong>{entry.email || "—"}</strong></div><div><span>Company</span><strong>{entry.company || "—"}</strong></div><div><span>Source</span><strong>{entry.source || "—"}</strong></div><div><span>Assigned to</span><strong>{entry.assignedTo || "—"}</strong></div></> : <><div><span>{isVisit ? "Assigned to" : "Followed up by"}</span><strong>{entry.followedUpBy || entry.assignedTo || "—"}</strong></div><div><span>Communication channel</span><strong>{journeyEntryChannel(entry)}</strong></div>{isCancelled ? <><div><span>Cancellation reason</span><strong>{cancellationReason(entry)}</strong></div><div className="journey-entry-detail-wide"><span>Cancellation details</span><strong>{cancellationDetail(entry)}</strong></div></> : <><div><span>Purpose</span><strong>{journeyEntryValue(entry, entry.purpose)}</strong></div><div><span>Outcome</span><strong>{entry.outcome || "—"}</strong></div><div><span>Next follow-up</span><strong>{formatJourneyDate(entry.nextFollowUpDate, entry.nextFollowUpTime)}</strong></div><div><span>Conversation summary</span><strong>{entry.conversationSummary || entry.notes || entry.purpose || "—"}</strong></div><div><span>Companions</span><strong>{journeyEntryValue(entry, entry.companions)}</strong></div><div><span>Mood</span><strong>{journeyEntryValue(entry, entry.mood)}</strong></div></>}</>}</div></div>;
}

function journeyHoverSummary(entry) {
  if (entry.entryType === "lead-added") return `${entry.company || "No company"} · ${entry.source || "Source not recorded"}`;
  if (entry.journeyStage === "Visit Cancelled") return `${cancellationReason(entry)}${entry.cancellationDetails ? ` · ${entry.cancellationDetails}` : ""}`;
  return entry.conversationSummary || entry.notes || entry.purpose || entry.outcome || "Click to view details";
}

function LeadJourneyTimeline({ lead, onSelect }) {
  const steps = getJourneySteps(lead);
  const [hoveredEntryId, setHoveredEntryId] = useState("");
  return <div className="lead-journey-timeline" role="list" aria-label="Lead journey steps"><motion.span className="lead-journey-timeline-line" aria-hidden="true" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />{steps.map((entry, index) => { const entryId = entry.id || `${entry.journeyStage}-${index}`; const isHovered = hoveredEntryId === entryId; return <motion.article className={`lead-journey-step${isHovered ? " is-hovered" : ""}`} key={entryId} role="button" tabIndex={0} onMouseEnter={() => setHoveredEntryId(entryId)} onMouseLeave={() => setHoveredEntryId("")} onClick={() => onSelect(entry)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(entry); } }} initial={{ opacity: 0, x: -24, scaleX: 0.94 }} animate={{ opacity: 1, x: 0, scaleX: 1 }} transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}><span className="lead-journey-step-marker" aria-hidden="true">✓</span><motion.span className="lead-journey-step-copy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.08 + 0.12, ease: [0.16, 1, 0.3, 1] }}><strong>{entry.journeyStage}</strong><small>{formatJourneyDate(entry.occurredDate, entry.occurredTime)}</small></motion.span><span className="lead-journey-step-arrow" aria-hidden="true">›</span>{isHovered ? <motion.span className="lead-journey-step-preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><strong>{entry.journeyStage}</strong><span>{journeyHoverSummary(entry)}</span><small>Click to view full details</small></motion.span> : null}</motion.article>; })}</div>;
}

export default function LeadJourneyPage({ params }) {
  const routeParams = use<any>(params);
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

  useEffect(() => {
    const rows = leadsQuery.data?.leads ?? [];
    const cachedRows = getDemoValue("leads");
    const cachedLead = Array.isArray(cachedRows)
      ? cachedRows.find((item) => item.id === routeParams.id)
      : null;
    const selectedIndex = rows.findIndex((item) => item.id === routeParams.id);
    const selected = selectedIndex >= 0 ? rows[selectedIndex] : cachedLead;
    if (!selected) return;
    const cachedJourney = Array.isArray(cachedLead?.journey) ? cachedLead.journey : [];
    const remoteJourney = Array.isArray(selected.journey) ? selected.journey : [];
    const journey = selected.backend === "supabase" && selected.journeyLoaded
      ? mergeLeadJourneyEntries(remoteJourney, cachedJourney)
      : cachedJourney.length
        ? mergeLeadJourneyEntries(cachedJourney, remoteJourney)
        : normalizeLeadJourney(selected, selectedIndex >= 0 ? selectedIndex : 0);
    setLead({ ...selected, stage: normalizeLeadStage(selected.stage, selected), journey });
  }, [leadsQuery.data, routeParams.id]);

  const saveFollowUp = async ({ entry, outcome, lostReason, lostMonthlyValue, nextFollowUpDate, nextFollowUpTime, nextFollowUp, visitDate, visitTime, visitHost }) => {
    if (!lead || !canWriteJourney) {
      showToast({ variant: "error", title: "View-only access", message: "You can view this journey, but your account cannot edit it." });
      return;
    }
    const stored = getDemoValue("leads");
    const cachedRows = Array.isArray(stored) ? stored : [];
    const cachedLead = cachedRows.find((item) => item.id === lead.id);
    const currentSnapshot = queryClient.getQueryData<LeadsQuerySnapshot>(queryKeys.leads.all);
    const snapshotLead = currentSnapshot?.leads?.find((item) => item.id === lead.id);
    const existingJourney = mergeLeadJourneyEntries(
      lead.journey,
      snapshotLead?.journey,
      cachedLead?.journey,
    );
    const leadWithJourney = { ...lead, journey: existingJourney };
    const transitioned = transitionLead(leadWithJourney, { type: "follow-up-logged", outcome, lostReason, nextFollowUpDate, nextFollowUpTime, nextFollowUp });
    const updated = {
      ...transitioned,
      lostReason: outcome === "Not interested" ? lostReason || "" : "",
      lostMonthlyValue: outcome === "Not interested" ? lostMonthlyValue : null,
      lostAt: outcome === "Not interested" ? new Date().toISOString() : "",
      journey: [entry, ...existingJourney],
    };
    let scheduledVisit = null;
    let leadToPersist = updated;

    try {
      if (outcome === "Schedule a visit") {
        scheduledVisit = await scheduleLeadVisit({ lead: updated, date: visitDate, time: visitTime, host: visitHost });
        leadToPersist = transitionLead(updated, { type: "visit-scheduled", nextFollowUp: "Not scheduled" });
      }
      if (isSupabaseLeadsEnabled() && lead.backend === "supabase") {
        await updateSupabaseLead(leadToPersist.id, {
          workspace: leadToPersist.workspace,
          stage: leadToPersist.stage,
          lostReason: leadToPersist.lostReason,
          lostMonthlyValue: leadToPersist.lostMonthlyValue,
          journeyEntry: entry,
          ...(scheduledVisit ? { visitDate: scheduledVisit.date, visitTime: scheduledVisit.time } : {}),
        }, "lead.journey.update");
      }
      const rows: any[] = cachedRows.length
        ? cachedRows
        : currentSnapshot?.leads || [];
      const nextLeads = rows.map((item) => item.id === leadToPersist.id ? leadToPersist : item);
      if (!nextLeads.some((item) => item.id === leadToPersist.id)) nextLeads.push(leadToPersist);
      saveDemoValue("leads", nextLeads);
      queryClient.setQueryData<LeadsQuerySnapshot>(queryKeys.leads.all, (current) => current ? {
        ...current,
        leads: current.leads.map((item) => item.id === leadToPersist.id ? leadToPersist : item),
      } : current);
      setLead(leadToPersist);
      showToast({ variant: "success", title: scheduledVisit ? "Visit scheduled" : "Follow-up logged", message: scheduledVisit ? `${scheduledVisit.visitor} was added to the visit schedule.` : `${leadToPersist.name}'s journey was updated successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: scheduledVisit ? "Visit scheduled with a lead warning" : outcome === "Schedule a visit" ? "Visit was not scheduled" : "Follow-up was not saved", message: error?.message || (scheduledVisit ? "The visit was saved, but the lead could not be updated." : outcome === "Schedule a visit" ? "The visit could not be scheduled." : "The follow-up could not be saved.") });
    }
  };

  if (!canViewLeads || !canViewJourney) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Lead journey</h1><p className="muted-copy">This area is restricted for your account.</p></div></div><div className="table-empty-state">You do not have permission to view lead journeys.</div></motion.div>;
  if (leadsQuery.isPending || !lead) return <AppSkeleton />;

  return <motion.div className="module-content lead-journey-detail-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><DetailPageHeader backHref="/leads/journey" backLabel="Back to lead journey" iconOnlyBack title={`${lead.name} journey`} description={`${lead.stage} · ${lead.company || "No company linked"}`} /><LeadJourneyTimeline lead={lead} onSelect={setSelectedEntry} /><Dialog open={Boolean(selectedEntry)} onClose={() => setSelectedEntry(null)} ariaLabel="Journey step details">{selectedEntry ? <JourneyEntryDetails entry={selectedEntry} onClose={() => setSelectedEntry(null)} /> : null}</Dialog></motion.div>;
}
