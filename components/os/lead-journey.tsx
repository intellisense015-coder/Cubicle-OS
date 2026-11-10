"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { CalendarClock, CalendarDays, Clock3, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField, SelectField, TimePickerField } from "@/components/ui/primitives";
import { getDemoSession, getDemoValue } from "@/lib/demo-session";
import { LostReasonSelect } from "@/components/os/lost-reason-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { communicationModes, followUpOutcomes, moodOptions, probabilityOptions } from "@/lib/lead-journey";
import { getLocalDateInputValue, getLocalTimeInputValue, isDateBeforeToday, isTimeBeforeNow } from "@/lib/follow-up-time";
import { z } from "zod";

const journeySchema = z.object({
  visitorIdentity: z.string(),
  occurredDate: z.string().min(1, "Choose the interaction date."),
  occurredTime: z.string().min(1, "Choose the interaction time."),
  purpose: z.string().trim().min(1, "Add a purpose or interest before saving."),
  companions: z.string(),
  source: z.string(),
  mood: z.string(),
  certainty: z.string(),
  objections: z.string().optional(),
  nextFollowUpDate: z.string().optional(),
  nextFollowUpTime: z.string().optional(),
  communicationMode: z.string(),
  conversionProbability: z.string(),
  conversionReason: z.string().optional(),
  notes: z.string().optional()
}).superRefine((values, context) => {
  if (isDateBeforeToday(values.nextFollowUpDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpDate"], message: "Choose today or a future date." });
  } else if (isTimeBeforeNow(values.nextFollowUpTime, values.nextFollowUpDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpTime"], message: "Choose the current time or a future time." });
  }
});

const nextStepOutcomes = ["Schedule a visit", "Requested quotation", "Proposal Sent", "Proposal Approved", "Quotation Approved", "Agreement shared", "Not interested"];

const followUpSchema = z.object({
  followedUpBy: z.string().min(1, "Choose who followed up."),
  occurredDate: z.string().min(1, "Choose the follow-up date."),
  occurredTime: z.string().min(1, "Choose the follow-up time."),
  communicationMode: z.string().min(1, "Choose a communication channel."),
  conversationSummary: z.string().trim().min(1, "Add a short conversation summary."),
  outcome: z.string().min(1, "Choose an outcome."),
  nextFollowUpDate: z.string().optional(),
  nextFollowUpTime: z.string().optional(),
  currentStage: z.string().optional(),
  visitDate: z.string().optional(),
  visitTime: z.string().optional(),
  visitHost: z.string().optional(),
  lostReason: z.string().optional(),
  lostMonthlyValue: z.string().optional()
}).superRefine((values, context) => {
  if (values.outcome === "Schedule a visit") {
    if (!values.visitDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["visitDate"], message: "Choose a visit date." });
    } else if (isDateBeforeToday(values.visitDate)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["visitDate"], message: "Choose today or a future date." });
    }
    if (!values.visitTime) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["visitTime"], message: "Choose a visit time." });
    } else if (isTimeBeforeNow(values.visitTime, values.visitDate)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["visitTime"], message: "Choose the current time or a future time." });
    }
    if (!values.visitHost) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["visitHost"], message: "Choose who will host the visit." });
    }
  } else {
    if (isDateBeforeToday(values.nextFollowUpDate)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpDate"], message: "Choose today or a future date." });
    } else if (isTimeBeforeNow(values.nextFollowUpTime, values.nextFollowUpDate)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpTime"], message: "Choose the current time or a future time." });
    }
    if (values.nextFollowUpDate && nextStepOutcomes.includes(values.outcome)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpDate"], message: "Remove the date for this next step." });
    } else if (!values.nextFollowUpDate && !nextStepOutcomes.includes(values.outcome) && !["Visit scheduled", "Visit booked"].includes(values.currentStage || "")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextFollowUpDate"], message: "Choose a next follow-up date or a next step." });
    }
  }
  if (values.outcome === "Not interested" && !values.lostReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lostReason"], message: "Choose a lost reason." });
  }
  if (values.outcome === "Not interested") {
    const amount = Number(String(values.lostMonthlyValue || "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["lostMonthlyValue"], message: "Enter the estimated monthly loss." });
    }
  }
});

// TITLE: JOURNEY FORM DEFAULTS
function getJourneyFormDefaults(lead, initialValues = {}) {
  return { visitorIdentity: lead.name, occurredDate: "2026-10-02", occurredTime: "10:00", purpose: "", companions: "None", source: lead.source || "Website", mood: "Interested", certainty: "Unsure", objections: "", nextFollowUpDate: "", nextFollowUpTime: "", communicationMode: "WhatsApp", conversionProbability: "Medium", conversionReason: "", notes: "", ...initialValues };
}

