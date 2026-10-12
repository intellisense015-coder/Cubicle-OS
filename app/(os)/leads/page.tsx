"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { CalendarClock, ChevronDown, CirclePlus, Eye, History, LoaderCircle, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField, SelectField, TimeField } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { normalizeLeadJourney } from "@/lib/lead-journey";
import { LeadFollowUpForm } from "@/components/os/lead-journey";
import { leadRows } from "@/lib/module-b-data";
import { useToast } from "@/components/ui/toast-provider";
import { getLocalDateInputValue, getLocalTimeInputValue, isDateBeforeToday, isTimeBeforeNow } from "@/lib/follow-up-time";
import { leadStages, normalizeLeadStage, transitionLead } from "@/lib/lead-stages";
import { z } from "zod";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeText = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizePhone = (value) => { const digits = String(value || "").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; };

const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter the lead's name."),
  email: z.string().trim().email("Enter a valid email address, such as name@example.com."),
  phone: z.string().optional(),
  company: z.string().optional(),
  team: z.string().trim().min(1, "Enter the team size."),
  source: z.string().min(1, "Choose a lead source."),
  assignedTo: z.string().min(1, "Choose who this lead is assigned to.")
});

const leadDetailSchema = z.object({
  followUp: z.string().optional(),
  followUpTime: z.string().optional(),
  employee: z.string().min(1, "Choose an assigned employee.")
}).superRefine((values, context) => {
  if (isDateBeforeToday(values.followUp)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["followUp"], message: "Choose today or a future date." });
  } else if (isTimeBeforeNow(values.followUpTime, values.followUp)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["followUpTime"], message: "Choose the current time or a future time." });
  }
});

function formatLeadFollowUp(value) {
  if (!value || value === "Not scheduled") return value || "Not scheduled";
  const hasTime = value.includes(" · ");
  const [date, time] = hasTime ? value.split(" · ") : [value, "00:00"];
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", hasTime ? { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true } : { day: "2-digit", month: "short", year: "numeric" }).replace(",", "");
}

