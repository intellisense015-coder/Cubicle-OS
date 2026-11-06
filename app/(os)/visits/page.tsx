"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, Clock3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { KpiCard } from "@/components/ui/kpi-card";
import { DatePickerField, SelectField, TimePickerField } from "@/components/ui/primitives";
import { LeadJourneyForm } from "@/components/os/lead-journey";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { employeeRows } from "@/lib/module-d-data";
import { formatRelativeTime } from "@/lib/relative-time";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { mapSupabaseLeadToOsLead, updateSupabaseLead } from "@/lib/supabase/leads";
import { createSupabaseVisit, mapSupabaseVisitToOsVisit, updateSupabaseVisitStatus } from "@/lib/supabase/visits";
import { useHasPermission } from "@/lib/access-control";
import { queryKeys } from "@/lib/query-keys";
import { fetchLeadsSnapshot, type LeadsQuerySnapshot } from "@/lib/lead-query";
import { fetchVisitsSnapshot, type VisitsQuerySnapshot } from "@/lib/visit-query";
import { z } from "zod";

function getVisitTimeMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "am" && hours === 12) hours = 0;
  if (meridiem === "pm" && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function formatVisitTime(value) {
  const totalMinutes = getVisitTimeMinutes(value);
  if (totalMinutes === Number.MAX_SAFE_INTEGER) return value || "Time not set";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}

function formatVisitDate(value) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value || "Date not set";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getVisitSortValue(visit) {
  const dateValue = new Date(`${visit.date}T00:00:00`).getTime();
  return (Number.isNaN(dateValue) ? Number.MAX_SAFE_INTEGER : dateValue) + getVisitTimeMinutes(visit.time) * 60 * 1000;
}

function getLocalDateTimeDefaults() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

function formatVisitRelativeTime(visit) {
  return formatRelativeTime(getVisitSortValue(visit));
}

function formatVisitDateTime(visit) {
  const relative = visit.status === "Scheduled" ? formatVisitRelativeTime(visit) : "";
  return `${formatVisitDate(visit.date)} · ${formatVisitTime(visit.time)}${relative ? ` · ${relative}` : ""}`;
}

function isLeadAlreadyScheduled(lead, visits) {
  return visits.some((visit) => visit.status === "Scheduled" && (visit.leadId === lead.id || visit.visitor?.startsWith(`${lead.name} -`)));
}

function normalizeVisitLookup(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isSameScheduledSlot(first, second) {
  return first.status === "Scheduled" && second.status === "Scheduled" && first.date === second.date && first.host === second.host && getVisitTimeMinutes(first.time) === getVisitTimeMinutes(second.time);
}

function isPastVisitTime(visit) {
  const now = new Date();
  now.setSeconds(0, 0);
  return getVisitSortValue(visit) < now.getTime();
}

const visitSchema = z.object({
  leadId: z.string().min(1, "Select a lead."),
  visitor: z.string().trim().min(1, "Select a lead."),
  company: z.string().optional(),
  date: z.string().min(1, "Choose a visit date."),
  time: z.string().min(1, "Choose a visit time."),
  host: z.string().min(1, "Choose who will host the visit."),
  purpose: z.string().trim().min(1, "Enter the visit purpose.")
});

function getVisitUrgency(visit, now = Date.now()) {
  if (visit.status !== "Scheduled") return "inactive";
  const difference = getVisitSortValue(visit) - now;
  if (difference < 0) return "overdue";
  if (difference <= 15 * 60 * 1000) return "urgent";
  if (difference <= 60 * 60 * 1000) return "soon";
  return "later";
}

function getVisitUrgencyClass(visit, now) {
  const urgency = getVisitUrgency(visit, now);
  if (urgency === "overdue") return "visit-card-overdue";
  if (urgency === "urgent") return "visit-card-urgent";
  if (urgency === "soon") return "visit-card-soon";
  if (visit.status === "Completed") return "visit-card-completed";
  if (visit.status === "Cancelled") return "visit-card-cancelled";
  if (visit.status === "No-show") return "visit-card-no-show";
  return "";
}

// TITLE: VISIT FORM
function VisitForm({ employees, leads, initialLeadId = "", onCancel, onSave }) {
  const assignOptions = [...new Set(["Only me", ...employees])];
  const initialDateTime = getLocalDateTimeDefaults();
  const today = getLocalDateTimeDefaults().date;
  const currentTime = getLocalDateTimeDefaults().time;
  const initialLead = leads.find((lead) => lead.id === initialLeadId);
  const formApi = useForm({ resolver: zodResolver(visitSchema), defaultValues: { leadId: initialLead?.id || "", visitor: initialLead ? `${initialLead.name} - ${initialLead.company || "No company"}` : "", company: initialLead?.company || "", date: initialDateTime.date, time: initialDateTime.time, host: initialLead?.assignedTo || employees[0] || "Only me", purpose: "Workspace tour" }, mode: "onBlur" });
  const { handleSubmit, setError, setValue, watch, formState } = formApi;
  const selectLead = (lead) => { setValue("leadId", lead.id, { shouldDirty: true }); setValue("visitor", `${lead.name} - ${lead.company || "No company"}`, { shouldDirty: true }); setValue("company", lead.company || "", { shouldDirty: true }); setValue("host", lead.assignedTo || "Only me", { shouldDirty: true }); };
  const handleDateChange = (date) => { const time = watch("time"); setValue("date", date, { shouldDirty: true, shouldValidate: true }); if (date === today && time < currentTime) setValue("time", currentTime, { shouldDirty: true, shouldValidate: true }); };
  const handleTimeChange = (time) => setValue("time", time, { shouldDirty: true, shouldValidate: true });
  const handleSave = async (form) => { const visit = { ...form, id: `visit-${Date.now()}`, status: "Scheduled" }; const saveError = await onSave(visit); if (saveError) setError("time", { message: saveError }); };
  const error = formState.errors.leadId?.message || formState.errors.date?.message || formState.errors.time?.message || formState.errors.host?.message || formState.errors.purpose?.message;
  return <motion.form className="inline-form-card visit-create-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(handleSave)}><div className="card-heading"><div><h2>Schedule a visit</h2><p className="muted-copy">Create a visit and assign the person who will host it.</p></div></div><div className="inline-form-grid"><SelectField label="Visitor" value={watch("leadId")} hint={formState.errors.leadId?.message} disabled={Boolean(initialLeadId) || !leads.length} onChange={(event) => { const lead = leads.find((candidate) => candidate.id === event.target.value); if (lead) selectLead(lead); }}>{<option value="">{leads.length ? "Select a lead" : "No leads added yet"}</option>}{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name} - {lead.company || "No company"}</option>)}</SelectField><DatePickerField label="Date" value={watch("date")} min={today} hint={formState.errors.date?.message} onChange={handleDateChange} /><TimePickerField label="Time" value={watch("time")} min={watch("date") === today ? currentTime : undefined} hint={formState.errors.time?.message} onChange={handleTimeChange} /><SelectField label="Assign to" value={watch("host")} hint={formState.errors.host?.message} onChange={(event) => setValue("host", event.target.value, { shouldDirty: true, shouldValidate: true })}>{assignOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField></div>{error && <span className="lead-form-error visit-form-error">{error}</span>}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting} aria-busy={formState.isSubmitting}><CalendarDays size={15} /> {formState.isSubmitting ? "Scheduling..." : "Schedule visit"}</Button></div></motion.form>;
}

// TITLE: VISIT STATUS ACTIONS
function VisitActions({ visit, onStatusChange, onClose, canEdit = true }) {
  const permissionCanEdit = useHasPermission("visits.write");
  const effectiveCanEdit = canEdit && permissionCanEdit;
  if (visit.status !== "Scheduled") return null;
  if (!effectiveCanEdit) return <div className="dialog-actions"><span className="read-only-label">View only</span></div>;
  return <div className="dialog-actions"><Button onClick={() => onStatusChange("Completed")}><CheckCircle2 size={15} /> Complete</Button><Button variant="ghost" onClick={() => onStatusChange("No-show")}>No-show</Button><Button variant="ghost" onClick={() => onStatusChange("Cancelled")}>Cancel visit</Button></div>;
}

// TITLE: VISITS PAGE
export default function VisitsPage({ view = "all" }: { view?: "all" | "upcoming" | "history" } = {}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = useHasPermission("visits.write");
  const canWriteLeads = useHasPermission("leads.write");
  const visitsQuery = useQuery({
    queryKey: queryKeys.visits.all,
    queryFn: fetchVisitsSnapshot,
  });
  const leadsQuery = useQuery({
    queryKey: queryKeys.leads.all,
    queryFn: fetchLeadsSnapshot,
  });
  const visits = visitsQuery.data?.visits ?? [];
  const leads = leadsQuery.data?.leads ?? [];
  const visitErrorShown = useRef(false);
  const leadErrorShown = useRef(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [journeyLead, setJourneyLead] = useState(null);
  const [journeyVisit, setJourneyVisit] = useState(null);
  const [pendingVisitLeadId, setPendingVisitLeadId] = useState("");
  const employees = useMemo(() => {
    const saved = getDemoValue("employees");
    const ownerEmail = String(getDemoSession().email || "").trim().toLowerCase();
    const ownerName = normalizeVisitLookup(getDemoValue("profileName"));
    return Array.isArray(saved)
      ? saved
        .filter((employee) => employee.status !== "Disabled")
        .filter((employee) => String(employee.email || "").trim().toLowerCase() !== ownerEmail && normalizeVisitLookup(employee.name) !== ownerName)
        .map((employee) => employee.name)
        .filter(Boolean)
      : [];
  }, []);

  useEffect(() => {
    const pendingLeadId = getDemoValue("pendingVisitLeadId");
    if (typeof pendingLeadId === "string" && leads.some((lead) => lead.id === pendingLeadId)) {
      setPendingVisitLeadId(pendingLeadId);
      setShowForm(true);
    }
  }, [leads]);

  useEffect(() => {
    const errorMessage = visitsQuery.data?.errorMessage || "";
    if (!errorMessage) {
      visitErrorShown.current = false;
      return;
    }
    if (visitErrorShown.current) return;
    visitErrorShown.current = true;
<<<<<<< HEAD
    showToast({ variant: "error", title: "Visits could not be loaded", message: "Showing the most recently saved visits." });
=======
    showToast({ variant: "error", title: "Visits could not be loaded", message: "Showing your saved visits while we reconnect." });
>>>>>>> 65c4630 (Half Bugs fixed)
  }, [showToast, visitsQuery.data?.errorMessage]);

  useEffect(() => {
    const errorMessage = leadsQuery.data?.errorMessage || "";
    if (!errorMessage) {
      leadErrorShown.current = false;
      return;
    }
    if (leadErrorShown.current) return;
    leadErrorShown.current = true;
<<<<<<< HEAD
    showToast({ variant: "error", title: "Leads could not be loaded", message: "Showing the most recently saved leads." });
=======
    showToast({ variant: "error", title: "Leads could not be loaded", message: "Showing your saved leads while we reconnect." });
>>>>>>> 65c4630 (Half Bugs fixed)
  }, [showToast, leadsQuery.data?.errorMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // TITLE: SAVE VISITS
  const persist = (nextVisits) => {
    saveDemoValue("visits", nextVisits);
    queryClient.setQueryData<VisitsQuerySnapshot>(queryKeys.visits.all, (current) => current ? {
      ...current,
      visits: nextVisits,
      errorMessage: "",
    } : {
      visits: nextVisits,
      dataSource: isSupabaseLeadsEnabled() ? "supabase" : "demo",
      errorMessage: "",
    });
  };
  const persistLeads = (nextLeads) => {
    saveDemoValue("leads", nextLeads);
    queryClient.setQueryData<LeadsQuerySnapshot>(queryKeys.leads.all, (current) => current ? {
      ...current,
      leads: nextLeads,
      errorMessage: "",
    } : {
      leads: nextLeads,
      dataSource: isSupabaseLeadsEnabled() ? "supabase" : "demo",
      errorMessage: "",
    });
  };
  const closeVisitForm = () => { setShowForm(false); setPendingVisitLeadId(""); saveDemoValue("pendingVisitLeadId", null); };
  const scheduleVisit = async (visit) => {
    if (!canWrite) { const message = "Your account can view visits but cannot schedule them."; showToast({ variant: "error", title: "View-only access", message }); return message; }
    const selectedLead = leads.find((lead) => lead.id === visit.leadId);
    if (selectedLead && normalizeLeadStage(selectedLead.stage, selectedLead) === "Follow-up due" && !(selectedLead.pendingVisit && selectedLead.id === pendingVisitLeadId)) { const message = "Log the existing follow-up before scheduling another visit."; showToast({ variant: "error", title: "Visit was not scheduled", message }); return message; }
    if (isPastVisitTime(visit)) { const message = "Choose a current or future time."; showToast({ variant: "error", title: "Visit was not scheduled", message }); return message; }
    if (visits.some((existingVisit) => isSameScheduledSlot(existingVisit, visit))) { const message = `${visit.host} is already booked at that time.`; showToast({ variant: "error", title: "Time is not available", message }); return message; }
    let savedVisit = visit;
    try {
      if (isSupabaseLeadsEnabled()) {
        if (!selectedLead || !isUuid(visit.leadId)) {
<<<<<<< HEAD
          const message = "Select a lead before scheduling a visit.";
=======
          const message = "Select a saved lead before scheduling a visit.";
>>>>>>> 65c4630 (Half Bugs fixed)
          showToast({ variant: "error", title: "Visit was not scheduled", message });
          return message;
        }
        const row = await createSupabaseVisit(visit);
        savedVisit = mapSupabaseVisitToOsVisit(row);
      }
    } catch (error) {
<<<<<<< HEAD
      const message = error?.code === "23505" ? `${visit.host} is already booked at that time.` : error?.message || "The visit could not be saved.";
=======
      const message = error?.code === "23505" ? `${visit.host} is already booked at that time.` : "We couldn’t save this visit. Please try again.";
>>>>>>> 65c4630 (Half Bugs fixed)
      showToast({ variant: "error", title: "Visit was not scheduled", message });
      return message;
    }

    persist([savedVisit, ...visits]);
    if (visit.leadId) {
      const stored = getDemoValue("leads");
      const rows = Array.isArray(stored) ? stored : leads;
      const nextLeads = rows.map((lead) => lead.id === visit.leadId ? transitionLead(lead, { type: "visit-scheduled", nextFollowUp: `${visit.date} · ${visit.time}` }) : { ...lead, stage: normalizeLeadStage(lead.stage, lead) });
      if (isSupabaseLeadsEnabled() && isUuid(visit.leadId) && canWriteLeads) {
        try {
          const updatedRow = await updateSupabaseLead(visit.leadId, { visitDate: visit.date, visitTime: visit.time, stage: "Visit scheduled" });
          const updatedLead = { ...mapSupabaseLeadToOsLead(updatedRow), ...nextLeads.find((lead) => lead.id === visit.leadId), id: updatedRow.id, backend: "supabase", stage: "Visit scheduled", visitDate: visit.date, visitTime: visit.time };
          const persistedLeads = nextLeads.map((lead) => lead.id === visit.leadId ? updatedLead : lead);
          persistLeads(persistedLeads);
        } catch (error) {
          persistLeads(nextLeads);
          showToast({ variant: "error", title: "Visit scheduled with a lead warning", message: error?.message || "The visit was saved, but the lead visit date could not be updated." });
        }
      } else {
        persistLeads(nextLeads);
      }
    }
    closeVisitForm();
    showToast({ variant: "success", title: "Visit scheduled", message: `${visit.visitor} was added to the visit schedule.` });
  };
  const updateStatus = async (id, status) => {
    if (!canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot change visit status." }); return; }
    const changedVisit = visits.find((visit) => visit.id === id);
    if (!changedVisit) return;
    try {
      if (isSupabaseLeadsEnabled() && isUuid(id)) await updateSupabaseVisitStatus(id, status);
    } catch (error) {
<<<<<<< HEAD
      showToast({ variant: "error", title: "Visit was not updated", message: error?.message || "The visit could not be updated." });
=======
      showToast({ variant: "error", title: "Visit was not updated", message: "We couldn’t update this visit. Please try again." });
>>>>>>> 65c4630 (Half Bugs fixed)
      return;
    }
    const next = visits.map((visit) => visit.id === id ? { ...visit, status } : visit);
    persist(next);
    if (["Cancelled", "No-show"].includes(status)) {
      const lead = findVisitLead(changedVisit);
      if (lead) {
        const stored = getDemoValue("leads");
        const rows = Array.isArray(stored) ? stored : leads;
        const nextLeads = rows.map((row) => row.id === lead.id ? transitionLead(row, { type: "visit-cancelled" }) : row);
        if (isSupabaseLeadsEnabled() && isUuid(lead.id) && canWriteLeads) {
          try {
            const nextLead = nextLeads.find((row) => row.id === lead.id);
            const updatedRow = await updateSupabaseLead(lead.id, { visitDate: null, visitTime: null, stage: nextLead?.stage });
            const persistedLeads = nextLeads.map((row) => row.id === lead.id ? { ...mapSupabaseLeadToOsLead(updatedRow), ...row, id: updatedRow.id, backend: "supabase", visitDate: "", visitTime: "", nextFollowUp: "Not scheduled" } : row);
            persistLeads(persistedLeads);
          } catch (error) {
            persistLeads(nextLeads);
            showToast({ variant: "error", title: "Visit updated with a lead warning", message: error?.message || "The visit changed, but the lead could not be updated." });
          }
        } else {
          persistLeads(nextLeads);
        }
      }
    }
    setSelected((current) => current ? { ...current, status } : null);
    showToast({ variant: status === "Completed" ? "success" : status === "Cancelled" ? "info" : "success", title: status === "Completed" ? "Visit completed" : status === "Cancelled" ? "Visit cancelled" : "Visit updated", message: `${changedVisit.visitor} was updated successfully.` });
  };
  const findVisitLead = (visit) => {
    const stored = getDemoValue("leads");
    const rows = Array.isArray(stored) ? [...leads, ...stored] : leads;
    const uniqueRows = rows.filter((lead, index, all) => lead?.id && all.findIndex((item) => item?.id === lead.id) === index);
    const visitId = String(visit.leadId || "");
    const visitor = normalizeVisitLookup(visit.visitor);
    return uniqueRows.find((lead) => visitId && String(lead.id) === visitId)
      || uniqueRows.find((lead) => visitor === normalizeVisitLookup(`${lead.name} - ${lead.company || "No company"}`))
      || uniqueRows.find((lead) => visitor === normalizeVisitLookup(lead.name) || visitor.startsWith(`${normalizeVisitLookup(lead.name)} -`) || visitor.startsWith(`${normalizeVisitLookup(lead.name)} `));
  };
  const completeVisit = (visit) => { const lead = findVisitLead(visit); if (!lead) { showToast({ variant: "error", title: "Visit was not completed", message: "This visit is missing its lead details." }); return; } setSelected(null); setJourneyVisit(visit); setJourneyLead(lead); };
  const saveVisitJourney = async (entry) => {
    if (!journeyLead || !journeyVisit || !canWrite) return;
    const visitEntry = {
      ...entry,
      entryType: "visit",
      followedUpBy: journeyVisit?.host || journeyLead.assignedTo || "Only me",
      communicationMode: "In-person",
      communicationChannel: "In-person",
      conversationSummary: entry.purpose,
      outcome: entry.nextFollowUpDate ? "Follow-up scheduled" : "Visit completed"
    };
    const updated = {
      ...transitionLead(journeyLead, { type: "visit-completed", nextFollowUpDate: entry.nextFollowUpDate, nextFollowUpTime: entry.nextFollowUpTime }),
      source: entry.source,
      journey: [visitEntry, ...(Array.isArray(journeyLead.journey) ? journeyLead.journey : [])],
      nextFollowUp: entry.nextFollowUpDate ? `${entry.nextFollowUpDate}${entry.nextFollowUpTime ? ` · ${entry.nextFollowUpTime}` : ""}` : "Not scheduled"
    };
    try {
      if (isSupabaseLeadsEnabled()) {
        if (isUuid(journeyVisit.id)) await updateSupabaseVisitStatus(journeyVisit.id, "Completed");
        if (canWriteLeads && isUuid(journeyLead.id)) await updateSupabaseLead(journeyLead.id, { visited: true, stage: updated.stage });
      }
    } catch (error) {
<<<<<<< HEAD
      showToast({ variant: "error", title: "Visit was not completed", message: error?.message || "The visit could not be completed." });
=======
      showToast({ variant: "error", title: "Visit was not completed", message: "We couldn’t complete this visit. Please try again." });
>>>>>>> 65c4630 (Half Bugs fixed)
      return;
    }
    const stored = getDemoValue("leads");
    const rows = Array.isArray(stored) ? stored : leads;
    const nextLeads = rows.map((lead) => lead.id === updated.id ? updated : lead);
    persistLeads(nextLeads);
    persist(visits.map((visit) => visit.id === journeyVisit.id ? { ...visit, status: "Completed" } : visit));
    setJourneyLead(null);
    setJourneyVisit(null);
    showToast({ variant: "success", title: "Visit completed", message: `${updated.name}'s visit was completed and added to the lead journey.` });
  };
  const isUpcomingView = view === "upcoming";
  const isHistoryView = view === "history";
  const pageTitle = isUpcomingView ? "Upcoming visits" : isHistoryView ? "Visit history" : "Visits";
  const pageDescription = isUpcomingView
    ? "See scheduled visits and what needs attention next."
    : isHistoryView
      ? "Review completed, cancelled and missed visits."
      : "Schedule tours, assign a host and capture what happened next.";
  const visibleVisits = useMemo(() => {
    if (isUpcomingView) return visits.filter((visit) => visit.status === "Scheduled");
    if (isHistoryView) return visits.filter((visit) => visit.status !== "Scheduled");
    return visits;
  }, [isHistoryView, isUpcomingView, visits]);
  const scheduled = useMemo(() => visibleVisits.filter((visit) => visit.status === "Scheduled").length, [visibleVisits]);
  const completed = useMemo(() => visibleVisits.filter((visit) => visit.status === "Completed").length, [visibleVisits]);
  const nextVisit = useMemo(() => [...visibleVisits].filter((visit) => visit.status === "Scheduled").sort((a, b) => getVisitSortValue(a) - getVisitSortValue(b))[0] || null, [visibleVisits]);
  const sortedVisits = useMemo(() => [...visibleVisits].sort((a, b) => {
    const urgencyDifference = ["overdue", "urgent", "soon", "later", "inactive"].indexOf(getVisitUrgency(a, currentTime)) - ["overdue", "urgent", "soon", "later", "inactive"].indexOf(getVisitUrgency(b, currentTime));
    if (urgencyDifference) return urgencyDifference;
    const aTime = getVisitSortValue(a);
    const bTime = getVisitSortValue(b);
    return getVisitUrgency(a, currentTime) === "inactive" ? bTime - aTime : aTime - bTime;
  }), [currentTime, visibleVisits]);
  const availableLeads = useMemo(() => {
    const regularLeads = leads.filter((lead) => !["Follow-up due", "Converted", "Not interested"].includes(normalizeLeadStage(lead.stage, lead)) && !isLeadAlreadyScheduled(lead, visits));
    const pendingLead = leads.find((lead) => lead.id === pendingVisitLeadId && lead.pendingVisit && normalizeLeadStage(lead.stage, lead) === "Follow-up due" && !isLeadAlreadyScheduled(lead, visits));
    return pendingLead ? [pendingLead, ...regularLeads.filter((lead) => lead.id !== pendingLead.id)] : regularLeads;
  }, [leads, visits, pendingVisitLeadId]);

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>{pageTitle}</h1><p className="muted-copy">{pageDescription}</p></div><Button onClick={() => setShowForm(true)}><Plus size={16} /> Add visit</Button></div><section className="stat-grid module-stats"><KpiCard icon={<CalendarDays size={18} />} label="Scheduled visits" value={scheduled} detail={isHistoryView ? "Not in the active schedule" : "Upcoming in this demo"} /><KpiCard icon={<CheckCircle2 size={18} />} label="Completed visits" value={completed} detail="Ready for conversion" /><KpiCard icon={<Clock3 size={18} />} label="Next visit" value={nextVisit ? formatVisitTime(nextVisit.time) : "—"} detail={nextVisit ? `${formatVisitDate(nextVisit.date)} · ${nextVisit.visitor}` : "No visits scheduled"} /></section><div className="section-heading"><div><h2>{isUpcomingView ? "Upcoming schedule" : isHistoryView ? "Visit history" : "Visit schedule"}</h2><p className="muted-copy">Select a visit to open its details.</p></div></div><div className="visit-list">{sortedVisits.map((visit) => { const urgencyClass = getVisitUrgencyClass(visit, currentTime); return <motion.article key={visit.id} className={`visit-card visit-card-clickable ${urgencyClass}`} layout role="button" tabIndex={0} onClick={() => setSelected(visit)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(visit); }}><div className="visit-grid"><strong className="visit-grid-date">{formatVisitDateTime(visit)}</strong><h3>{visit.visitor}</h3><span className="visit-grid-host">Assigned to: {visit.host}</span><div className="visit-actions">{visit.status === "Scheduled" ? <><button type="button" className="action-icon-btn visit-cancel-action" onClick={(event) => { event.stopPropagation(); updateStatus(visit.id, "Cancelled"); }} aria-label={`Cancel visit for ${visit.visitor}`} title="Cancel visit"><X size={16} /></button><Button size="sm" onClick={(event) => { event.stopPropagation(); completeVisit(visit); }}><CheckCircle2 size={15} /> Complete</Button></> : visit.status === "Completed" ? <span className="visit-grid-status visit-grid-status-completed">Visit Completed</span> : visit.status === "Cancelled" ? <span className="visit-grid-status visit-grid-status-cancelled">Cancelled</span> : null}</div></div></motion.article>; })}</div><Dialog open={showForm} onClose={closeVisitForm} ariaLabel="Add visit"><VisitForm employees={employees} leads={availableLeads} initialLeadId={pendingVisitLeadId} onCancel={closeVisitForm} onSave={scheduleVisit} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Visit details">{selected ? <div className="inline-form-card visit-details-modal"><div className="card-heading"><div><h2>Visit details</h2><p className="muted-copy">Review the visit details and assigned employee.</p></div></div><div className="ledger-summary"><div><span>Date</span><strong>{formatVisitDate(selected.date)}</strong></div><div><span>Time</span><strong>{formatVisitTime(selected.time)}</strong></div><div><span>Assigned to</span><strong>{selected.host}</strong></div></div><VisitActions visit={selected} onStatusChange={(status) => status === "Completed" ? completeVisit(selected) : updateStatus(selected.id, status)} onClose={() => setSelected(null)} /></div> : null}</Dialog><Dialog open={Boolean(journeyLead)} onClose={() => { setJourneyLead(null); setJourneyVisit(null); }} ariaLabel="Record visit in lead journey">{journeyLead ? <LeadJourneyForm lead={journeyLead} initialValues={{ occurredDate: journeyVisit?.date, occurredTime: journeyVisit?.time, purpose: journeyVisit?.purpose || "Workspace tour", communicationMode: "In-person", notes: journeyVisit?.host ? `Hosted by ${journeyVisit.host}` : "" }} onCancel={() => { setJourneyLead(null); setJourneyVisit(null); }} onSave={saveVisitJourney} /> : null}</Dialog></motion.div>;
}
