"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageShell } from "@/components/ui/page-shell";
import { TimePicker } from "@/components/ui/time-picker";
import { LeadJourneyForm } from "@/components/os/lead-journey";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { visitRows } from "@/lib/module-e-data";
import { employeeRows } from "@/lib/module-d-data";
import { formatRelativeTime } from "@/lib/relative-time";
import { useToast } from "@/components/ui/toast-provider";
import { normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
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

function EmployeeSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>Assign to</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{options.map((option) => <button type="button" key={option} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div></div>;
}

function LeadSelect({ leads, value, onChange, locked = false }) {
  const [open, setOpen] = useState(false);
  const selected = leads.find((lead) => lead.id === value);
  return <div className="settings-label lead-source-field"><span>Visitor</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => !locked && setOpen((current) => !current)} aria-expanded={locked ? undefined : open} disabled={locked}>{selected ? `${selected.name} - ${selected.company || "No company"}` : "Select a lead"}{!locked ? <ChevronDown size={14} /> : null}</button>{!locked && open && <div className="lead-source-menu">{leads.length ? leads.map((lead) => <button type="button" key={lead.id} className={value === lead.id ? "is-selected" : ""} onClick={() => { onChange(lead); setOpen(false); }}>{lead.name} - {lead.company || "No company"}</button>) : <span className="dropdown-empty">No leads added yet</span>}</div>}</div></div>;
}

// TITLE: VISIT FORM
function VisitForm({ employees, leads, initialLeadId = "", onCancel, onSave }) {
  const assignOptions = [...new Set(["Only me", ...employees, ...leads.map((lead) => lead.assignedTo).filter(Boolean)])];
  const initialDateTime = getLocalDateTimeDefaults();
  const today = getLocalDateTimeDefaults().date;
  const currentTime = getLocalDateTimeDefaults().time;
  const initialLead = leads.find((lead) => lead.id === initialLeadId);
  const formApi = useForm({ resolver: zodResolver(visitSchema), defaultValues: { leadId: initialLead?.id || "", visitor: initialLead ? `${initialLead.name} - ${initialLead.company || "No company"}` : "", company: initialLead?.company || "", date: initialDateTime.date, time: initialDateTime.time, host: initialLead?.assignedTo || employees[0] || "Only me", purpose: "Workspace tour" }, mode: "onBlur" });
  const { handleSubmit, setError, setValue, watch, formState } = formApi;
  const selectLead = (lead) => { setValue("leadId", lead.id, { shouldDirty: true }); setValue("visitor", `${lead.name} - ${lead.company || "No company"}`, { shouldDirty: true }); setValue("company", lead.company || "", { shouldDirty: true }); setValue("host", lead.assignedTo || "Only me", { shouldDirty: true }); };
  const handleDateChange = (event) => { const date = event.target.value; const time = watch("time"); setValue("date", date, { shouldDirty: true }); if (date === today && time < currentTime) setValue("time", currentTime, { shouldDirty: true }); };
  const handleTimeChange = (event) => setValue("time", event.target.value, { shouldDirty: true });
  const handleSave = (form) => { const visit = { ...form, id: `visit-${Date.now()}`, status: "Scheduled" }; const saveError = onSave(visit); if (saveError) setError("time", { message: saveError }); };
  const error = formState.errors.leadId?.message || formState.errors.date?.message || formState.errors.time?.message || formState.errors.host?.message || formState.errors.purpose?.message;
  return <motion.form className="inline-form-card visit-create-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(handleSave)}><div className="card-heading"><div><h2>Schedule a visit</h2><p className="muted-copy">Create a visit and assign the person who will host it.</p></div></div><div className="inline-form-grid"><LeadSelect leads={leads} value={watch("leadId")} onChange={selectLead} locked={Boolean(initialLeadId)} /><label className="settings-label">Date<Input type="date" min={today} value={watch("date")} onChange={handleDateChange} /></label><label className="settings-label">Time<TimePicker value={watch("time")} min={watch("date") === today ? currentTime : undefined} onChange={handleTimeChange} /></label><EmployeeSelect value={watch("host")} options={assignOptions} onChange={(value) => setValue("host", value, { shouldDirty: true })} /></div>{error && <span className="lead-form-error visit-form-error">{error}</span>}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><CalendarDays size={15} /> {formState.isSubmitting ? "Scheduling..." : "Schedule visit"}</Button></div></motion.form>;
}

// TITLE: VISIT STATUS ACTIONS
function VisitActions({ visit, onStatusChange, onClose }) {
  if (visit.status !== "Scheduled") return null;
  return <div className="dialog-actions"><Button onClick={() => onStatusChange("Completed")}><CheckCircle2 size={15} /> Complete</Button><Button variant="ghost" onClick={() => onStatusChange("No-show")}>No-show</Button><Button variant="ghost" onClick={() => onStatusChange("Cancelled")}>Cancel visit</Button></div>;
}

// TITLE: VISITS PAGE
export default function VisitsPage() {
  const { showToast } = useToast();
  const [visits, setVisits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [journeyLead, setJourneyLead] = useState(null);
  const [journeyVisit, setJourneyVisit] = useState(null);
  const [pendingVisitLeadId, setPendingVisitLeadId] = useState("");
  const employees = useMemo(() => {
    const saved = getDemoValue("employees");
    return Array.isArray(saved) ? saved.filter((employee) => employee.status !== "Disabled").map((employee) => employee.name) : [];
  }, []);

  useEffect(() => {
    const saved = getDemoValue("visits");
    if (Array.isArray(saved)) setVisits(saved);
    const savedLeads = getDemoValue("leads");
    if (Array.isArray(savedLeads)) {
      const normalizedLeads = savedLeads.map((lead) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead) }));
      setLeads(normalizedLeads);
      const pendingLeadId = getDemoValue("pendingVisitLeadId");
      if (typeof pendingLeadId === "string" && normalizedLeads.some((lead) => lead.id === pendingLeadId)) {
        setPendingVisitLeadId(pendingLeadId);
        setShowForm(true);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // TITLE: SAVE VISITS
  const persist = (nextVisits) => { setVisits(nextVisits); saveDemoValue("visits", nextVisits); };
  const closeVisitForm = () => { setShowForm(false); setPendingVisitLeadId(""); saveDemoValue("pendingVisitLeadId", null); };
  const scheduleVisit = (visit) => {
    const selectedLead = leads.find((lead) => lead.id === visit.leadId);
    if (selectedLead && normalizeLeadStage(selectedLead.stage, selectedLead) === "Follow-up due" && !(selectedLead.pendingVisit && selectedLead.id === pendingVisitLeadId)) { const message = "Log the existing follow-up before scheduling another visit."; showToast({ variant: "error", title: "Visit was not scheduled", message }); return message; }
    if (isPastVisitTime(visit)) { const message = "Choose a current or future time."; showToast({ variant: "error", title: "Visit was not scheduled", message }); return message; }
    if (visits.some((existingVisit) => isSameScheduledSlot(existingVisit, visit))) { const message = `${visit.host} is already booked at that time.`; showToast({ variant: "error", title: "Time is not available", message }); return message; }
    persist([visit, ...visits]);
    if (visit.leadId) {
      const stored = getDemoValue("leads");
      const rows = Array.isArray(stored) ? stored : leads;
      const nextLeads = rows.map((lead) => lead.id === visit.leadId ? transitionLead(lead, { type: "visit-scheduled", nextFollowUp: `${visit.date} · ${visit.time}` }) : { ...lead, stage: normalizeLeadStage(lead.stage, lead) });
      saveDemoValue("leads", nextLeads);
      setLeads(nextLeads);
    }
    closeVisitForm();
    showToast({ variant: "success", title: "Visit scheduled", message: `${visit.visitor} was added to the visit schedule.` });
  };
  const updateStatus = (id, status) => { const next = visits.map((visit) => visit.id === id ? { ...visit, status } : visit); const changedVisit = visits.find((visit) => visit.id === id); persist(next); if (changedVisit && ["Cancelled", "No-show"].includes(status)) { const lead = findVisitLead(changedVisit); if (lead) { const stored = getDemoValue("leads"); const rows = Array.isArray(stored) ? stored : leads; const nextLeads = rows.map((row) => row.id === lead.id ? transitionLead(row, { type: "visit-cancelled" }) : row); saveDemoValue("leads", nextLeads); setLeads(nextLeads); } } setSelected((current) => current ? { ...current, status } : null); showToast({ variant: status === "Completed" ? "success" : status === "Cancelled" ? "info" : "success", title: status === "Completed" ? "Visit completed" : status === "Cancelled" ? "Visit cancelled" : "Visit updated", message: changedVisit ? `${changedVisit.visitor} was updated successfully.` : "The visit was updated successfully." }); };
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
  const saveVisitJourney = (entry) => {
    if (!journeyLead || !journeyVisit) return;
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
    const stored = getDemoValue("leads");
    const rows = Array.isArray(stored) ? stored : leads;
    const nextLeads = rows.map((lead) => lead.id === updated.id ? updated : lead);
    saveDemoValue("leads", nextLeads);
    setLeads(nextLeads);
    persist(visits.map((visit) => visit.id === journeyVisit.id ? { ...visit, status: "Completed" } : visit));
    setJourneyLead(null);
    setJourneyVisit(null);
    showToast({ variant: "success", title: "Visit completed", message: `${updated.name}'s visit was completed and added to the lead journey.` });
  };
  const scheduled = useMemo(() => visits.filter((visit) => visit.status === "Scheduled").length, [visits]);
  const completed = useMemo(() => visits.filter((visit) => visit.status === "Completed").length, [visits]);
  const nextVisit = useMemo(() => [...visits].filter((visit) => visit.status === "Scheduled").sort((a, b) => getVisitSortValue(a) - getVisitSortValue(b))[0] || null, [visits]);
  const sortedVisits = useMemo(() => [...visits].sort((a, b) => {
    const urgencyDifference = ["overdue", "urgent", "soon", "later", "inactive"].indexOf(getVisitUrgency(a, currentTime)) - ["overdue", "urgent", "soon", "later", "inactive"].indexOf(getVisitUrgency(b, currentTime));
    if (urgencyDifference) return urgencyDifference;
    const aTime = getVisitSortValue(a);
    const bTime = getVisitSortValue(b);
    return getVisitUrgency(a, currentTime) === "inactive" ? bTime - aTime : aTime - bTime;
  }), [visits, currentTime]);
  const availableLeads = useMemo(() => {
    const regularLeads = leads.filter((lead) => !["Follow-up due", "Converted", "Not interested"].includes(normalizeLeadStage(lead.stage, lead)) && !isLeadAlreadyScheduled(lead, visits));
    const pendingLead = leads.find((lead) => lead.id === pendingVisitLeadId && lead.pendingVisit && normalizeLeadStage(lead.stage, lead) === "Follow-up due" && !isLeadAlreadyScheduled(lead, visits));
    return pendingLead ? [pendingLead, ...regularLeads.filter((lead) => lead.id !== pendingLead.id)] : regularLeads;
  }, [leads, visits, pendingVisitLeadId]);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Visits</h1><p className="muted-copy">Schedule tours, assign a host and capture what happened next.</p></div><Button onClick={() => setShowForm(true)}><Plus size={16} /> Add visit</Button></div><section className="stat-grid module-stats"><KpiCard icon={<CalendarDays size={18} />} label="Scheduled visits" value={scheduled} detail="Upcoming in this demo" /><KpiCard icon={<CheckCircle2 size={18} />} label="Completed visits" value={completed} detail="Ready for conversion" /><KpiCard icon={<Clock3 size={18} />} label="Next visit" value={nextVisit ? formatVisitTime(nextVisit.time) : "—"} detail={nextVisit ? `${formatVisitDate(nextVisit.date)} · ${nextVisit.visitor}` : "No visits scheduled"} /></section><div className="section-heading"><div><h2>Visit schedule</h2><p className="muted-copy">Select a visit to open its details.</p></div></div><div className="visit-list">{sortedVisits.map((visit) => { const urgencyClass = getVisitUrgencyClass(visit, currentTime); return <motion.article key={visit.id} className={`visit-card visit-card-clickable ${urgencyClass}`} layout role="button" tabIndex={0} onClick={() => setSelected(visit)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(visit); }}><div className="visit-grid"><strong className="visit-grid-date">{formatVisitDateTime(visit)}</strong><h3>{visit.visitor}</h3><span className="visit-grid-host">Assigned to: {visit.host}</span><div className="visit-actions">{visit.status === "Scheduled" ? <><button type="button" className="table-action visit-cancel-action" onClick={(event) => { event.stopPropagation(); updateStatus(visit.id, "Cancelled"); }}>Cancel</button><Button size="sm" onClick={(event) => { event.stopPropagation(); completeVisit(visit); }}><CheckCircle2 size={15} /> Complete</Button></> : visit.status === "Completed" ? <span className="visit-grid-status visit-grid-status-completed">Visit Completed</span> : visit.status === "Cancelled" ? <span className="visit-grid-status visit-grid-status-cancelled">Cancelled</span> : null}</div></div></motion.article>; })}</div><Dialog open={showForm} onClose={closeVisitForm} ariaLabel="Add visit"><VisitForm employees={employees} leads={availableLeads} initialLeadId={pendingVisitLeadId} onCancel={closeVisitForm} onSave={scheduleVisit} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Visit details">{selected ? <div className="inline-form-card visit-details-modal"><div className="card-heading"><div><h2>Visit details</h2><p className="muted-copy">Review the visit details and assigned employee.</p></div></div><div className="ledger-summary"><div><span>Date</span><strong>{formatVisitDate(selected.date)}</strong></div><div><span>Time</span><strong>{formatVisitTime(selected.time)}</strong></div><div><span>Assigned to</span><strong>{selected.host}</strong></div></div><VisitActions visit={selected} onStatusChange={(status) => status === "Completed" ? completeVisit(selected) : updateStatus(selected.id, status)} onClose={() => setSelected(null)} /></div> : null}</Dialog><Dialog open={Boolean(journeyLead)} onClose={() => { setJourneyLead(null); setJourneyVisit(null); }} ariaLabel="Record visit in lead journey">{journeyLead ? <LeadJourneyForm lead={journeyLead} initialValues={{ occurredDate: journeyVisit?.date, occurredTime: journeyVisit?.time, purpose: journeyVisit?.purpose || "Workspace tour", communicationMode: "In-person", notes: journeyVisit?.host ? `Hosted by ${journeyVisit.host}` : "" }} onCancel={() => { setJourneyLead(null); setJourneyVisit(null); }} onSave={saveVisitJourney} /> : null}</Dialog></motion.div></PageShell>;
}
