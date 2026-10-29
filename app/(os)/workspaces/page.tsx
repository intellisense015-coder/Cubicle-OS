"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, DoorOpen, Grid2X2, History, PlayCircle, RotateCcw, Settings2, SlidersHorizontal, Wrench, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { z } from "zod";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace, mergeWorkspaceRecords, workspaceTypes } from "@/lib/workspace-records";
import { createSupabaseWorkspaces, fetchSupabaseWorkspaces, mapSupabaseWorkspaceToOsWorkspace, updateSupabaseWorkspace } from "@/lib/supabase/workspaces";
import { fetchSupabaseMaintenanceCategories, mapSupabaseMaintenanceCategoryToOsCategory } from "@/lib/supabase/maintenance-categories";
import { createSupabaseMaintenanceEvent, createSupabaseMaintenanceRecord, fetchSupabaseMaintenanceEvents, fetchSupabaseMaintenanceRecords, mapSupabaseMaintenanceEventToOsEvent, mapSupabaseMaintenanceRecordToOsRecord, updateSupabaseMaintenanceRecord } from "@/lib/supabase/maintenance";
import { useToast } from "@/components/ui/toast-provider";
import { getMaintenanceCategories, getActiveMaintenanceRecord, getMaintenanceHistory, getMaintenanceTimeline, getMaintenanceEvents, getMaintenanceRecords, MAINTENANCE_RECORD_STATUS_LABELS, MAINTENANCE_SEVERITY_LABELS, OPERATIONAL_STATUS_LABELS, reportMaintenance, resolveMaintenance, startMaintenance, cancelMaintenance, type MaintenanceCategory, type MaintenanceRecord, type MaintenanceSeverity, type WorkspaceOperationalStatus } from "@/lib/maintenance";
import { numericField, numericString } from "@/lib/number-input";
import { useHasPermission, useMaintenancePermissions } from "@/lib/access-control";

const workspaceConfigSchema = z.object({
  label: z.string().trim().min(1, "Enter a workspace name.").max(80, "Workspace names must be 80 characters or fewer."),
  type: z.string().min(1, "Choose a workspace type."),
  capacity: z.string().refine((value) => value === "" || /^\d+$/.test(value), "Capacity must be a whole number.").refine((value) => value === "" || Number(value) >= 0, "Capacity cannot be negative."),
});

const maintenanceReportSchema = z.object({
  category: z.string().trim().min(1, "Choose an issue category."),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string().trim().min(1, "Enter an issue title.").max(120, "Issue titles must be 120 characters or fewer."),
  description: z.string().trim().min(1, "Describe the issue.").max(1000, "Descriptions must be 1,000 characters or fewer."),
});

const resolutionSchema = z.object({
  resolutionSummary: z.string().trim().min(1, "Describe what was fixed.").max(1000, "Resolution summaries must be 1,000 characters or fewer."),
  partsUsed: z.string().max(500, "Parts details must be 500 characters or fewer.").optional(),
  resolutionNotes: z.string().max(1000, "Resolution notes must be 1,000 characters or fewer.").optional(),
  verifiedReadyForUse: z.boolean().refine(Boolean, "Confirm that the workspace is ready for use."),
});

const cancellationSchema = z.object({
  cancellationReason: z.string().trim().min(1, "Explain why this report is being withdrawn.").max(500, "Cancellation reasons must be 500 characters or fewer."),
});

function WorkspaceTypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>Workspace type</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{workspaceTypes.map((option) => <button type="button" key={option} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div></div>;
}

function WorkspaceFilterSelect({ label, value, options, emptyLabel, labels = {}, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>{label}</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{labels[value] || value || emptyLabel}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{["", ...options].map((option) => <button type="button" key={option || emptyLabel} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{labels[option] || option || emptyLabel}</button>)}</div>}</div></div>;
}

function FieldError({ error }) {
  return error ? <span className="lead-form-error">{String(error)}</span> : null;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function displayActor(value?: string, fallback = "Demo user") {
  return value || fallback;
}

function operationalStatus(workspace: any): WorkspaceOperationalStatus {
  return workspace.operationalStatus || "ACTIVE";
}

function WorkspaceConfigForm({ workspace, workspaces, onCancel, onSave }) {
  const { showToast } = useToast();
  const formApi = useForm({ resolver: zodResolver(workspaceConfigSchema), defaultValues: { label: workspace.label, type: workspace.type, capacity: numericString(workspace.capacity, "") }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const label = watch("label");
  const duplicateName = workspaces.some((item) => item.areaId !== workspace.areaId && item.label.trim().toLowerCase() === String(label || "").trim().toLowerCase());
  const submit = (values) => {
    if (duplicateName) {
      const message = "Workspace names must be unique.";
      setError("label", { message });
      showToast({ variant: "error", title: "Workspace was not saved", message });
      return;
    }
    onSave({ ...workspace, ...values, label: values.label.trim(), capacity: values.capacity === "" ? "" : Number(values.capacity) });
  };
  const error = (field) => formState.errors[field]?.message;
  return <div className="inline-form-card"><div className="card-heading"><div><span className="seat-details-label">Workspace setup</span><h2>Workspace configuration</h2><p className="muted-copy">Update the mapped area without changing its operational maintenance state.</p></div><Settings2 size={21} /></div><form className="inline-form-grid" onSubmit={handleSubmit(submit)}><label className="settings-label">Workspace name<Input className={error("label") ? "has-error" : ""} {...register("label")} aria-invalid={Boolean(error("label"))} />{error("label") && <FieldError error={error("label")} />}</label><WorkspaceTypeSelect value={watch("type")} onChange={(value) => setValue("type", value, { shouldDirty: true })} /><label className="settings-label">Capacity<Input className={error("capacity") ? "has-error" : ""} type="text" {...numericField(register, "capacity", true)} />{error("capacity") && <FieldError error={error("capacity")} />}</label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Settings2 size={15} /> Save configuration</Button></div></form></div>;
}

function ReportMaintenanceForm({ workspace, categories, onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(maintenanceReportSchema), defaultValues: { category: categories.find((category) => category.active)?.name || "", severity: "MEDIUM", title: "", description: "" }, mode: "onBlur" });
  const { register, handleSubmit, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  return <div className="inline-form-card maintenance-action-form"><div className="card-heading"><div><span className="seat-details-label">Maintenance</span><h2>Report Maintenance Issue</h2><p className="muted-copy">Flag this workspace so it is temporarily unavailable until the issue is resolved.</p></div><Wrench size={21} /></div><div className="maintenance-workspace-summary"><span>Workspace</span><strong>{workspace.label}</strong><small>{workspace.type} · {workspace.zone} · Capacity {workspace.capacity ?? "—"}</small></div><form className="inline-form-grid" onSubmit={handleSubmit(async (values) => onSave(values))}><label className="settings-label">Issue category<select className="text-input floating-input" {...register("category")}><option value="">Choose a category</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select>{error("category") && <FieldError error={error("category")} />}</label><label className="settings-label">Severity<select className="text-input floating-input" {...register("severity")}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>{error("severity") && <FieldError error={error("severity")} />}</label><label className="settings-label">Issue title<Input className={error("title") ? "has-error" : ""} {...register("title")} placeholder="e.g. Air conditioner not cooling" />{error("title") && <FieldError error={error("title")} />}</label><label className="settings-label maintenance-textarea-field">Detailed description<textarea className={`text-input textarea-input${error("description") ? " has-error" : ""}`} {...register("description")} placeholder="Describe what the team observed and when it started." />{error("description") && <FieldError error={error("description")} />}</label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" loading={formState.isSubmitting}><Wrench size={15} /> Log &amp; Flag Workspace</Button></div></form></div>;
}

function ResolutionForm({ maintenance, onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(resolutionSchema), defaultValues: { resolutionSummary: "", partsUsed: "", resolutionNotes: "", verifiedReadyForUse: false }, mode: "onChange" });
  const { register, handleSubmit, watch, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  const verified = watch("verifiedReadyForUse");
  return <div className="inline-form-card maintenance-action-form"><div className="card-heading"><div><span className="seat-details-label">Maintenance resolution</span><h2>Restore Workspace</h2><p className="muted-copy">Document the repair and confirm the workspace is ready for use.</p></div><RotateCcw size={21} /></div><div className="maintenance-issue-summary"><strong>{maintenance.title}</strong><span>{maintenance.category} · {MAINTENANCE_SEVERITY_LABELS[maintenance.severity]} · Reported {formatDate(maintenance.reportedAt)}</span><p>{maintenance.description}</p></div><form className="inline-form-grid" onSubmit={handleSubmit(async (values) => onSave(values))}><label className="settings-label maintenance-textarea-field">What was fixed?<textarea className={`text-input textarea-input${error("resolutionSummary") ? " has-error" : ""}`} {...register("resolutionSummary")} placeholder="Summarize the repair or corrective action." />{error("resolutionSummary") && <FieldError error={error("resolutionSummary")} />}</label><label className="settings-label">Parts/materials used<input className="text-input floating-input" {...register("partsUsed")} placeholder="Optional" />{error("partsUsed") && <FieldError error={error("partsUsed")} />}</label><label className="settings-label maintenance-textarea-field">Resolution notes<textarea className="text-input textarea-input" {...register("resolutionNotes")} placeholder="Optional verification or handover notes." />{error("resolutionNotes") && <FieldError error={error("resolutionNotes")} />}</label><label className={`maintenance-ready-check${verified ? " is-checked" : ""}`}><input type="checkbox" {...register("verifiedReadyForUse")} /><span><strong>Workspace is ready for use</strong><small>Required before the workspace returns to Active.</small></span></label>{error("verifiedReadyForUse") && <FieldError error={error("verifiedReadyForUse")} />}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!formState.isValid || !verified} loading={formState.isSubmitting}><CheckCircle2 size={15} /> Issue fixed</Button></div></form></div>;
}

function CancellationForm({ maintenance, onCancel, onSave }) {
  const formApi = useForm({ resolver: zodResolver(cancellationSchema), defaultValues: { cancellationReason: "" }, mode: "onChange" });
  const { register, handleSubmit, formState } = formApi;
  const error = (field) => formState.errors[field]?.message;
  return <div className="inline-form-card maintenance-action-form"><div className="card-heading"><div><span className="seat-details-label">Maintenance report</span><h2>Withdraw report</h2><p className="muted-copy">Use this when the report was logged by mistake. A reason is required and will remain in the maintenance history.</p></div><XCircle size={21} /></div><div className="maintenance-issue-summary"><strong>{maintenance.title}</strong><span>{maintenance.category} · {MAINTENANCE_SEVERITY_LABELS[maintenance.severity]}</span><p>{maintenance.description}</p></div><form className="inline-form-grid" onSubmit={handleSubmit(async (values) => onSave(values))}><label className="settings-label maintenance-textarea-field">Why is this report being withdrawn?<textarea className={`text-input textarea-input${error("cancellationReason") ? " has-error" : ""}`} {...register("cancellationReason")} placeholder="For example: duplicate report or issue was logged against the wrong workspace." />{error("cancellationReason") && <FieldError error={error("cancellationReason")} />}</label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Keep report</Button><Button type="submit" variant="soft" disabled={!formState.isValid || formState.isSubmitting} loading={formState.isSubmitting}><XCircle size={15} /> Withdraw report</Button></div></form></div>;
}

function MaintenanceDetail({ workspace, activeMaintenance, history, timeline, permissions, onStart, onResolve, onCancelReport, onClose }) {
  const status = activeMaintenance?.status || "RESOLVED";
  const statusLabel = activeMaintenance ? MAINTENANCE_RECORD_STATUS_LABELS[activeMaintenance.status] : "History";
  const previousHistory = history.filter((record) => record.id !== activeMaintenance?.id);
  const historySection = previousHistory.length ? <section className="maintenance-history-list"><h3>Previous maintenance</h3>{previousHistory.map((record) => <article className="maintenance-history-row" key={record.id}><div><strong>{record.title}</strong><span>{record.category} · {MAINTENANCE_SEVERITY_LABELS[record.severity]}</span>{record.cancellationReason ? <small>Reason: {record.cancellationReason}</small> : null}</div><span className="maintenance-history-status">{MAINTENANCE_RECORD_STATUS_LABELS[record.status]}</span></article>)}</section> : null;
  return <div className="inline-form-card maintenance-detail-card"><div className="card-heading"><div><span className="seat-details-label">Maintenance history</span><h2>{workspace.label}</h2><p className="muted-copy">{workspace.type} · {workspace.zone} · Capacity {workspace.capacity ?? "—"}</p></div><History size={21} /></div>{activeMaintenance ? <><div className={`maintenance-detail-status maintenance-detail-status-${status.toLowerCase()}`}><span className="maintenance-status-dot" />{OPERATIONAL_STATUS_LABELS[operationalStatus(workspace)]} · {statusLabel}</div><section className="maintenance-issue-summary"><div className="maintenance-issue-heading"><div><span>Active maintenance issue</span><strong>{activeMaintenance.title}</strong></div><span className={`maintenance-severity maintenance-severity-${activeMaintenance.severity.toLowerCase()}`}>{MAINTENANCE_SEVERITY_LABELS[activeMaintenance.severity]}</span></div><dl className="maintenance-detail-grid"><div><dt>Category</dt><dd>{activeMaintenance.category}</dd></div><div><dt>Reported by</dt><dd>{displayActor(activeMaintenance.reportedById)}</dd></div><div><dt>Reported on</dt><dd>{formatDate(activeMaintenance.reportedAt)}</dd></div><div><dt>Assigned to</dt><dd>{displayActor(activeMaintenance.assignedToId, "Not assigned")}</dd></div></dl><p>{activeMaintenance.description}</p></section><section className="maintenance-timeline"><h3>Maintenance timeline</h3>{timeline.length ? timeline.map((event) => <div className="maintenance-timeline-row" key={event.id}><span className="maintenance-timeline-marker" /><div><strong>{event.action}</strong><span>{formatDate(event.createdAt)} · {displayActor(event.actorId)}</span>{event.notes ? <small>{event.notes}</small> : null}</div></div>) : <p className="muted-copy">No timeline events recorded yet.</p>}</section>{historySection}</> : <section className="maintenance-history-list"><h3>Previous maintenance</h3>{history.length ? history.map((record) => <article className="maintenance-history-row" key={record.id}><div><strong>{record.title}</strong><span>{record.category} · {MAINTENANCE_SEVERITY_LABELS[record.severity]}</span>{record.cancellationReason ? <small>Reason: {record.cancellationReason}</small> : null}</div><span className="maintenance-history-status">{MAINTENANCE_RECORD_STATUS_LABELS[record.status]}</span></article>) : <p className="muted-copy">No maintenance history for this workspace.</p>}</section>}<div className="inline-form-actions maintenance-detail-actions"><Button type="button" variant="ghost" onClick={onClose}>Close</Button>{activeMaintenance?.status === "OPEN" && permissions.canStart ? <Button onClick={onStart}><PlayCircle size={15} /> Continue Maintenance</Button> : null}{activeMaintenance && permissions.canResolve ? <Button onClick={onResolve}><CheckCircle2 size={15} /> Issue fixed</Button> : null}{activeMaintenance && permissions.canCancel ? <Button type="button" variant="ghost" onClick={onCancelReport}><XCircle size={15} /> Report was a mistake</Button> : null}</div></div>;
}

export default function WorkspacesPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const canEdit = useHasPermission("workspaces.write");
  const permissions = useMaintenancePermissions();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [configuring, setConfiguring] = useState<any>(null);
  const [reportingWorkspace, setReportingWorkspace] = useState<any>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const [resolvingMaintenance, setResolvingMaintenance] = useState<MaintenanceRecord | null>(null);
  const [cancellingMaintenance, setCancellingMaintenance] = useState<MaintenanceRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: "", type: "" });
  const [maintenanceCategories, setMaintenanceCategories] = useState<MaintenanceCategory[]>(() => getMaintenanceCategories());

  const refresh = async () => {
    const localRecords = getWorkspaceRecords();
    try {
      const rows = await fetchSupabaseWorkspaces();
      const existingIds = new Set(rows.map((row) => row.id));
      const missingRecords = localRecords.filter((record) => !existingIds.has(String(record.areaId || record.id)));
      const seededRows = await createSupabaseWorkspaces(missingRecords);
      const remoteRecords = [...rows, ...seededRows].map(mapSupabaseWorkspaceToOsWorkspace);
      const nextWorkspaces = mergeWorkspaceRecords(remoteRecords);
      setWorkspaces(nextWorkspaces);
      saveDemoValue("workspaces", nextWorkspaces, { notify: false });
    } catch (error) {
      setWorkspaces([]);
      showToast({ variant: "error", title: "Workspaces could not be loaded", message: error?.message || "Supabase did not return the workspace records." });
    }
    try {
      const categoryRows = await fetchSupabaseMaintenanceCategories();
      const remoteCategories = categoryRows.map(mapSupabaseMaintenanceCategoryToOsCategory);
      setMaintenanceCategories(remoteCategories);
      saveDemoValue("maintenanceCategories", remoteCategories, { notify: false });
    } catch (error) {
      setMaintenanceCategories(getMaintenanceCategories());
      showToast({ variant: "error", title: "Maintenance categories could not be loaded", message: error?.message || "Supabase did not return the maintenance categories." });
    }
    try {
      const [recordRows, eventRows] = await Promise.all([fetchSupabaseMaintenanceRecords(), fetchSupabaseMaintenanceEvents()]);
      const remoteRecords = recordRows.map(mapSupabaseMaintenanceRecordToOsRecord);
      const remoteEvents = eventRows.map(mapSupabaseMaintenanceEventToOsEvent);
      setMaintenanceRecords(remoteRecords);
      saveDemoValue("maintenanceRecords", remoteRecords, { notify: false });
      saveDemoValue("maintenanceEvents", remoteEvents, { notify: false });
    } catch (error) {
      const savedRecords = getDemoValue("maintenanceRecords");
      setMaintenanceRecords(Array.isArray(savedRecords) ? savedRecords : []);
      showToast({ variant: "error", title: "Maintenance records could not be loaded", message: error?.message || "Supabase did not return maintenance records." });
    }
  };

  useEffect(() => {
    void refresh();
    const handleDemoChange = (event) => {
      if (["maintenance", "maintenanceRecords", "maintenanceEvents", "workspaces", "maintenanceCategories", "members", "employees"].includes(event.detail?.key || "")) void refresh();
    };
    window.addEventListener("cubicle-demo-change", handleDemoChange);
    return () => window.removeEventListener("cubicle-demo-change", handleDemoChange);
  }, [showToast]);

  useEffect(() => {
    const workspaceId = searchParams.get("workspaceId");
    if (workspaceId && workspaces.length) {
      const target = workspaces.find((workspace) => workspace.areaId === workspaceId || workspace.id === workspaceId);
      if (target) setSelectedWorkspace(target);
    }
  }, [searchParams, workspaces]);

  const openMaintenance = (workspace) => setSelectedWorkspace(workspace);
  const activeRecordFor = (workspace) => getActiveMaintenanceRecord(String(workspace.areaId || workspace.id), maintenanceRecords);
  const refreshAndSelect = (workspaceId: string) => {
    const nextWorkspaces = getWorkspaceRecords();
    const nextRecords = getDemoValue("maintenanceRecords");
    setWorkspaces(nextWorkspaces);
    setMaintenanceRecords(Array.isArray(nextRecords) ? nextRecords : []);
    const nextWorkspace = nextWorkspaces.find((item) => String(item.areaId || item.id) === String(workspaceId));
    if (nextWorkspace) setSelectedWorkspace(nextWorkspace);
    return nextWorkspace;
  };

  const updateWorkspace = async (workspace) => {
    if (!canEdit) { showToast({ variant: "error", title: "Admin access required", message: "Only an administrator can configure workspace details." }); return; }
    const previous = workspaces.find((item) => item.areaId === workspace.areaId);
    if (workspaces.some((item) => item.areaId !== workspace.areaId && item.label.trim().toLowerCase() === workspace.label.trim().toLowerCase())) {
      showToast({ variant: "error", title: "Workspace was not saved", message: "Workspace names must be unique. Choose a different name." });
      return;
    }
    try {
      const row = await updateSupabaseWorkspace(workspace.areaId, workspace);
      const persistedWorkspace = { ...workspace, ...mapSupabaseWorkspaceToOsWorkspace(row), id: row.id, areaId: row.id };
      const next = workspaces.map((item) => item.areaId === workspace.areaId ? persistedWorkspace : item);
      setWorkspaces(next);
      saveDemoValue("workspaces", next);
      const savedMembers = getDemoValue("members");
      if (Array.isArray(savedMembers)) saveDemoValue("members", savedMembers.map((member) => member.spaceId === workspace.areaId || member.space === previous?.label ? { ...member, spaceId: workspace.areaId, space: workspace.label } : member));
      setConfiguring(null);
      showToast({ variant: "success", title: "Workspace configuration updated", message: `${workspace.label} was saved to Supabase.` });
    } catch (error) {
      showToast({ variant: "error", title: "Workspace was not saved", message: error?.message || "Supabase could not save this workspace." });
    }
  };

  const submitReport = async (values) => {
    if (!reportingWorkspace) return;
    try {
      const result = reportMaintenance(reportingWorkspace.areaId || reportingWorkspace.id, values);
      const remoteRecord = await createSupabaseMaintenanceRecord(result.maintenance);
      const remoteEvent = await createSupabaseMaintenanceEvent(result.event, remoteRecord.id);
      await updateSupabaseWorkspace(reportingWorkspace.areaId || reportingWorkspace.id, { ...result.workspace, activeMaintenanceId: remoteRecord.id });
      const persistedRecord = mapSupabaseMaintenanceRecordToOsRecord(remoteRecord);
      const persistedEvent = mapSupabaseMaintenanceEventToOsEvent(remoteEvent);
      const localRecords = getMaintenanceRecords().map((record) => record.id === result.maintenance.id ? persistedRecord : record);
      const localEvents = [persistedEvent, ...getMaintenanceEvents().filter((event) => event.id !== result.event.id)];
      const localWorkspaces = getWorkspaceRecords().map((workspace) => workspace.areaId === reportingWorkspace.areaId ? { ...workspace, ...result.workspace, activeMaintenanceId: remoteRecord.id } : workspace);
      saveDemoValue("maintenanceRecords", localRecords, { notify: false });
      saveDemoValue("maintenanceEvents", localEvents, { notify: false });
      saveDemoValue("workspaces", localWorkspaces, { notify: false });
      setMaintenanceRecords(localRecords);
      setReportingWorkspace(null);
      const updated = refreshAndSelect(reportingWorkspace.areaId || reportingWorkspace.id);
      if (result.existing) {
        showToast({ variant: "info", title: "Active maintenance already exists", message: `${reportingWorkspace.label} already has an active maintenance issue.` });
      } else {
        showToast({ variant: "success", title: "Maintenance successfully logged", message: `${reportingWorkspace.label} is now under maintenance.` });
      }
      if (updated) setSelectedWorkspace(updated);
    } catch (error) {
      showToast({ variant: "error", title: "Maintenance was not logged", message: error?.message || "Unable to save this maintenance issue." });
      throw error;
    }
  };

  const beginMaintenance = async () => {
    const record = selectedWorkspace && activeRecordFor(selectedWorkspace);
    if (!record) return;
    try {
      const result = startMaintenance(record.id);
      if (result.event) {
        const remoteRecord = await updateSupabaseMaintenanceRecord(result.maintenance.id, result.maintenance);
        await createSupabaseMaintenanceEvent(result.event, remoteRecord.id);
      }
      refreshAndSelect(selectedWorkspace.areaId || selectedWorkspace.id);
      showToast({ variant: "success", title: "Maintenance started", message: `${selectedWorkspace.label} is now in progress.` });
    } catch (error) { showToast({ variant: "error", title: "Maintenance could not start", message: error?.message || "Unable to start this issue." }); }
  };

  const submitResolution = async (values) => {
    if (!resolvingMaintenance || !selectedWorkspace) return;
    try {
      const result = resolveMaintenance(resolvingMaintenance.id, values);
      const remoteRecord = await updateSupabaseMaintenanceRecord(result.maintenance.id, result.maintenance);
      if (result.event) await createSupabaseMaintenanceEvent(result.event, remoteRecord.id);
      if (result.workspace) await updateSupabaseWorkspace(result.workspace.areaId || result.workspace.id, result.workspace);
      const workspaceName = selectedWorkspace.label;
      setResolvingMaintenance(null);
      refreshAndSelect(selectedWorkspace.areaId || selectedWorkspace.id);
      showToast({ variant: "success", title: "Workspace restored successfully", message: `${workspaceName} has been restored and is available again.` });
    } catch (error) {
      showToast({ variant: "error", title: "Workspace was not restored", message: error?.message || "Unable to resolve this maintenance issue." });
      throw error;
    }
  };

  const submitCancellation = async (values) => {
    if (!cancellingMaintenance || !selectedWorkspace) return;
    try {
      const result = cancelMaintenance(cancellingMaintenance.id, values.cancellationReason);
      const remoteRecord = await updateSupabaseMaintenanceRecord(result.maintenance.id, result.maintenance);
      if (result.event) await createSupabaseMaintenanceEvent(result.event, remoteRecord.id);
      if (result.workspace) await updateSupabaseWorkspace(result.workspace.areaId || result.workspace.id, result.workspace);
      const workspaceName = selectedWorkspace.label;
      setCancellingMaintenance(null);
      refreshAndSelect(selectedWorkspace.areaId || selectedWorkspace.id);
      showToast({ variant: "info", title: "Maintenance report withdrawn", message: `${workspaceName} is active again. The reason was saved in its history.` });
    } catch (error) {
      showToast({ variant: "error", title: "Report could not be withdrawn", message: error?.message || "Unable to withdraw this report." });
      throw error;
    }
  };

  const openCancellation = () => {
    const record = selectedWorkspace && activeRecordFor(selectedWorkspace);
    if (record) setCancellingMaintenance(record);
  };

  const assignableWorkspaces = workspaces.filter(isAssignableWorkspace);
  const availableAssignable = assignableWorkspaces.filter((workspace) => operationalStatus(workspace) === "ACTIVE" && workspace.status === "available").length;
  const underMaintenance = assignableWorkspaces.filter((workspace) => operationalStatus(workspace) === "UNDER_MAINTENANCE").length;
  const outOfService = assignableWorkspaces.filter((workspace) => operationalStatus(workspace) === "OUT_OF_SERVICE").length;
  const visibleWorkspaces = [...assignableWorkspaces]
    .filter((workspace) => (!filters.status || operationalStatus(workspace) === filters.status) && (!filters.type || workspace.type === filters.type))
    .sort((a, b) => Number(operationalStatus(a) === "ACTIVE") - Number(operationalStatus(b) === "ACTIVE"));
  const statusOptions: WorkspaceOperationalStatus[] = ["ACTIVE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"];
  const statusLabels = OPERATIONAL_STATUS_LABELS;
  const selectedRecord = selectedWorkspace ? activeRecordFor(selectedWorkspace) : null;
  const selectedHistory = selectedWorkspace ? getMaintenanceHistory(String(selectedWorkspace.areaId || selectedWorkspace.id), maintenanceRecords) : [];
  const selectedTimeline = selectedRecord ? getMaintenanceTimeline(selectedRecord.id) : [];

  return <PageShell><motion.div className="module-content workspace-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Workspaces</h1><p className="muted-copy">Manage mapped spaces and move maintenance issues from report to restoration.</p></div><Button variant="ghost" onClick={() => setShowFilters(true)}><SlidersHorizontal size={14} /> Filter</Button></div><section className="stat-grid module-stats workspace-stats workspace-lifecycle-stats"><KpiCard icon={<Grid2X2 size={18} />} label="Total workspaces" value={assignableWorkspaces.length} detail="Mapped offices and seats" /><KpiCard icon={<DoorOpen size={18} />} label="Available spaces" value={availableAssignable} detail="Active and ready for assignment" /><KpiCard icon={<Clock3 size={18} />} label="Under maintenance" value={underMaintenance} detail="Active issues in progress" /><KpiCard icon={<AlertTriangle size={18} />} label="Out of service" value={outOfService} detail="Unavailable for assignment" /></section><div className="section-heading"><div><h2>Workspace directory</h2><p className="muted-copy">Operational state is controlled by maintenance actions. Workspace configuration is separate.</p></div></div><section className="table-card workspace-directory-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Workspace</th><th>Type</th><th>Zone</th><th>Capacity</th><th>Occupant</th><th>Status</th><th>Maintenance</th><th>Action</th></tr></thead><tbody>{visibleWorkspaces.map((workspace) => { const currentStatus = operationalStatus(workspace); const activeMaintenance = activeRecordFor(workspace); const actionLabel = currentStatus === "ACTIVE" ? "Report Issue" : "View Maintenance"; return <tr key={workspace.id}><td className="table-primary"><strong>{workspace.label}</strong></td><td>{workspace.type}</td><td>{workspace.zone}</td><td>{workspace.capacity ?? "—"}</td><td>{workspace.occupant || "Available"}</td><td><span className={`status-tag workspace-operational-status status-${currentStatus.toLowerCase().replaceAll("_", "-")}`}>{currentStatus === "ACTIVE" ? <CheckCircle2 size={13} /> : currentStatus === "UNDER_MAINTENANCE" ? <Wrench size={13} /> : <AlertTriangle size={13} />}{OPERATIONAL_STATUS_LABELS[currentStatus]}</span></td><td>{activeMaintenance ? <button type="button" className={`maintenance-badge maintenance-record-${activeMaintenance.status.toLowerCase()}`} onClick={() => openMaintenance(workspace)}><strong>{activeMaintenance.title}</strong><small>{activeMaintenance.category} · {MAINTENANCE_SEVERITY_LABELS[activeMaintenance.severity]}</small></button> : <span className="muted-copy">No active issue</span>}</td><td><div className="workspace-action-stack">{(currentStatus === "ACTIVE" ? permissions.canReport : true) ? <button type="button" className={`table-action workspace-maintenance-action workspace-maintenance-action-${currentStatus.toLowerCase().replaceAll("_", "-")}`} onClick={() => currentStatus === "ACTIVE" ? setReportingWorkspace(workspace) : openMaintenance(workspace)}>{currentStatus === "ACTIVE" ? <Wrench size={14} /> : <History size={14} />}{actionLabel}</button> : <span className="read-only-label">View only</span>}{canEdit ? <button type="button" className="table-action workspace-configure-action" onClick={() => setConfiguring(workspace)}><Settings2 size={14} /> Configure</button> : null}</div></td></tr>; })}</tbody></table></div></section><Dialog open={showFilters} onClose={() => setShowFilters(false)} ariaLabel="Filter workspaces"><div className="inline-form-card lead-filter-panel"><div className="card-heading"><div><h2>Filter workspaces</h2><p className="muted-copy">Filter mapped spaces by operational state or workspace type.</p></div></div><div className="inline-form-grid"><WorkspaceFilterSelect label="Status" value={filters.status} options={statusOptions} labels={statusLabels} emptyLabel="All statuses" onChange={(status) => setFilters((current) => ({ ...current, status }))} /><WorkspaceFilterSelect label="Workspace type" value={filters.type} options={[...new Set(assignableWorkspaces.map((workspace) => workspace.type))]} emptyLabel="All types" onChange={(type) => setFilters((current) => ({ ...current, type }))} /></div><div className="inline-form-actions"><Button variant="ghost" onClick={() => { setFilters({ status: "", type: "" }); setShowFilters(false); showToast({ variant: "success", title: "Workspace filters cleared", message: "All workspaces are visible again." }); }}>Clear</Button><Button onClick={() => { setShowFilters(false); showToast({ variant: "success", title: "Workspace filters applied", message: "The workspace directory was updated." }); }}>Apply</Button></div></div></Dialog><Dialog open={Boolean(configuring)} onClose={() => setConfiguring(null)} ariaLabel="Workspace configuration">{configuring ? <WorkspaceConfigForm workspace={configuring} workspaces={workspaces} onCancel={() => setConfiguring(null)} onSave={updateWorkspace} /> : null}</Dialog><Dialog open={Boolean(reportingWorkspace)} onClose={() => setReportingWorkspace(null)} ariaLabel="Report maintenance issue">{reportingWorkspace ? <ReportMaintenanceForm workspace={reportingWorkspace} categories={maintenanceCategories} onCancel={() => setReportingWorkspace(null)} onSave={submitReport} /> : null}</Dialog><Dialog open={Boolean(selectedWorkspace)} onClose={() => setSelectedWorkspace(null)} ariaLabel="Maintenance detail">{selectedWorkspace ? <MaintenanceDetail workspace={selectedWorkspace} activeMaintenance={selectedRecord} history={selectedHistory} timeline={selectedTimeline} permissions={permissions} onStart={beginMaintenance} onResolve={() => selectedRecord && setResolvingMaintenance(selectedRecord)} onCancelReport={openCancellation} onClose={() => setSelectedWorkspace(null)} /> : null}</Dialog><Dialog open={Boolean(resolvingMaintenance)} onClose={() => setResolvingMaintenance(null)} ariaLabel="Restore workspace">{resolvingMaintenance ? <ResolutionForm maintenance={resolvingMaintenance} onCancel={() => setResolvingMaintenance(null)} onSave={submitResolution} /> : null}</Dialog><Dialog open={Boolean(cancellingMaintenance)} onClose={() => setCancellingMaintenance(null)} ariaLabel="Withdraw maintenance report">{cancellingMaintenance ? <CancellationForm maintenance={cancellingMaintenance} onCancel={() => setCancellingMaintenance(null)} onSave={submitCancellation} /> : null}</Dialog></motion.div></PageShell>;
}
