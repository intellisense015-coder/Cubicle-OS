"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { CalendarClock, ChevronDown, CirclePlus, Eye, History, Pencil, Search, SlidersHorizontal, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField, SelectField, TimeField } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { LeadFollowUpForm } from "@/components/os/lead-journey";
import { useToast } from "@/components/ui/toast-provider";
import { getLocalDateInputValue, getLocalTimeInputValue, isDateBeforeToday, isTimeBeforeNow } from "@/lib/follow-up-time";
import { leadStages, normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { LostReasonSelect } from "@/components/os/lost-reason-select";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { createSupabaseLead, mapSupabaseLeadToOsLead, parseTeamSize, updateSupabaseLead } from "@/lib/supabase/leads";
import { useHasPermission } from "@/lib/access-control";
import { queryKeys } from "@/lib/query-keys";
import { fetchLeadsSnapshot, type LeadsQuerySnapshot } from "@/lib/lead-query";
import { z } from "zod";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeText = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizePhone = (value) => { const digits = String(value || "").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; };
const leadWorkspaceOptions = ["Private office", "Dedicated desk", "Meeting room", "Event space"];
const leadShiftOptions = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

function normalizedPakistanNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.startsWith("3")) return `92${digits}`;
  return digits;
}

function formatContactNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^92\d{9,10}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (/^0?3\d{8,9}$/.test(digits)) {
    const local = digits.startsWith("0") ? digits : `0${digits}`;
    return `${local.slice(0, 4)} ${local.slice(4)}`;
  }
  return String(value || "");
}

function whatsappHref(value) {
  const number = normalizedPakistanNumber(value);
  return number ? `https://wa.me/${number}` : "#";
}

function LeadsAccessDenied({ view }: { view: "all" | "follow-ups" | "activity" }) {
  const title = view === "follow-ups" ? "Follow-ups" : view === "activity" ? "Lead activity" : "Leads";
  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>{title}</h1><p className="muted-copy">This area is restricted for your account.</p></div></div><div className="table-empty-state">You do not have permission to view this section.</div></motion.div>;
}

const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter the lead's name."),
  email: z.string().trim().email("Enter a valid email address, such as name@example.com."),
  phone: z.string().trim().min(1, "Enter the lead's phone number."),
  company: z.string().optional(),
  team: z.string().trim().min(1, "Enter the team size."),
  shift: z.string().trim().min(1, "Enter the preferred shift."),
  workspace: z.string().min(1, "Choose a workspace."),
  source: z.string().min(1, "Choose a lead source."),
  assignedTo: z.string().min(1, "Choose who this lead is assigned to.")
});

const leadDetailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address, such as name@example.com."),
  phone: z.string().trim().min(1, "Enter the lead's phone number."),
  stage: z.string().min(1, "Choose a lead status."),
  workspace: z.string().min(1, "Choose a workspace."),
  lostReason: z.string().optional(),
  lostMonthlyValue: z.string().optional(),
  followUp: z.string().optional(),
  followUpTime: z.string().optional(),
  employee: z.string().min(1, "Choose an assigned employee.")
}).superRefine((values, context) => {
  if (isDateBeforeToday(values.followUp)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["followUp"], message: "Choose today or a future date." });
  } else if (isTimeBeforeNow(values.followUpTime, values.followUp)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["followUpTime"], message: "Choose the current time or a future time." });
  }
  if (values.stage === "Not interested" && !values.lostReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lostReason"], message: "Choose a lost reason." });
  }
  if (values.stage === "Not interested") {
    const amount = Number(String(values.lostMonthlyValue || "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["lostMonthlyValue"], message: "Enter the estimated monthly loss." });
    }
  }
});

const leadContactSchema = z.object({
  email: z.string().trim().email("Enter a valid email address, such as name@example.com."),
  phone: z.string().trim().min(1, "Enter the lead's contact number."),
});