// TITLE: LEAD JOURNEY FORM
export function LeadJourneyForm({ lead, onCancel, onSave, initialValues = {} }) {
  const formApi = useForm<z.input<typeof journeySchema>>({ resolver: zodResolver(journeySchema), defaultValues: getJourneyFormDefaults(lead, initialValues), mode: "onBlur" });
  const { register, handleSubmit, setValue, watch, formState } = formApi;
  const today = getLocalDateInputValue();
  const currentTime = getLocalTimeInputValue();
  const error = (field) => formState.errors[field]?.message;
  const saveInteraction = (values) => onSave({ ...values, id: `journey-${Date.now()}` });
  return <motion.form className="lead-journey-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(saveInteraction)}>
    <div className="card-heading"><div><h2>Log interaction</h2><p className="muted-copy">Record the visit and continue its follow-up journey.</p></div></div>

    <div className="journey-form-section-heading"><h3>Interaction</h3></div>
    <div className="inline-form-grid">
      <DatePickerField label="Interaction date" value={watch("occurredDate")} hint={error("occurredDate")} onChange={(value) => setValue("occurredDate", value, { shouldDirty: true, shouldValidate: true })} />
      <TimePickerField label="Interaction time" value={watch("occurredTime")} hint={error("occurredTime")} onChange={(value) => setValue("occurredTime", value, { shouldDirty: true, shouldValidate: true })} />
      <label className="settings-label journey-field-wide">Purpose / interest<Input className={error("purpose") ? "has-error" : ""} {...register("purpose")} placeholder="What did the lead want to explore?" />{error("purpose") && <span className="lead-form-error">{error("purpose")}</span>}</label>
      <SelectField label="Companions" value={watch("companions")} onChange={(event) => setValue("companions", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="None">None</option>{["Spouse", "Partner", "Family", "Colleague", "Other"].map((option) => <option value={option} key={option}>{option}</option>)}</SelectField>
      <SelectField label="Mood" value={watch("mood")} onChange={(event) => setValue("mood", event.target.value, { shouldDirty: true, shouldValidate: true })}>{moodOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField>
    </div>

    <div className="journey-form-section-heading"><h3>Follow-up</h3></div>
    <div className="inline-form-grid">
      <label className="settings-label journey-field-wide">Objections / doubts<Input {...register("objections")} placeholder="Questions, doubts or blockers" /></label>
      <DatePickerField label="Next follow-up date" value={watch("nextFollowUpDate")} min={today} hint={error("nextFollowUpDate")} onChange={(value) => setValue("nextFollowUpDate", value, { shouldDirty: true, shouldValidate: true })} />
      <TimePickerField label="Next follow-up time" value={watch("nextFollowUpTime")} min={watch("nextFollowUpDate") === today ? currentTime : undefined} hint={error("nextFollowUpTime")} onChange={(value) => setValue("nextFollowUpTime", value, { shouldDirty: true, shouldValidate: true })} />
      <SelectField label="Conversion probability" value={watch("conversionProbability")} onChange={(event) => setValue("conversionProbability", event.target.value, { shouldDirty: true, shouldValidate: true })}>{probabilityOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField>
    </div>

    <div className="journey-form-section-heading"><h3>Additional notes</h3></div>
    <div className="inline-form-grid">
      <label className="settings-label journey-field-wide"><span>Notes</span><Input {...register("notes")} placeholder="Personalized context or important details" /></label>
    </div>

    <div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}><Plus size={15} /> Save interaction</Button></div>
  </motion.form>;
}

function getLocalDateTimeDefaults() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

function leadStageTone(stage) {
  return stage === "Converted" || stage === "Quotation Approved" ? "success" : stage === "Follow-up due" || stage === "Quote Sent" ? "accent" : "neutral";
}

function isCurrentUserIdentity(value, ownerName, ownerEmail) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return Boolean(normalizedValue) && (normalizedValue === String(ownerName || "").trim().toLowerCase() || normalizedValue === String(ownerEmail || "").trim().toLowerCase());
}

// TITLE: FOLLOW-UP FORM
export function LeadFollowUpForm({ lead, onCancel, onSave, canScheduleVisit = true }) {
  const ownerName = String(getDemoValue("profileName") || "").trim();
  const ownerEmail = String(getDemoSession().email || "").trim();
  const assignedByOtherUser = lead.assignedTo && !isCurrentUserIdentity(lead.assignedTo, ownerName, ownerEmail) ? lead.assignedTo : "";
  const visitDefaults = getLocalDateTimeDefaults();
  const formApi = useForm({ resolver: zodResolver(followUpSchema), defaultValues: { followedUpBy: assignedByOtherUser || "Only me", occurredDate: "", occurredTime: "", communicationMode: "WhatsApp", conversationSummary: "", outcome: "Interested", nextFollowUpDate: "", nextFollowUpTime: "", currentStage: lead.stage || "", visitDate: visitDefaults.date, visitTime: visitDefaults.time, visitHost: assignedByOtherUser || "Only me", lostReason: lead.lostReason || "", lostMonthlyValue: lead.lostMonthlyValue ? String(lead.lostMonthlyValue) : "" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const [employeeOptions, setEmployeeOptions] = useState(["Only me"]);
  const today = getLocalDateInputValue();
  const currentTime = getLocalTimeInputValue();

  useEffect(() => {
    const defaults = getLocalDateTimeDefaults();
    const savedEmployees = getDemoValue("employees");
    const names = Array.isArray(savedEmployees) ? savedEmployees.filter((employee) => employee.status !== "Disabled" && employee.name && !isCurrentUserIdentity(employee.name, ownerName, ownerEmail) && !isCurrentUserIdentity(employee.email, ownerName, ownerEmail)).map((employee) => employee.name) : [];
    setEmployeeOptions([...new Set(["Only me", assignedByOtherUser, ...names].filter(Boolean))]);
    if (!watch("occurredDate")) setValue("occurredDate", defaults.date, { shouldValidate: true });
    if (!watch("occurredTime")) setValue("occurredTime", defaults.time, { shouldValidate: true });
  }, [lead.assignedTo]);

  const save = async (form) => {
    if (form.outcome === "Schedule a visit" && !canScheduleVisit) {
      setError("visitHost", { message: "Your account cannot schedule visits." });
      return;
    }
    const entry = {
      id: `journey-${Date.now()}`,
      entryType: "follow-up",
      visitorIdentity: lead.name,
      occurredDate: form.occurredDate,
      occurredTime: form.occurredTime,
      purpose: "",
      companions: "",
      source: lead.source || "Website",
      mood: "",
      certainty: "Sure",
      objections: "",
      nextFollowUpDate: form.nextFollowUpDate,
      nextFollowUpTime: form.nextFollowUpTime,
      communicationMode: form.communicationMode,
      communicationChannel: form.communicationMode,
      followedUpBy: form.followedUpBy,
      conversationSummary: form.conversationSummary.trim(),
      outcome: form.outcome,
      lostReason: form.lostReason || "",
      lostMonthlyValue: form.outcome === "Not interested" ? form.lostMonthlyValue : "",
      conversionProbability: "",
      conversionReason: "",
      notes: form.conversationSummary.trim()
    };
    await onSave({
      entry,
      outcome: form.outcome,
      nextFollowUpDate: form.nextFollowUpDate,
      nextFollowUpTime: form.nextFollowUpTime,
      nextFollowUp: form.nextFollowUpDate ? `${form.nextFollowUpDate}${form.nextFollowUpTime ? ` · ${form.nextFollowUpTime}` : ""}` : "Not scheduled",
      visitDate: form.outcome === "Schedule a visit" ? form.visitDate : "",
      visitTime: form.outcome === "Schedule a visit" ? form.visitTime : "",
      visitHost: form.outcome === "Schedule a visit" ? form.visitHost : "",
      lostReason: form.outcome === "Not interested" ? form.lostReason : "",
      lostMonthlyValue: form.outcome === "Not interested" ? form.lostMonthlyValue : null
    });
  };

  const error = (field) => formState.errors[field]?.message;
  const selectedOutcome = watch("outcome");
  const scheduleVisitNext = selectedOutcome === "Schedule a visit";
  const isNextStepOutcome = nextStepOutcomes.includes(selectedOutcome);
  const visitBookedStage = ["Visit scheduled", "Visit booked"].includes(String(lead.stage || ""));
  const showNextFollowUp = !scheduleVisitNext && !visitBookedStage && !isNextStepOutcome;
  return <motion.form className="inline-form-card lead-create-form lead-follow-up-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(save)}><div className="card-heading"><div><h2>Log follow-up</h2><p className="muted-copy">Record what happened and decide the lead’s next step.</p></div></div><div className="ledger-summary"><div><span>Lead</span><strong>{lead.name}</strong></div><div><span>Company</span><strong>{lead.company || "—"}</strong></div><div><span>Current stage</span><StatusBadge tone={leadStageTone(lead.stage)}>{lead.stage}</StatusBadge></div></div><div className="inline-form-grid"><input type="hidden" {...register("currentStage")} /><SelectField label="Followed up by" value={watch("followedUpBy")} hint={error("followedUpBy")} onChange={(event) => setValue("followedUpBy", event.target.value, { shouldDirty: true, shouldValidate: true })}>{employeeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField><DatePickerField label="Follow-up date" value={watch("occurredDate")} hint={error("occurredDate")} onChange={(value) => setValue("occurredDate", value, { shouldDirty: true, shouldValidate: true })} /><TimePickerField label="Follow-up time" value={watch("occurredTime")} hint={error("occurredTime")} onChange={(value) => setValue("occurredTime", value, { shouldDirty: true, shouldValidate: true })} /><SelectField label="Communication channel" value={watch("communicationMode")} hint={error("communicationMode")} onChange={(event) => setValue("communicationMode", event.target.value, { shouldDirty: true, shouldValidate: true })}>{communicationModes.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField><SelectField label="Outcome" value={selectedOutcome} hint={error("outcome")} onChange={(event) => { const outcome = event.target.value; setValue("outcome", outcome, { shouldDirty: true, shouldValidate: true }); if (nextStepOutcomes.includes(outcome)) { setValue("nextFollowUpDate", "", { shouldDirty: true, shouldValidate: true }); setValue("nextFollowUpTime", "", { shouldDirty: true, shouldValidate: true }); } }}>{followUpOutcomes.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField>{selectedOutcome === "Not interested" ? <><LostReasonSelect value={watch("lostReason")} hint={error("lostReason")} onChange={(value) => setValue("lostReason", value, { shouldDirty: true, shouldValidate: true })} /><label className="settings-label"><span>Estimated monthly loss</span><Input type="number" min="0.01" step="0.01" placeholder="e.g. 40000" {...register("lostMonthlyValue")} />{error("lostMonthlyValue") && <span className="lead-form-error">{error("lostMonthlyValue")}</span>}</label></> : null}{scheduleVisitNext ? <><DatePickerField label="Visit date" value={watch("visitDate")} min={today} hint={error("visitDate")} onChange={(value) => setValue("visitDate", value, { shouldDirty: true, shouldValidate: true })} /><TimePickerField label="Visit time" value={watch("visitTime")} min={watch("visitDate") === today ? currentTime : undefined} hint={error("visitTime")} onChange={(value) => setValue("visitTime", value, { shouldDirty: true, shouldValidate: true })} /><SelectField label="Assign to" value={watch("visitHost")} hint={error("visitHost")} onChange={(event) => setValue("visitHost", event.target.value, { shouldDirty: true, shouldValidate: true })}>{employeeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField></> : null}{showNextFollowUp ? <><DatePickerField label="Next follow-up date" value={watch("nextFollowUpDate")} min={today} disabled={isNextStepOutcome} hint={error("nextFollowUpDate")} onChange={(value) => setValue("nextFollowUpDate", value, { shouldDirty: true, shouldValidate: true })} /><TimePickerField label="Next follow-up time" value={watch("nextFollowUpTime")} min={watch("nextFollowUpDate") === today ? currentTime : undefined} disabled={isNextStepOutcome} hint={error("nextFollowUpTime")} onChange={(value) => setValue("nextFollowUpTime", value, { shouldDirty: true, shouldValidate: true })} /></> : null}<label className="settings-label journey-field-wide"><span>Conversation summary</span><textarea className={`floating-input follow-up-summary ${error("conversationSummary") ? "has-error" : ""}`} {...register("conversationSummary")} placeholder="What was discussed, decided or requested?" />{error("conversationSummary") && <span className="lead-form-error">{error("conversationSummary")}</span>}</label></div>{scheduleVisitNext ? <p className="lead-form-info">This will save the follow-up and book the visit for the selected lead.</p> : null}<div className="inline-form-actions"><Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}><CalendarDays size={15} /> {scheduleVisitNext ? "Schedule visit" : "Save follow-up"}</Button></div></motion.form>;
}

// TITLE: LEAD JOURNEY TIMELINE
export function LeadJourneyTimeline({ entries }) {
  return <div className="lead-journey-timeline">{entries.map((entry) => <motion.article className="lead-journey-entry" key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="journey-entry-heading"><div><strong>{entry.occurredDate} · {entry.occurredTime}</strong><span><UserRound size={13} /> {entry.visitorIdentity}</span></div><span className={`journey-probability journey-probability-${entry.conversionProbability.toLowerCase()}`}>{entry.conversionProbability} conversion</span></div><div className="lead-journey-grid"><div><span>Purpose</span><strong>{entry.purpose}</strong></div><div><span>Companions</span><strong>{entry.companions || "None recorded"}</strong></div><div><span>Source</span><strong>{entry.source}</strong></div><div><span>Mood</span><strong>{entry.mood} · {entry.certainty}</strong></div><div><span>Objections / doubts</span><strong>{entry.objections || "None recorded"}</strong></div><div><span>Next follow-up</span><strong><CalendarClock size={13} /> {entry.nextFollowUpDate} · {entry.nextFollowUpTime}</strong></div><div><span>Communication</span><strong><Clock3 size={13} /> {entry.communicationMode}</strong></div><div><span>Probability reason</span><strong>{entry.conversionReason}</strong></div></div>{entry.notes ? <p className="journey-entry-notes">{entry.notes}</p> : null}</motion.article>)}</div>;
}
