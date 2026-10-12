"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, DoorOpen, Grid2X2, Pencil, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getWorkspaceRecords, isAssignableWorkspace, workspaceTypes } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { z } from "zod";

const workspaceSchema = z.object({
  label: z.string().trim().min(1, "Enter a workspace name."),
  type: z.string().min(1, "Choose a workspace type."),
  capacity: z.string().refine((value) => value === "" || Number(value) >= 0, "Capacity cannot be negative.")
});

function WorkspaceTypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const options = workspaceTypes;
  return <div className="settings-label lead-source-field"><span>Workspace type</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{options.map((option) => <button type="button" key={option} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}</div></div>;
}

function WorkspaceFilterSelect({ label, value, options, emptyLabel, labels = {}, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>{label}</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{labels[value] || value || emptyLabel}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{["", ...options].map((option) => <button type="button" key={option || emptyLabel} className={value === option ? "is-selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>{labels[option] || option || emptyLabel}</button>)}</div>}</div></div>;
}

function WorkspaceForm({ workspace, workspaces, onCancel, onSave }) {
  const { showToast } = useToast();
  const formApi = useForm({ resolver: zodResolver(workspaceSchema), defaultValues: { label: workspace.label, type: workspace.type, capacity: String(workspace.capacity ?? "") }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const label = watch("label");
  const duplicateName = workspaces.some((item) => item.areaId !== workspace.areaId && item.label.trim().toLowerCase() === String(label || "").trim().toLowerCase());
  const onSubmit = (values) => {
    if (duplicateName) { const message = "Workspace names must be unique."; setError("label", { message }); showToast({ variant: "error", title: "Workspace was not saved", message }); return; }
    onSave({ ...workspace, ...values, label: values.label.trim(), capacity: values.capacity === "" ? "" : Number(values.capacity) });
  };
  const error = (field) => formState.errors[field]?.message;
  return <div className="inline-form-card"><div className="card-heading"><div><h2>Edit workspace</h2><p className="muted-copy">Update the details for this mapped floor-plan area.</p></div></div><form className="inline-form-grid" onSubmit={handleSubmit(onSubmit)}><label className="settings-label">Area name<Input className={error("label") ? "has-error" : ""} {...register("label")} aria-invalid={Boolean(error("label"))} />{error("label") && <span className="lead-form-error">{error("label")}</span>}</label><WorkspaceTypeSelect value={watch("type")} onChange={(value) => setValue("type", value, { shouldDirty: true })} /><label className="settings-label">Capacity<Input className={error("capacity") ? "has-error" : ""} type="number" min="0" {...register("capacity")} />{error("capacity") && <span className="lead-form-error">{error("capacity")}</span>}</label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={formState.isSubmitting}><Pencil size={15} /> Save changes</Button></div></form></div>;
}

export default function WorkspacesPage() {
  const { showToast } = useToast();
  const [workspaces, setWorkspaces] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: "", type: "" });

  useEffect(() => {
    setWorkspaces(getWorkspaceRecords());
  }, []);

  const updateWorkspace = (workspace) => {
    const previous = workspaces.find((item) => item.areaId === workspace.areaId);
    if (workspaces.some((item) => item.areaId !== workspace.areaId && item.label.trim().toLowerCase() === workspace.label.trim().toLowerCase())) {
      showToast({ variant: "error", title: "Workspace was not saved", message: "Workspace names must be unique. Choose a different name." });
      return;
    }
    const next = workspaces.map((item) => item.areaId === workspace.areaId ? workspace : item);
    setWorkspaces(next);
    saveDemoValue("workspaces", next);
    const savedMembers = getDemoValue("members");
    if (Array.isArray(savedMembers)) {
      const nextMembers = savedMembers.map((member) => member.spaceId === workspace.areaId || member.space === previous?.label ? { ...member, spaceId: workspace.areaId, space: workspace.label } : member);
      saveDemoValue("members", nextMembers);
    }
    setEditing(null);
    showToast({ variant: "success", title: "Workspace updated", message: `${workspace.label} was saved successfully.` });
  };

  const assignableWorkspaces = workspaces.filter(isAssignableWorkspace);
  const availableAssignable = assignableWorkspaces.filter((workspace) => workspace.status === "available").length;
  const visibleWorkspaces = [...assignableWorkspaces]
    .filter((workspace) => (!filters.status || workspace.status === filters.status) && (!filters.type || workspace.type === filters.type))
    .sort((a, b) => Number(b.status === "available") - Number(a.status === "available"));
  const statusOptions = ["available", "occupied"];
  const statusLabels = { available: "Available", occupied: "Occupied", reserved: "Reserved", maintenance: "Maintenance" };

  return <PageShell><motion.div className="module-content workspace-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Workspaces</h1><p className="muted-copy">Manage the mapped spaces used across the floor plan and member records.</p></div><Button variant="ghost" onClick={() => setShowFilters(true)}><SlidersHorizontal size={14} /> Filter</Button></div><section className="stat-grid module-stats workspace-stats"><KpiCard icon={<Grid2X2 size={18} />} label="Total workspaces" value={assignableWorkspaces.length} detail="Mapped offices and seats" /><KpiCard icon={<DoorOpen size={18} />} label="Available spaces" value={availableAssignable} detail="Ready for assignment" /></section><div className="section-heading"><div><h2>Workspace directory</h2><p className="muted-copy">Select Edit to update a mapped workspace. New areas are added through the floor-plan configuration.</p></div></div><section className="table-card workspace-directory-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Workspace</th><th>Type</th><th>Zone</th><th>Capacity</th><th>Occupant</th><th>Status</th><th>Action</th></tr></thead><tbody>{visibleWorkspaces.map((workspace) => <tr key={workspace.id}><td className="table-primary"><strong>{workspace.label}</strong></td><td>{workspace.type}</td><td>{workspace.zone}</td><td>{workspace.capacity ?? "—"}</td><td>{workspace.occupant || "Available"}</td><td><span className={`status-tag status-${workspace.status}`}>{statusLabels[workspace.status] || workspace.status}</span></td><td><button type="button" className="table-action" onClick={() => setEditing(workspace)}><Pencil size={14} /> Edit</button></td></tr>)}</tbody></table></div></section><Dialog open={showFilters} onClose={() => setShowFilters(false)} ariaLabel="Filter workspaces"><div className="inline-form-card lead-filter-panel"><div className="card-heading"><div><h2>Filter workspaces</h2><p className="muted-copy">Filter mapped spaces by availability or workspace type.</p></div></div><div className="inline-form-grid"><WorkspaceFilterSelect label="Status" value={filters.status} options={statusOptions} labels={statusLabels} emptyLabel="All statuses" onChange={(status) => setFilters((current) => ({ ...current, status }))} /><WorkspaceFilterSelect label="Workspace type" value={filters.type} options={[...new Set(assignableWorkspaces.map((workspace) => workspace.type))]} emptyLabel="All types" onChange={(type) => setFilters((current) => ({ ...current, type }))} /></div><div className="inline-form-actions"><Button variant="ghost" onClick={() => { setFilters({ status: "", type: "" }); setShowFilters(false); showToast({ variant: "success", title: "Workspace filters cleared", message: "All workspaces are visible again." }); }}>Clear</Button><Button onClick={() => { setShowFilters(false); showToast({ variant: "success", title: "Workspace filters applied", message: "The workspace directory was updated." }); }}>Apply filters</Button></div></div></Dialog><Dialog open={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Edit workspace">{editing ? <WorkspaceForm workspace={editing} workspaces={workspaces} onCancel={() => setEditing(null)} onSave={updateWorkspace} /> : null}</Dialog></motion.div></PageShell>;
}