function leadDateTimeParts(value) {
  if (!value) return null;
  const rawValue = String(value).trim();
  if (!rawValue || rawValue === "Not scheduled" || rawValue === "—") return null;
  const hasTime = /[T\s]\d{2}:\d{2}/.test(rawValue) || rawValue.includes(" · ");
  const [rawDate, rawTime] = rawValue.includes(" · ") ? rawValue.split(" · ") : [rawValue, ""];
  const parsed = new Date(hasTime ? (rawTime ? `${rawDate}T${rawTime}:00` : rawValue) : `${rawDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { date: rawValue, time: "" };
  return {
    date: parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: hasTime ? parsed.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }) : "",
  };
}

function LeadDateTime({ value, emptyLabel = "—" }) {
  const parts = leadDateTimeParts(value);
  if (!parts) return <span className="lead-date-time-empty">{emptyLabel}</span>;
  return <span className="lead-date-time"><span>{parts.date}</span>{parts.time ? <small>{parts.time}</small> : null}</span>;
}

function formatLeadFollowUp(value) {
  return <LeadDateTime value={value} emptyLabel="Unscheduled" />;
}

function formatLeadDateTime(value) {
  return <LeadDateTime value={value} />;
}

// TITLE: LEAD ASSIGNMENT OPTIONS
function getLeadAssignmentOptions() {
  const savedEmployees = getDemoValue("employees");
  const ownerEmail = normalizeEmail(getDemoSession().email);
  const ownerName = normalizeText(getDemoValue("profileName"));
  const employees = Array.isArray(savedEmployees) ? savedEmployees : [];
  const assignableEmployees = employees
    .filter((employee) => employee.status !== "Disabled")
    .filter((employee) => normalizeEmail(employee.email) !== ownerEmail && normalizeText(employee.name) !== ownerName)
    .map((employee) => employee.name)
    .filter(Boolean);
  return ["Only me", ...new Set(assignableEmployees)];
}

// TITLE: LEAD FORM
function LeadForm({ onCancel, onSave }) {
  const { showToast } = useToast();
  const sourceOptions = ["Website", "Referral", "Instagram", "Walk-in", "Google Ads", "Social media"];
  const assignmentOptions = getLeadAssignmentOptions();
  const formApi = useForm({ resolver: zodResolver(leadSchema), defaultValues: { name: "", email: "", phone: "", company: "", team: "1 person", shift: "morning", workspace: "", source: "Website", assignedTo: "Only me" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const onSubmit = async (form) => {
    if (!parseTeamSize(form.team)) {
      setError("team", { message: "Enter a positive team size, for example 6 people." });
      return;
    }
    const savedLeads = getDemoValue("leads");
    const savedEmployees = getDemoValue("employees");
    const savedMembers = getDemoValue("members");
    const savedCompanies = getDemoValue("companies");
    const leads = Array.isArray(savedLeads) ? savedLeads : [];
    const employees = Array.isArray(savedEmployees) ? savedEmployees : [];
    const members = Array.isArray(savedMembers) ? savedMembers : [];
    const companies = Array.isArray(savedCompanies) ? savedCompanies : [];
    const email = normalizeEmail(form.email);
    const phone = normalizePhone(form.phone);
    const company = normalizeText(form.company);
    const ownerEmail = normalizeEmail(getDemoSession().email);
    const ownerPhone = normalizePhone(getDemoValue("profilePhone") || "+92 300 0000000");

    const matchingLeadByEmail = leads.find((lead) => normalizeEmail(lead.email) === email);
    const matchingLeadByPhone = phone ? leads.find((lead) => normalizePhone(lead.phone) === phone) : null;
    const matchingLeadByPhoneAndCompany = phone && company
      ? leads.find((lead) => normalizePhone(lead.phone) === phone && normalizeText(lead.company) === company)
      : null;
    const matchingLeadByEmailAndCompany = email && company
      ? leads.find((lead) => normalizeEmail(lead.email) === email && normalizeText(lead.company) === company)
      : null;
    const emailUsedByEmployee = employees.some((employee) => normalizeEmail(employee.email) === email);
    const phoneUsedByEmployee = phone && employees.some((employee) => normalizePhone(employee.phone) === phone);
    const emailUsedByMember = members.some((member) => normalizeEmail(member.email) === email);
    const phoneUsedByMember = phone && members.some((member) => normalizePhone(member.phone) === phone);

    let hasBusinessError = false;
    if (matchingLeadByEmailAndCompany) {
      const message = "A lead with this email address and company is already registered.";
      setError("email", { message });
      setError("company", { message });
      hasBusinessError = true;
    } else if (matchingLeadByEmail) {
      setError("email", { message: "A lead with this email address is already registered. Please use a different email." });
      hasBusinessError = true;
    } else if (email === ownerEmail || emailUsedByEmployee) {
      setError("email", { message: "This email address belongs to the owner or an employee. Please use a different email." });
      hasBusinessError = true;
    } else if (emailUsedByMember) {
      setError("email", { message: "This email address is already used by a member. Please use a different email." });
      hasBusinessError = true;
    }

    if (phone && matchingLeadByPhoneAndCompany) {
      const message = "A lead with this phone number and company is already registered.";
      setError("phone", { message });
      setError("company", { message });
      hasBusinessError = true;
    } else if (phone && matchingLeadByPhone) {
      setError("phone", { message: "A lead with this phone number is already registered. Please use a different number." });
      hasBusinessError = true;
    } else if (phone && (phone === ownerPhone || phoneUsedByEmployee)) {
      setError("phone", { message: "This phone number belongs to the owner or an employee. Please use a different number." });
      hasBusinessError = true;
    } else if (phone && phoneUsedByMember) {
      setError("phone", { message: "This phone number is already used by a member. Please use a different number." });
      hasBusinessError = true;
    }

    if (company && leads.some((lead) => normalizeText(lead.company) === company) && !matchingLeadByEmailAndCompany && !matchingLeadByPhoneAndCompany) {
      setError("company", { message: "A lead with this company is already registered. Please check the company name." });
      hasBusinessError = true;
    } else if (company && (members.some((member) => normalizeText(member.company) === company) || companies.some((item) => normalizeText(item.name || item.company || item) === company))) {
      setError("company", { message: "This company is already registered. Please check the company name." });
      hasBusinessError = true;
    }

    if (hasBusinessError) {
      showToast({ variant: "error", title: "Lead was not saved", message: "Please review the highlighted fields and try again." });
      return;
    }
    await onSave({ ...form, id: `lead-${Date.now()}`, createdAt: new Date().toISOString(), stage: "New lead", nextFollowUp: "Not scheduled" });
  };

  const error = (field) => formState.errors[field]?.message;
  return <motion.form className="inline-form-card lead-create-form lead-add-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(onSubmit)}><div className="card-heading"><div><h2>Add lead</h2><p className="muted-copy">Lead details are saved securely.</p></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input className={error("name") ? "has-error" : ""} {...register("name")} placeholder="Lead name" />{error("name") && <span className="lead-form-error">{error("name")}</span>}</label><label className="settings-label">Email<Input className={error("email") ? "has-error" : ""} type="email" {...register("email")} placeholder="lead@example.com" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">Phone<Input className={error("phone") ? "has-error" : ""} {...register("phone")} placeholder="+92" />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><label className="settings-label">Company<Input className={error("company") ? "has-error" : ""} {...register("company")} placeholder="Company (OS metadata)" />{error("company") && <span className="lead-form-error">{error("company")}</span>}</label><label className="settings-label">Team size<Input className={error("team") ? "has-error" : ""} {...register("team")} placeholder="e.g. 6 people" />{error("team") && <span className="lead-form-error">{error("team")}</span>}</label><SelectField label="Shift" value={watch("shift")} hint={error("shift")} onChange={(event) => setValue("shift", event.target.value, { shouldDirty: true, shouldValidate: true })}>{leadShiftOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</SelectField><SelectField label="Workspace" value={watch("workspace")} hint={error("workspace")} onChange={(event) => setValue("workspace", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select a workspace</option>{leadWorkspaceOptions.map((type) => <option value={type} key={type}>{type}</option>)}</SelectField><SelectField label="Source" value={watch("source")} hint={error("source")} onChange={(event) => setValue("source", event.target.value, { shouldDirty: true, shouldValidate: true })}>{sourceOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField><SelectField label="Assign to" value={watch("assignedTo")} hint={error("assignedTo")} onChange={(event) => setValue("assignedTo", event.target.value, { shouldDirty: true, shouldValidate: true })}>{assignmentOptions.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField></div><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}>Save lead</Button></div></motion.form>;
}

function LeadFilterSelect({ label, value, options, emptyLabel, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>{label}</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value || emptyLabel}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{["", ...options].map((option) => <button type="button" key={option || emptyLabel} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option || emptyLabel}</button>)}</div>}</div></div>;
}

// TITLE: LEAD TABLE
function createLeadColumns(onOpen, onEdit, canEdit) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("createdAt", { header: "Date & time", cell: ({ getValue }) => formatLeadDateTime(getValue()) }), columnHelper.accessor("name", { header: "Lead", cell: ({ row }) => <Link href={`/leads/${row.original.id}`} className="table-primary" onClick={(event) => event.stopPropagation()} aria-label={`Open journey for ${row.original.name}`}><strong>{row.original.name}</strong><span>{row.original.email}</span></Link> }), columnHelper.accessor("phone", { header: "Phone", cell: ({ getValue }) => { const phone = String(getValue() || "").trim(); return phone ? <a className="lead-phone-link" href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Open WhatsApp for ${phone}`}>{formatContactNumber(phone)}</a> : "—"; } }), columnHelper.accessor("workspace", { header: "Workspace", cell: ({ getValue }) => <WorkspaceBadge value={getValue()} /> }), columnHelper.accessor("team", { header: "Team size" }), columnHelper.accessor("assignedTo", { header: "Assigned to", cell: ({ getValue }) => getValue() || "Unassigned" }), columnHelper.accessor("stage", { header: "Lead stage", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Converted" || getValue() === "Quotation Approved" ? "success" : getValue() === "Follow-up due" || getValue() === "Quote Sent" ? "accent" : "neutral"}>{getValue()}</StatusBadge> }), columnHelper.accessor("lostReason", { header: "Lost reason", cell: ({ row, getValue }) => normalizeLeadStage(row.original.stage, row.original) === "Not interested" ? getValue() || "Not categorized" : "—" }), columnHelper.accessor("nextFollowUp", { header: "Next follow-up", cell: ({ getValue }) => formatLeadFollowUp(getValue()) }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><Link className="action-icon-btn" href={`/leads/${row.original.id}`} onClick={(event) => event.stopPropagation()} aria-label={`View journey for ${row.original.name}`} title="Journey"><History size={16} /></Link><button className="action-icon-btn" type="button" onClick={(event) => { event.stopPropagation(); onOpen(row.original); }} aria-label={`Open ${row.original.name}`} title={["Follow-up due", "Quote Sent"].includes(normalizeLeadStage(row.original.stage)) ? "Log follow-up" : "Open"}><Eye size={16} /></button>{canEdit ? <button className="action-icon-btn" type="button" onClick={(event) => { event.stopPropagation(); onEdit(row.original); }} aria-label={`Edit contact details for ${row.original.name}`} title="Edit contact details"><Pencil size={16} /></button> : null}</div> })];
}

function LeadContactEdit({ lead, onCancel, onSave }) {
  const formApi = useForm({
    resolver: zodResolver(leadContactSchema),
    defaultValues: { email: lead.email || "", phone: lead.phone || "" },
    mode: "onBlur",
  });
  const { handleSubmit, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;

  return <motion.form className="inline-form-card lead-create-form lead-contact-editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit((values) => onSave({ ...lead, email: values.email.trim().toLowerCase(), phone: values.phone.trim() }))}>
    <div className="card-heading"><div><h2>Edit lead</h2><p className="muted-copy">{lead.name}</p></div></div>
    <div className="inline-form-grid lead-contact-editor-grid">
      <label className="settings-label"><span>Email</span><Input className={error("email") ? "has-error" : ""} type="email" autoComplete="email" {...formApi.register("email")} />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label>
      <label className="settings-label"><span>Contact</span><Input className={error("phone") ? "has-error" : ""} type="tel" autoComplete="tel" {...formApi.register("phone")} />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label>
    </div>
    <div className="inline-form-actions"><Button type="button" variant="danger" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}>Save</Button></div>
  </motion.form>;
}

function hasScheduledFollowUp(lead) {
  const nextFollowUp = String(lead.nextFollowUp || "").trim();
  return normalizeLeadStage(lead.stage, lead) === "Follow-up due"
    || Boolean(nextFollowUp && nextFollowUp !== "Not scheduled" && nextFollowUp !== "—");
}

function activityTypeLabel(entry) {
  if (entry.entryType === "visit") return "Visit";
  if (entry.entryType === "follow-up") return "Follow-up";
  if (entry.entryType === "quotation") return "Quotation";
  if (entry.entryType === "proposal") return "Proposal";
  return "Interaction";
}

function createLeadActivityColumns() {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("occurredAt", { header: "Date & time", cell: ({ getValue }) => formatLeadDateTime(getValue()) }), columnHelper.accessor("leadName", { header: "Lead", cell: ({ row }) => <Link href={`/leads/${row.original.leadId}`} className="table-primary" aria-label={`Open journey for ${row.original.leadName}`}><strong>{row.original.leadName}</strong><span>{row.original.leadEmail || "—"}</span></Link> }), columnHelper.accessor("activityType", { header: "Activity" }), columnHelper.accessor("summary", { header: "Details", cell: ({ getValue }) => getValue() || "—" }), columnHelper.accessor("outcome", { header: "Outcome", cell: ({ getValue }) => getValue() || "—" }), columnHelper.accessor("nextFollowUp", { header: "Next follow-up", cell: ({ getValue }) => formatLeadFollowUp(getValue()) }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><Link className="action-icon-btn" href={`/leads/${row.original.leadId}`} aria-label={`View journey for ${row.original.leadName}`} title="Journey"><History size={16} /></Link></div> })];
}