// TITLE: LEAD ASSIGNMENT SELECT
function LeadAssignmentSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const savedEmployees = getDemoValue("employees");
  const options = ["Only me", ...(Array.isArray(savedEmployees) ? savedEmployees.filter((employee) => employee.status !== "Disabled").map((employee) => employee.name).filter(Boolean) : [])];
  return <div className="settings-label lead-source-field"><span>Assign to</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{options.map((option) => <button type="button" key={option} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div></div>;
}

// TITLE: LEAD FORM
function LeadForm({ onCancel, onSave }) {
  const { showToast } = useToast();
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceOptions = ["Website", "Referral", "Instagram", "Walk-in", "Google Ads", "Social media"];
  const formApi = useForm({ resolver: zodResolver(leadSchema), defaultValues: { name: "", email: "", phone: "", company: "", team: "1 person", source: "Website", assignedTo: "Only me" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const onSubmit = (form) => {
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
    onSave({ ...form, id: `lead-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10), stage: "New lead", nextFollowUp: "Not scheduled" });
  };

  const error = (field) => formState.errors[field]?.message;
  return <motion.form className="inline-form-card lead-create-form lead-add-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(onSubmit)}><div className="card-heading"><div><h2>Add lead</h2></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input className={error("name") ? "has-error" : ""} {...register("name")} placeholder="Lead name" />{error("name") && <span className="lead-form-error">{error("name")}</span>}</label><label className="settings-label">Email<Input className={error("email") ? "has-error" : ""} type="email" {...register("email")} placeholder="lead@example.com" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">Phone<Input className={error("phone") ? "has-error" : ""} {...register("phone")} placeholder="+92" />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><label className="settings-label">Company<Input className={error("company") ? "has-error" : ""} {...register("company")} placeholder="Company" />{error("company") && <span className="lead-form-error">{error("company")}</span>}</label><label className="settings-label">Team size<Input {...register("team")} /></label><div className="settings-label lead-source-field"><span>Source</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setSourceOpen((open) => !open)} aria-expanded={sourceOpen}>{watch("source")}<ChevronDown size={14} /></button>{sourceOpen && <div className="lead-source-menu">{sourceOptions.map((option) => <button type="button" key={option} className={watch("source") === option ? "is-selected" : ""} onClick={() => { setValue("source", option, { shouldDirty: true }); setSourceOpen(false); }}>{option}</button>)}</div>}</div></div><LeadAssignmentSelect value={watch("assignedTo")} onChange={(assignedTo) => setValue("assignedTo", assignedTo, { shouldDirty: true })} /></div><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? <><LoaderCircle size={13} className="sign-in-spinner" /> Saving...</> : "Save lead"}</Button></div></motion.form>;
}

function LeadFilterSelect({ label, value, options, emptyLabel, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>{label}</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value || emptyLabel}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{["", ...options].map((option) => <button type="button" key={option || emptyLabel} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option || emptyLabel}</button>)}</div>}</div></div>;
}

// TITLE: LEAD TABLE
function createLeadColumns(onOpen) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("name", { header: "Lead", cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong><span>{row.original.email}</span></div> }), columnHelper.accessor("company", { header: "Company" }), columnHelper.accessor("team", { header: "Team size" }), columnHelper.accessor("assignedTo", { header: "Assigned to", cell: ({ getValue }) => getValue() || "Unassigned" }), columnHelper.accessor("stage", { header: "Lead stage", cell: ({ getValue }) => <StatusBadge tone={getValue() === "Converted" || getValue() === "Quotation Approved" ? "success" : getValue() === "Follow-up due" || getValue() === "Quote Sent" ? "accent" : "neutral"}>{getValue()}</StatusBadge> }), columnHelper.accessor("nextFollowUp", { header: "Next follow-up", cell: ({ getValue }) => formatLeadFollowUp(getValue()) }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <div className="lead-table-actions"><Link className="action-icon-btn" href={`/leads/${row.original.id}`} onClick={(event) => event.stopPropagation()} aria-label={`View journey for ${row.original.name}`} title="Journey"><History size={16} /></Link><button className="action-icon-btn" type="button" onClick={() => onOpen(row.original)} aria-label={`Open ${row.original.name}`} title={["Follow-up due", "Quote Sent"].includes(normalizeLeadStage(row.original.stage)) ? "Log follow-up" : "Open"}><Eye size={16} /></button></div> })];
}

// TITLE: LEAD DETAIL AND JOURNEY
function LeadDetail({ lead, onUpdate, onLogFollowUp }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const formApi = useForm({ resolver: zodResolver(leadDetailSchema), defaultValues: { followUp: lead.nextFollowUp && /^\d{4}-\d{2}-\d{2}/.test(lead.nextFollowUp) ? lead.nextFollowUp.slice(0, 10) : "", followUpTime: lead.nextFollowUp?.match(/ · (\d{2}:\d{2})$/)?.[1] || "", employee: lead.assignedTo || "" }, mode: "onBlur" });
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
  const save = (values) => onUpdate({ ...lead, nextFollowUp: hasPendingFollowUp ? lead.nextFollowUp : (values.followUp ? (values.followUpTime ? `${values.followUp} · ${values.followUpTime}` : values.followUp) : "Not scheduled"), assignedTo: values.employee });
  return <motion.form className="inline-form-card lead-create-form lead-detail-editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(save)}><div className="card-heading"><div><h2>{lead.name}</h2><p className="muted-copy">{lead.company} · {lead.email}</p></div></div><div className="ledger-summary"><div><span>Stage</span><strong>{lead.stage}</strong></div><div><span>Interactions</span><strong>{lead.journey.length}</strong></div></div><div className="inline-form-grid"><DateField label="Next follow-up date" min={today} disabled={hasPendingFollowUp || isTerminal} hint={error("followUp")} {...formApi.register("followUp")} /><TimeField label="Next follow-up time" min={watch("followUp") === today ? currentTime : undefined} disabled={hasPendingFollowUp || isTerminal} hint={error("followUpTime")} {...formApi.register("followUpTime")} /><SelectField label="Assigned employee" value={watch("employee")} hint={error("employee")} onChange={(event) => setValue("employee", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="Unassigned">Unassigned</option>{employees.map((option) => <option value={option} key={option}>{option}</option>)}</SelectField></div>{hasPendingFollowUp ? <p className="lead-form-info">A follow-up is already scheduled. Log it before scheduling another.</p> : null}{isTerminal ? <p className="lead-form-info">This lead is closed and cannot receive another follow-up.</p> : null}<div className="inline-form-actions">{!isTerminal ? <Button type="button" variant="ghost" onClick={onLogFollowUp}><CalendarClock size={15} /> Log follow-up</Button> : null}<Button type="submit" variant="brand" disabled={formState.isSubmitting}>Save lead update</Button></div></motion.form>;
}

// TITLE: LEADS PAGE
export default function LeadsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const initialLeads = [];
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" });
  const [appliedFilters, setAppliedFilters] = useState({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" });
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => { const saved = getDemoValue("leads"); if (Array.isArray(saved)) { const normalized = saved.map((lead, index) => ({ ...lead, stage: normalizeLeadStage(lead.stage, lead), journey: normalizeLeadJourney(lead, index) })); setLeads(normalized); saveDemoValue("leads", normalized); } const savedEmployees = getDemoValue("employees"); if (Array.isArray(savedEmployees)) setEmployees(savedEmployees.filter((employee) => employee.status !== "Disabled" && employee.name)); }, []);

  // TITLE: LEAD ACTIONS
  const persist = (nextLeads) => { setLeads(nextLeads); saveDemoValue("leads", nextLeads); };
  const openLead = (lead) => { const normalizedLead = { ...lead, stage: normalizeLeadStage(lead.stage, lead) }; if (["Follow-up due", "Quote Sent"].includes(normalizedLead.stage)) { setSelected(null); setFollowUpLead(normalizedLead); return; } setFollowUpLead(null); setSelected(normalizedLead); };
  const updateLead = (nextLead) => { const currentLead = leads.find((lead) => lead.id === nextLead.id); if (!currentLead) return; const normalizedCurrent = { ...currentLead, stage: normalizeLeadStage(currentLead.stage, currentLead) }; const isTerminal = ["Converted", "Not interested"].includes(normalizedCurrent.stage); const hasNewFollowUp = !isTerminal && nextLead.nextFollowUp && nextLead.nextFollowUp !== "Not scheduled" && nextLead.nextFollowUp !== currentLead.nextFollowUp; const updated = hasNewFollowUp ? transitionLead({ ...normalizedCurrent, assignedTo: nextLead.assignedTo }, { type: "follow-up-scheduled", nextFollowUp: nextLead.nextFollowUp }) : { ...normalizedCurrent, assignedTo: nextLead.assignedTo, nextFollowUp: isTerminal ? "Not scheduled" : nextLead.nextFollowUp, stage: normalizedCurrent.stage }; const next = leads.map((lead) => lead.id === updated.id ? updated : lead); persist(next); setSelected(null); showToast({ variant: "success", title: "Lead updated", message: `${updated.name}'s details were saved successfully.` }); };
  const saveFollowUp = ({ entry, outcome, nextFollowUpDate, nextFollowUpTime, nextFollowUp }) => { if (!followUpLead) return; const updated = transitionLead(followUpLead, { type: "follow-up-logged", outcome, nextFollowUpDate, nextFollowUpTime, nextFollowUp }); const next = leads.map((lead) => lead.id === updated.id ? { ...updated, journey: [entry, ...(Array.isArray(followUpLead.journey) ? followUpLead.journey : [])] } : lead); const savedLead = next.find((lead) => lead.id === updated.id); persist(next); setFollowUpLead(null); setSelected(null); showToast({ variant: "success", title: "Follow-up logged", message: `${savedLead.name}'s journey was updated successfully.` }); if (outcome === "Schedule a visit") { saveDemoValue("pendingVisitLeadId", updated.id); router.push("/visits"); } };
  const addLead = (lead) => { const nextLead = { ...lead, createdAt: lead.createdAt || new Date().toISOString().slice(0, 10), journey: [] }; persist([nextLead, ...leads]); setShowForm(false); showToast({ variant: "success", title: "Lead added", message: `${nextLead.name} was added to the pipeline.` }); };
  const applyFilters = () => { setAppliedFilters(filters); setShowFilters(false); showToast({ variant: "success", title: "Filters applied", message: "The lead pipeline was updated." }); };
  const discardFilterChanges = () => { setFilters(appliedFilters); setShowFilters(false); };
  const companies = [...new Set(leads.map((lead) => lead.company).filter(Boolean))];
  const stages = leadStages;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleLeads = leads.filter((lead) => {
    const searchable = `${lead.name} ${lead.email} ${lead.company} ${lead.team}`.toLowerCase();
    const createdAt = String(lead.createdAt || lead.createdDate || "");
    return (!normalizedQuery || searchable.includes(normalizedQuery)) && (!appliedFilters.stage || lead.stage === appliedFilters.stage) && (!appliedFilters.company || lead.company === appliedFilters.company) && (!appliedFilters.assignedTo || lead.assignedTo === appliedFilters.assignedTo) && (!appliedFilters.dateFrom || createdAt >= appliedFilters.dateFrom) && (!appliedFilters.dateTo || createdAt <= appliedFilters.dateTo);
  }).sort((a, b) => Number(b.stage === "Follow-up due") - Number(a.stage === "Follow-up due"));

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Leads</h1><p className="muted-copy">Keep every enquiry moving toward the right space.</p></div></div><div className="leads-toolbar"><div className="leads-search-wrap"><Search size={14} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search leads by name, email, company or team size" aria-label="Search leads" /></div><div className="leads-toolbar-actions"><Button variant="ghost" onClick={() => { setFilters(appliedFilters); setShowFilters(true); }}><SlidersHorizontal size={14} /> Filter</Button><Button onClick={() => setShowForm(true)}><CirclePlus size={16} /> Add lead</Button></div></div><section className="stat-grid module-stats leads-kpi-grid"><KpiCard icon={<UsersRound size={18} />} label="New leads" value={leads.filter((lead) => lead.stage === "New lead").length} detail="Stored in demo pipeline" /><KpiCard icon={<CalendarClock size={18} />} label="Follow-ups due" value={leads.filter((lead) => lead.stage === "Follow-up due").length} detail="Review next actions" /></section><div className="section-heading"><div><h2>Lead pipeline</h2></div></div><DataTable columns={createLeadColumns(openLead)} data={visibleLeads} onRowClick={openLead} /><Dialog open={showFilters} onClose={discardFilterChanges} ariaLabel="Filter leads"><div className="inline-form-card lead-filter-panel"><div className="card-heading"><div><h2>Filter leads</h2><p className="muted-copy">Filter the lead pipeline by stage, company or assigned employee.</p></div></div><div className="inline-form-grid"><LeadFilterSelect label="Lead stage" value={filters.stage} options={stages} emptyLabel="All stages" onChange={(stage) => setFilters((current) => ({ ...current, stage }))} /><LeadFilterSelect label="Company" value={filters.company} options={companies} emptyLabel="All companies" onChange={(company) => setFilters((current) => ({ ...current, company }))} /><LeadFilterSelect label="Assigned to" value={filters.assignedTo} options={employees.map((employee) => employee.name)} emptyLabel="All employees" onChange={(assignedTo) => setFilters((current) => ({ ...current, assignedTo }))} /><label className="settings-label">From date<Input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label><label className="settings-label">To date<Input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label></div><div className="inline-form-actions"><Button variant="ghost" onClick={() => setFilters({ stage: "", company: "", assignedTo: "", dateFrom: "", dateTo: "" })}>Clear</Button><Button onClick={applyFilters}>Apply filters</Button></div></div></Dialog><Dialog open={showForm} onClose={() => setShowForm(false)} ariaLabel="Add lead"><LeadForm onCancel={() => setShowForm(false)} onSave={addLead} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Lead details">{selected ? <LeadDetail lead={selected} onUpdate={updateLead} onLogFollowUp={() => setFollowUpLead(selected)} /> : null}</Dialog><Dialog open={Boolean(followUpLead)} onClose={() => setFollowUpLead(null)} ariaLabel="Log follow-up">{followUpLead ? <LeadFollowUpForm lead={followUpLead} onCancel={() => setFollowUpLead(null)} onSave={saveFollowUp} /> : null}</Dialog></motion.div></PageShell>;
}