// TITLE: LEAD DETAIL AND JOURNEY
function LeadDetail({ lead, onUpdate, onLogFollowUp, canEdit = true }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const formApi = useForm({ resolver: zodResolver(leadDetailSchema), defaultValues: { email: lead.email || "", phone: lead.phone || "", stage: normalizeLeadStage(lead.stage, lead), workspace: lead.workspace || "", lostReason: lead.lostReason || "", lostMonthlyValue: lead.lostMonthlyValue ? String(lead.lostMonthlyValue) : "", followUp: lead.nextFollowUp && /^\d{4}-\d{2}-\d{2}/.test(lead.nextFollowUp) ? lead.nextFollowUp.slice(0, 10) : "", followUpTime: lead.nextFollowUp?.match(/ · (\d{2}:\d{2})$/)?.[1] || "", employee: lead.assignedTo || "" }, mode: "onBlur" });
  const { handleSubmit, setValue, watch, formState } = formApi;
  const today = getLocalDateInputValue();
  const currentTime = getLocalTimeInputValue();
  const hasPendingFollowUp = normalizeLeadStage(lead.stage, lead) === "Follow-up due";
  const isTerminal = ["Converted", "Not interested"].includes(normalizeLeadStage(lead.stage, lead));
  useEffect(() => {
    const savedEmployees = getDemoValue("employees");
    const activeEmployees = Array.isArray(savedEmployees) ? savedEmployees.filter((item) => item.status !== "Disabled" && item.name).map((item) => item.name) : [];
    const employeeOptions = [...new Set([lead.assignedTo, ...activeEmployees].filter(Boolean))];
    setEmployees(employeeOptions);
    setValue("employee", lead.assignedTo || activeEmployees[0] || "Unassigned", { shouldValidate: true });
  }, []);
  const error = (field) => formState.errors[field]?.message;
  const save = (values) => onUpdate({ ...lead, email: values.email.trim().toLowerCase(), phone: values.phone.trim(), stage: values.stage, workspace: values.workspace, lostReason: values.stage === "Not interested" ? values.lostReason : "", lostMonthlyValue: values.stage === "Not interested" ? values.lostMonthlyValue : null, nextFollowUp: hasPendingFollowUp ? lead.nextFollowUp : (values.followUp ? (values.followUpTime ? `${values.followUp} · ${values.followUpTime}` : values.followUp) : "Not scheduled"), assignedTo: values.employee });
  const leadSubtitle = lead.company ? `${lead.company} · ${lead.email}` : lead.email;
  if (!canEdit) return <div className="inline-form-card lead-create-form lead-detail-editor"><div className="card-heading"><div><h2>{lead.name}</h2><p className="muted-copy">{leadSubtitle}</p></div></div><div className="ledger-summary"><div><span>Stage</span><strong>{lead.stage}</strong></div><div><span>Interactions</span><strong>{lead.journey.length}</strong></div><div><span>Next follow-up</span><strong>{lead.nextFollowUp || "Not scheduled"}</strong></div></div><div className="inline-form-actions"><span className="read-only-label">View only</span></div></div>;
  return <motion.form className="inline-form-card lead-create-form lead-detail-editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(save)}><div className="card-heading"><div><h2>{lead.name}</h2><p className="muted-copy">{leadSubtitle}</p></div></div><div className="ledger-summary"><div><span>Stage</span><strong>{lead.stage}</strong></div><div><span>Interactions</span><strong>{lead.journey.length}</strong></div></div><div className="inline-form-grid"><label className="settings-label"><span>Email</span><Input type="email" autoComplete="email" {...formApi.register("email")} />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label"><span>Phone</span><Input type="tel" autoComplete="tel" {...formApi.register("phone")} />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><SelectField label="Lead status" value={watch("stage")} hint={error("stage")} onChange={(event) => setValue("stage", event.target.value, { shouldDirty: true, shouldValidate: true })}>{leadStages.map((stage) => <option value={stage} key={stage}>{stage}</option>)}</SelectField><SelectField label="Workspace" value={watch("workspace")} hint={error("workspace")} onChange={(event) => setValue("workspace", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select a workspace</option>{leadWorkspaceOptions.map((type) => <option value={type} key={type}>{type}</option>)}</SelectField>{watch("stage") === "Not interested" ? <><LostReasonSelect value={watch("lostReason")} hint={error("lostReason")} onChange={(value) => setValue("lostReason", value, { shouldDirty: true, shouldValidate: true })} /><label className="settings-label"><span>Estimated monthly loss</span><Input type="number" min="0.01" step="0.01" placeholder="e.g. 40000" {...formApi.register("lostMonthlyValue")} />{error("lostMonthlyValue") && <span className="lead-form-error">{error("lostMonthlyValue")}</span>}</label></> : null}<DateField label="Next follow-up date" min={today} disabled={hasPendingFollowUp || isTerminal} hint={error("followUp")} {...formApi.register("followUp")} /><TimeField label="Next follow-up time" min={watch("followUp") === today ? currentTime : undefined} disabled={hasPendingFollowUp || isTerminal} hint={error("followUpTime")} {...formApi.register("followUpTime")} /><SelectField label="Assigned employee" value={watch("employee")} hint={error("employee")} onChange={(event) => setValue("employee", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="Unassigned">Unassigned</option>{employees.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField></div>{hasPendingFollowUp ? <p className="lead-form-info">A follow-up is already scheduled. Log it before scheduling another.</p> : null}{isTerminal ? <p className="lead-form-info">This lead is closed and cannot receive another follow-up.</p> : null}<div className="inline-form-actions">{!isTerminal ? <Button type="button" variant="ghost" onClick={onLogFollowUp}><CalendarClock size={15} /> Log follow-up</Button> : null}<Button type="submit" variant="brand" loading={formState.isSubmitting}>Save lead update</Button></div></motion.form>;
}

// TITLE: LEADS PAGE
export default function LeadsPage({ view = "all" }: { view?: "all" | "follow-ups" | "activity" } = {}) {
  const { showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canViewLeads = useHasPermission("leads.read");
  const canViewFollowUps = useHasPermission("leads.followups.read");
  const canViewActivity = useHasPermission("leads.activity.read");
  const canWriteLeads = useHasPermission("leads.write");
  const canWriteFollowUps = useHasPermission("leads.followups.write");
  const canView = view === "all" ? canViewLeads : canViewLeads && (view === "follow-ups" ? canViewFollowUps : canViewActivity);
  const canWrite = view === "follow-ups" ? canWriteFollowUps : canWriteLeads;
  const initialLeads = [];
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState(null);
  const [contactEditLead, setContactEditLead] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" });
  const [appliedFilters, setAppliedFilters] = useState({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" });
  const [employees, setEmployees] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const connectionErrorShown = useRef(false);

  const leadsQuery = useQuery({
    queryKey: queryKeys.leads.all,
    queryFn: fetchLeadsSnapshot,
    enabled: canView,
    // Realtime handles normal changes. This is only a low-frequency recovery
    // check while Leads is open if a WebSocket event is missed.
    refetchInterval: 15 * 60_000,
  });

  useEffect(() => {
    const savedEmployees = getDemoValue("employees");
    if (Array.isArray(savedEmployees)) setEmployees(savedEmployees.filter((employee) => employee.status !== "Disabled" && employee.name));
  }, []);

  useEffect(() => {
    const snapshot = leadsQuery.data;
    if (!snapshot) return;

    setLeads(snapshot.leads);
    setDataSource(snapshot.dataSource);
    setLoadError(snapshot.errorMessage);

    if (snapshot.errorMessage && !connectionErrorShown.current) {
      connectionErrorShown.current = true;
      showToast({
        variant: "error",
        title: "Could not load leads",
        message: "We couldn’t load the leads right now. Please refresh and try again.",
      });
    }
  }, [leadsQuery.data, showToast]);

  if (!canView) return <LeadsAccessDenied view={view} />;

  // TITLE: LEAD ACTIONS
  const persist = (nextLeads) => {
    setLeads(nextLeads);
    queryClient.setQueryData<LeadsQuerySnapshot>(queryKeys.leads.all, (current) => ({
      leads: nextLeads,
      dataSource: current?.dataSource || (isSupabaseLeadsEnabled() ? "supabase" : "demo"),
      errorMessage: "",
    }));
    saveDemoValue("leads", nextLeads);
  };
  const openLead = (lead) => {
    const normalizedLead = { ...lead, stage: normalizeLeadStage(lead.stage, lead) };
    if (["Follow-up due", "Quote Sent"].includes(normalizedLead.stage)) {
      setSelected(null);
      if (canWrite) {
        setFollowUpLead(normalizedLead);
      } else {
        setFollowUpLead(null);
        showToast({
          variant: "error",
          title: "Follow-up access required",
          message: "You can view this lead, but you do not have permission to log a follow-up.",
        });
      }
      return;
    }
    setFollowUpLead(null);
    setSelected(normalizedLead);
  };
  const openLeadAction = openLead;
  const openLeadContactEdit = (lead) => {
    if (!canWrite) {
      showToast({ variant: "error", title: "View-only access", message: "You can view leads, but your account cannot edit them." });
      return;
    }
    setContactEditLead(lead);
  };
  const updateLead = async (nextLead) => {
    if (!canWrite) {
      showToast({ variant: "error", title: "View-only access", message: "You can view leads, but your account cannot edit them." });
      return;
    }
    const currentLead = leads.find((lead) => lead.id === nextLead.id);
    if (!currentLead) return;
    const normalizedCurrent = { ...currentLead, stage: normalizeLeadStage(currentLead.stage, currentLead) };
    const requestedStage = normalizeLeadStage(nextLead.stage, nextLead);
    const isTerminal = ["Converted", "Not interested"].includes(requestedStage);
    const hasNewFollowUp = !isTerminal && requestedStage === normalizedCurrent.stage && nextLead.nextFollowUp && nextLead.nextFollowUp !== "Not scheduled" && nextLead.nextFollowUp !== currentLead.nextFollowUp;
    const baseUpdated = hasNewFollowUp
      ? transitionLead({ ...normalizedCurrent, assignedTo: nextLead.assignedTo, workspace: nextLead.workspace }, { type: "follow-up-scheduled", nextFollowUp: nextLead.nextFollowUp })
      : { ...normalizedCurrent, assignedTo: nextLead.assignedTo, workspace: nextLead.workspace, nextFollowUp: isTerminal || requestedStage !== normalizedCurrent.stage ? "Not scheduled" : nextLead.nextFollowUp, stage: requestedStage };
    const updated = {
      ...baseUpdated,
      stage: requestedStage,
      lostReason: requestedStage === "Not interested" ? nextLead.lostReason || "" : "",
      lostMonthlyValue: requestedStage === "Not interested" ? nextLead.lostMonthlyValue : null,
      lostAt: requestedStage === "Not interested" ? nextLead.lostAt || new Date().toISOString() : "",
    };

    try {
      // `visited` describes the website/visit flag. It must not be derived
      // from the OS workflow stage, otherwise Quote Sent and other stages are
      // converted back to Visited after the next reload.
      const visited = Boolean(currentLead.visited);
      if (isSupabaseLeadsEnabled() && currentLead.backend === "supabase") {
        await updateSupabaseLead(updated.id, {
          email: updated.email,
          phone: updated.phone,
          workspace: updated.workspace,
          visited,
          stage: requestedStage,
          lostReason: updated.lostReason,
          lostMonthlyValue: updated.lostMonthlyValue,
        }, view === "follow-ups" ? "lead.followup.update" : "lead.update");
      }
      const next = leads.map((lead) => lead.id === updated.id ? { ...updated, visited } : lead);
      persist(next);
      setSelected(null);
      showToast({ variant: "success", title: "Lead updated", message: `${updated.name}'s details were saved successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: "Lead was not updated", message: error?.message || "Lead could not be updated." });
    }
  };
  const updateLeadContacts = async (nextLead) => {
    if (!canWrite) {
      showToast({ variant: "error", title: "View-only access", message: "You can view leads, but your account cannot edit them." });
      return;
    }
    const currentLead = leads.find((lead) => lead.id === nextLead.id);
    if (!currentLead) return;
    const email = normalizeEmail(nextLead.email);
    const phone = String(nextLead.phone || "").trim();

    try {
      if (isSupabaseLeadsEnabled() && currentLead.backend === "supabase") {
        await updateSupabaseLead(currentLead.id, { email, phone }, "lead.update");
      }
      const updated = { ...currentLead, email, phone };
      persist(leads.map((lead) => lead.id === updated.id ? updated : lead));
      setContactEditLead(null);
      if (selected?.id === updated.id) setSelected(updated);
      showToast({ variant: "success", title: "Lead contact updated", message: `${updated.name}'s email and contact were updated successfully.` });
    } catch (error) {
      showToast({ variant: "error", title: "Lead contact was not updated", message: error?.message || "The lead contact details could not be updated." });
    }
  };
  const saveFollowUp = async ({ entry, outcome, lostReason, lostMonthlyValue, nextFollowUpDate, nextFollowUpTime, nextFollowUp }) => {
    if (!followUpLead || !canWrite) return;
    const transitioned = transitionLead(followUpLead, { type: "follow-up-logged", outcome, lostReason, nextFollowUpDate, nextFollowUpTime, nextFollowUp });
    const updated = {
      ...transitioned,
      lostReason: outcome === "Not interested" ? lostReason || "" : "",
      lostMonthlyValue: outcome === "Not interested" ? lostMonthlyValue : null,
      lostAt: outcome === "Not interested" ? new Date().toISOString() : "",
    };
    const next = leads.map((lead) => lead.id === updated.id ? { ...updated, journey: [entry, ...(Array.isArray(followUpLead.journey) ? followUpLead.journey : [])] } : lead);
    const savedLead = next.find((lead) => lead.id === updated.id);

    try {
      if (isSupabaseLeadsEnabled() && followUpLead.backend === "supabase") {
        await updateSupabaseLead(updated.id, {
          workspace: updated.workspace,
          visited: Boolean(followUpLead.visited),
          stage: updated.stage,
          lostReason: updated.lostReason,
          lostMonthlyValue: updated.lostMonthlyValue,
        }, "lead.followup.update");
      }
      persist(next);
      setFollowUpLead(null);
      setSelected(null);
      showToast({ variant: "success", title: "Follow-up logged", message: `${savedLead.name}'s journey was updated successfully.` });
      if (outcome === "Schedule a visit") {
        saveDemoValue("pendingVisitLeadId", updated.id);
        router.push("/visits");
      }
    } catch (error) {
      showToast({ variant: "error", title: "Follow-up was not saved", message: error?.message || "The follow-up could not be saved." });
    }
  };
  const addLead = async (lead) => { if (!canWrite) { showToast({ variant: "error", title: "View-only access", message: "Your account cannot add leads." }); return; } try { if (!isSupabaseLeadsEnabled()) { const nextLead = { ...lead, backend: "demo", journey: [] }; persist([nextLead, ...leads]); setShowForm(false); showToast({ variant: "success", title: "Lead added", message: `${nextLead.name} was added successfully.` }); return; } const row = await createSupabaseLead(lead); const nextLead = { ...mapSupabaseLeadToOsLead(row), ...lead, id: row.id, backend: "supabase", createdAt: row.created_at ? row.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10), journey: [] }; persist([nextLead, ...leads]); setShowForm(false); showToast({ variant: "success", title: "Lead added", message: `${nextLead.name} was added successfully.` }); } catch (error) { showToast({ variant: "error", title: "Lead was not saved", message: error?.message || "Lead could not be saved." }); } };
  const applyFilters = () => { setAppliedFilters(filters); setShowFilters(false); showToast({ variant: "success", title: "Filters applied", message: "The lead pipeline was updated." }); };
  const discardFilterChanges = () => { setFilters(appliedFilters); setShowFilters(false); };
  const companies = [...new Set(leads.map((lead) => lead.company).filter(Boolean))];
  const stages = leadStages;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleLeads = leads.filter((lead) => {
    const searchable = `${lead.name} ${lead.email} ${lead.company} ${lead.team}`.toLowerCase();
    const createdDate = String(lead.createdAt || lead.createdDate || "").slice(0, 10);
    return (!normalizedQuery || searchable.includes(normalizedQuery)) && (!appliedFilters.stage || lead.stage === appliedFilters.stage) && (!appliedFilters.company || lead.company === appliedFilters.company) && (!appliedFilters.assignedTo || lead.assignedTo === appliedFilters.assignedTo) && (!appliedFilters.dateFrom || createdDate >= appliedFilters.dateFrom) && (!appliedFilters.dateTo || createdDate <= appliedFilters.dateTo);
  }).sort((a, b) => Number(b.stage === "Follow-up due") - Number(a.stage === "Follow-up due"));

  const isFollowUpsView = view === "follow-ups";
  const isActivityView = view === "activity";
  const pageTitle = isFollowUpsView ? "Follow-ups" : isActivityView ? "Lead activity" : "Leads";
  const pageDescription = isFollowUpsView
    ? "Keep scheduled and due lead actions in one place."
    : isActivityView
      ? "Review the activity history across your leads."
      : "Keep every enquiry moving toward the right space.";
  const leadRowsForView = isFollowUpsView ? visibleLeads.filter(hasScheduledFollowUp) : visibleLeads;
  const activityRows = visibleLeads.flatMap((lead) => {
    const journey = Array.isArray(lead.journey) ? lead.journey : [];
    return journey.map((entry, index) => ({
      id: `${lead.id}-${entry.id || index}`,
      leadId: lead.id,
      leadName: lead.name,
      leadEmail: lead.email,
      occurredAt: entry.occurredDate
        ? `${entry.occurredDate}${entry.occurredTime ? `T${entry.occurredTime}` : ""}`
        : lead.createdAt,
      activityType: activityTypeLabel(entry),
      summary: entry.conversationSummary || entry.notes || entry.purpose || "Activity recorded",
      outcome: entry.outcome || "—",
      nextFollowUp: entry.nextFollowUpDate
        ? `${entry.nextFollowUpDate}${entry.nextFollowUpTime ? ` · ${entry.nextFollowUpTime}` : ""}`
        : "Not scheduled"
    }));
  }).sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")));
  const activityLeadCount = new Set(activityRows.map((row) => row.leadId)).size;

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>{pageTitle}</h1><p className="muted-copy">{pageDescription} {dataSource === "supabase" ? "Connected." : dataSource === "demo" ? "Showing cached demo data." : "Loading…"}</p>{loadError ? <p className="lead-form-error">{loadError}</p> : null}</div></div><section className="stat-grid module-stats leads-kpi-grid"><KpiCard icon={<UsersRound size={18} />} label={isActivityView ? "Leads with activity" : isFollowUpsView ? "Open follow-ups" : "New leads"} value={isActivityView ? activityLeadCount : isFollowUpsView ? leadRowsForView.length : leads.filter((lead) => lead.stage === "New lead").length} detail={isActivityView ? "Leads with recorded activity" : isFollowUpsView ? "Scheduled or due actions" : dataSource === "supabase" ? "Live pipeline data" : "Cached pipeline"} /><KpiCard icon={<CalendarClock size={18} />} label={isActivityView ? "Activities" : isFollowUpsView ? "Due now" : "Follow-ups due"} value={isActivityView ? activityRows.length : isFollowUpsView ? leadRowsForView.filter((lead) => normalizeLeadStage(lead.stage, lead) === "Follow-up due").length : leads.filter((lead) => lead.stage === "Follow-up due").length} detail={isActivityView ? "Interactions and follow-ups" : isFollowUpsView ? "Needs attention" : "Review next actions"} /></section><div className="leads-toolbar page-search-row"><div className="header-search-wrap page-search-wrap"><Search size={14} className="search-leading-icon" /><input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search" aria-label={`Search ${isActivityView ? "lead activity" : "leads"}`} className="search-input" /><div className="search-kbd-pill"><span>Ctrl K</span></div></div><div className="leads-toolbar-actions"><Button variant="ghost" onClick={() => { setFilters(appliedFilters); setShowFilters(true); }}><SlidersHorizontal size={14} /> Filter</Button>{!isFollowUpsView && !isActivityView ? canWrite ? <Button onClick={() => setShowForm(true)}><CirclePlus size={16} /> Add lead</Button> : <span className="read-only-label">View only</span> : null}</div></div><div className="section-heading"><div><h2>{isActivityView ? "Activity timeline" : isFollowUpsView ? "Follow-up queue" : "Lead pipeline"}</h2></div></div>{isActivityView ? <DataTable columns={createLeadActivityColumns()} data={activityRows} emptyMessage="No lead activity yet." emptySubtitle="Interactions and follow-ups will appear here." /> : <DataTable columns={createLeadColumns(openLeadAction, openLeadContactEdit, canWrite)} data={leadRowsForView} onRowClick={openLead} emptyMessage={isFollowUpsView ? "No follow-ups scheduled." : "No leads yet."} emptySubtitle={isFollowUpsView ? "Scheduled lead actions will appear here." : "Leads will appear here when they are added."} />}<Dialog open={showFilters} onClose={discardFilterChanges} ariaLabel="Filter leads"><div className="inline-form-card lead-filter-panel"><div className="card-heading"><div><h2>Filter leads</h2><p className="muted-copy">Filter the lead pipeline by stage, company or assigned employee.</p></div></div><div className="inline-form-grid"><LeadFilterSelect label="Lead stage" value={filters.stage} options={stages} emptyLabel="All stages" onChange={(stage) => setFilters((current) => ({ ...current, stage }))} /><LeadFilterSelect label="Company" value={filters.company} options={companies} emptyLabel="All companies" onChange={(company) => setFilters((current) => ({ ...current, company }))} /><LeadFilterSelect label="Assigned to" value={filters.assignedTo} options={employees.map((employee) => employee.name)} emptyLabel="All employees" onChange={(assignedTo) => setFilters((current) => ({ ...current, assignedTo }))} /><label className="settings-label">From date<Input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label><label className="settings-label">To date<Input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label></div><div className="inline-form-actions"><Button variant="ghost" onClick={() => setFilters({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" })}>Clear</Button><Button onClick={applyFilters}>Apply filters</Button></div></div></Dialog><Dialog open={showForm} onClose={() => setShowForm(false)} ariaLabel="Add lead"><LeadForm onCancel={() => setShowForm(false)} onSave={addLead} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Lead details">{selected ? <LeadDetail canEdit={canWrite} lead={selected} onUpdate={updateLead} onLogFollowUp={() => setFollowUpLead(selected)} /> : null}</Dialog><Dialog open={Boolean(contactEditLead)} onClose={() => setContactEditLead(null)} ariaLabel="Edit lead contact details">{contactEditLead ? <LeadContactEdit lead={contactEditLead} onCancel={() => setContactEditLead(null)} onSave={updateLeadContacts} /> : null}</Dialog><Dialog open={Boolean(followUpLead) && canWrite} onClose={() => setFollowUpLead(null)} ariaLabel="Log follow-up">{followUpLead ? <LeadFollowUpForm lead={followUpLead} onCancel={() => setFollowUpLead(null)} onSave={saveFollowUp} /> : null}</Dialog></motion.div>;
}
