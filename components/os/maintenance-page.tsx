"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { AlertTriangle, Check, ClipboardList, Pencil, Plus, Power, Settings2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { TablePagination } from "@/components/ui/table";
import { getMaintenanceCategories, getMaintenanceRecords, isActiveMaintenanceRecord, MAINTENANCE_RECORD_STATUS_LABELS, MAINTENANCE_SEVERITY_LABELS, saveMaintenanceCategories, type MaintenanceCategory, type MaintenanceRecord } from "@/lib/maintenance";
import { useHasPermission } from "@/lib/access-control";
import { useToast } from "@/components/ui/toast-provider";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { createSupabaseMaintenanceCategory, mapSupabaseMaintenanceCategoryToOsCategory, updateSupabaseMaintenanceCategory } from "@/lib/supabase/maintenance-categories";
import { getWorkspaceRecords } from "@/lib/workspace-records";
import { queryKeys } from "@/lib/query-keys";
import { fetchMaintenanceCategoriesSnapshot, fetchMaintenanceRecordsSnapshot, type MaintenanceCategoriesQuerySnapshot } from "@/lib/maintenance-query";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { WorkspaceBadge } from "@/components/ui/workspace-badge";

type MaintenanceView = "overview" | "requests" | "categories";

function formatMaintenanceDate(value: string | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(",", "");
}

function workspaceLabel(workspace: any, workspaceId: string) {
  return workspace?.label || workspace?.name || workspaceId || "Unknown workspace";
}

function MaintenanceCategoryCards({ categories, canEditCategories, categorySaving, editingId, draftName, draftSubtitle, pageTitle, pageDescription, dataSource, onOpenCategory, onCloseCategory, onSaveCategory, onToggleCategory, onNameChange, onSubtitleChange }: { categories: MaintenanceCategory[]; canEditCategories: boolean; categorySaving: boolean; editingId: string | null; draftName: string; draftSubtitle: string; pageTitle: string; pageDescription: string; dataSource: "local" | "supabase" | "loading"; onOpenCategory: (category?: MaintenanceCategory) => void; onCloseCategory: () => void; onSaveCategory: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onToggleCategory: (category: MaintenanceCategory) => Promise<void>; onNameChange: (value: string) => void; onSubtitleChange: (value: string) => void }) {
  return <>
    <motion.div className="module-content maintenance-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="module-header"><div><h1>{pageTitle}</h1><p className="muted-copy">{pageDescription} {dataSource === "supabase" ? "Connected." : dataSource === "loading" ? "Loading maintenance data…" : "Showing saved maintenance data."}</p></div>{canEditCategories ? <Button onClick={() => onOpenCategory()}><Plus size={16} /> Add category</Button> : null}</div>
      <section className="profile-settings-section maintenance-settings-section">
        <div className="maintenance-category-grid">{categories.map((category, index) => <motion.article className={`maintenance-category-card ${category.active ? "is-active" : "is-deactivated"}`} key={category.id} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}><div className="maintenance-category-card-top"><span className="maintenance-category-card-icon" aria-hidden="true"><Settings2 size={18} /></span></div><div className="maintenance-category-card-copy"><h3>{category.name}</h3><p>{category.subtitle || (category.active ? "Available for maintenance requests" : "Deactivated for new requests")}</p></div><div className="maintenance-category-card-actions">{canEditCategories ? <><Button type="button" variant="ghost" size="sm" onClick={() => onOpenCategory(category)} disabled={categorySaving}><Pencil size={14} /> Edit</Button><Button type="button" variant={category.active ? "danger" : "soft"} size="sm" loading={categorySaving} onClick={() => onToggleCategory(category)}><Power size={14} /> {category.active ? "Deactivate" : "Activate"}</Button></> : <span className="read-only-label">View only</span>}</div></motion.article>)}</div>
      </section>
    </motion.div>
    <Modal open={Boolean(editingId)} onClose={onCloseCategory} title={editingId === "new" ? "Add maintenance category" : "Edit maintenance category"} description={editingId === "new" ? "Add a title and subtitle for this maintenance category." : "Update the title and subtitle shown on maintenance cards."} noScroll><form className="modal-form-grid maintenance-category-modal" onSubmit={onSaveCategory}><label className="modal-field modal-field-full"><span className="modal-field-label">Category title</span><Input value={draftName} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Electrical Repair" autoFocus /></label><label className="modal-field modal-field-full"><span className="modal-field-label">Category subtitle</span><Input value={draftSubtitle} onChange={(event) => onSubtitleChange(event.target.value)} placeholder="e.g. Available for maintenance requests" /></label><div className="modal-form-actions"><Button type="button" variant="ghost" onClick={onCloseCategory} disabled={categorySaving}>Cancel</Button><Button type="submit" loading={categorySaving}><Check size={15} /> Save category</Button></div></form></Modal>
  </>;
}

function MaintenanceRecordTable({ records, workspaces }: { records: MaintenanceRecord[]; workspaces: any[] }) {
  const workspaceById = new Map(workspaces.map((workspace) => [String(workspace.areaId || workspace.id), workspace]));
  const pageSize = 20;
  const [pageIndex, setPageIndex] = useState(0);
  const pagedRecords = records.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, Math.ceil(records.length / pageSize) - 1)));
  }, [records.length]);
  if (!records.length) {
    return <div className="empty-state"><strong>No maintenance requests.</strong><span>Reported issues will appear here when they are added.</span></div>;
  }
  return <section className="table-card maintenance-requests-table app-table-with-title"><div className="card-heading app-table-card-heading"><div><h2>Maintenance requests</h2><p className="muted-copy">Select a workspace from Workspaces to report, start or resolve an issue.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Request</th><th>Workspace</th><th>Category</th><th>Severity</th><th>Status</th><th>Reported</th></tr></thead><tbody>{pagedRecords.map((record) => <tr key={record.id}><td className="table-primary"><strong>{record.title}</strong><span>{record.description || "No description"}</span></td><td><WorkspaceBadge value={workspaceById.get(record.workspaceId)?.type || workspaceLabel(workspaceById.get(record.workspaceId), record.workspaceId)} /></td><td>{record.category || "Uncategorized"}</td><td><span className={`maintenance-severity maintenance-severity-${record.severity.toLowerCase()}`}>{MAINTENANCE_SEVERITY_LABELS[record.severity]}</span></td><td><span className={`maintenance-badge maintenance-record-${record.status.toLowerCase()}`}>{MAINTENANCE_RECORD_STATUS_LABELS[record.status]}</span></td><td>{formatMaintenanceDate(record.reportedAt)}</td></tr>)}</tbody></table></div><TablePagination pageIndex={pageIndex} pageSize={pageSize} total={records.length} onPageChange={setPageIndex} /></section>;
}

export default function MaintenancePage({ view = "overview" }: { view?: MaintenanceView }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canEditCategories = useHasPermission("maintenance_categories.write");
  const categoriesQuery = useQuery({
    queryKey: queryKeys.maintenance.categories,
    queryFn: fetchMaintenanceCategoriesSnapshot,
    enabled: view === "categories",
  });
  const recordsQuery = useQuery({
    queryKey: queryKeys.maintenance.records,
    queryFn: fetchMaintenanceRecordsSnapshot,
  });
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: fetchWorkspacesSnapshot,
    enabled: view !== "categories",
  });
  const [records, setRecords] = useState<MaintenanceRecord[]>(() => getMaintenanceRecords());
  const [categories, setCategories] = useState<MaintenanceCategory[]>(() => getMaintenanceCategories());
  const [workspaces, setWorkspaces] = useState<any[]>(() => getWorkspaceRecords());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryRecordCheck, setCategoryRecordCheck] = useState<"ready" | "checking" | "failed">(() => isSupabaseLeadsEnabled() ? "checking" : "ready");
  const [dataSource, setDataSource] = useState<"local" | "supabase" | "loading">("local");

  useEffect(() => {
    const refresh = () => {
      setRecords(getMaintenanceRecords());
      setCategories(getMaintenanceCategories());
      setWorkspaces(getWorkspaceRecords());
    };
    window.addEventListener("cubicle-demo-change", refresh);
    return () => window.removeEventListener("cubicle-demo-change", refresh);
  }, []);

  useEffect(() => {
    if (!recordsQuery.data) return;
    setRecords(recordsQuery.data.records);
    setDataSource(recordsQuery.data.dataSource === "supabase" ? "supabase" : "local");
    if (view === "categories") {
      setCategoryRecordCheck(recordsQuery.data.errorMessage ? "failed" : "ready");
      if (recordsQuery.data.errorMessage) {
        showToast({ variant: "error", title: "Category usage could not be checked", message: "Deactivation is disabled until active maintenance tickets can be verified." });
      }
    } else if (recordsQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Maintenance records could not be loaded", message: "Showing the saved maintenance records." });
    }
  }, [recordsQuery.data, showToast, view]);

  useEffect(() => {
    if (!categoriesQuery.data) return;
    setCategories(categoriesQuery.data.categories);
    setDataSource(categoriesQuery.data.dataSource === "supabase" ? "supabase" : "local");
    if (categoriesQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Categories could not be loaded", message: "Showing the saved maintenance categories." });
    }
  }, [categoriesQuery.data, showToast]);

  useEffect(() => {
    if (!workspacesQuery.data) return;
    setWorkspaces(workspacesQuery.data.workspaces);
    if (workspacesQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Workspaces could not be loaded", message: "Showing the saved workspaces." });
    }
  }, [showToast, workspacesQuery.data]);

  const activeRecords = useMemo(() => records.filter(isActiveMaintenanceRecord), [records]);
  const openRecords = useMemo(() => records.filter((record) => record.status === "OPEN"), [records]);
  const inProgressRecords = useMemo(() => records.filter((record) => record.status === "IN_PROGRESS"), [records]);
  const resolvedRecords = useMemo(() => records.filter((record) => record.status === "RESOLVED"), [records]);
  const criticalRecords = useMemo(() => activeRecords.filter((record) => record.severity === "CRITICAL"), [activeRecords]);
  const pageTitle = view === "requests" ? "Maintenance requests" : view === "categories" ? "Maintenance categories" : "Maintenance overview";
  const pageDescription = view === "requests"
    ? "Track open maintenance issues across managed workspaces."
    : view === "categories"
      ? "Manage the categories your team uses to classify maintenance work."
      : "See the current maintenance workload and workspace issues at a glance.";
  const visibleRecords = view === "requests" || view === "overview" ? activeRecords : [];

  function openCategoryForm(category?: MaintenanceCategory) {
    setEditingId(category?.id || "new");
    setDraftName(category?.name || "");
    setDraftSubtitle(category?.subtitle || (category?.active === false ? "Deactivated for new requests" : "Available for maintenance requests"));
  }

  function closeCategoryForm() {
    if (categorySaving) return;
    setEditingId(null);
    setDraftName("");
    setDraftSubtitle("");
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditCategories || categorySaving) return;
    const name = draftName.trim();
    const subtitle = draftSubtitle.trim();
    if (!name) return;
    if (!subtitle) {
      showToast({ variant: "error", title: "Category was not saved", message: "Enter a category subtitle." });
      return;
    }
    if (categories.some((category) => category.id !== editingId && category.name.toLowerCase() === name.toLowerCase())) {
      showToast({ variant: "error", title: "Category already exists", message: "Use a different maintenance category name." });
      return;
    }
    setCategorySaving(true);
    try {
      const savedCategory = isSupabaseLeadsEnabled()
        ? mapSupabaseMaintenanceCategoryToOsCategory(editingId === "new" ? await createSupabaseMaintenanceCategory(name, subtitle) : await updateSupabaseMaintenanceCategory(editingId || "", { name, description: subtitle, active: categories.find((category) => category.id === editingId)?.active !== false }))
        : { id: editingId === "new" ? `maintenance-category-${Date.now()}` : editingId || `maintenance-category-${Date.now()}`, name, subtitle, active: categories.find((category) => category.id === editingId)?.active !== false };
      const next = editingId === "new" ? [savedCategory, ...categories] : categories.map((category) => category.id === editingId ? savedCategory : category);
      const nextCategories = saveMaintenanceCategories(next);
      setCategories(nextCategories);
      queryClient.setQueryData<MaintenanceCategoriesQuerySnapshot>(queryKeys.maintenance.categories, (current) => ({
        categories: nextCategories,
        dataSource: current?.dataSource || (isSupabaseLeadsEnabled() ? "supabase" : "demo"),
        errorMessage: "",
      }));
      setEditingId(null);
      setDraftName("");
      setDraftSubtitle("");
      showToast({ variant: "success", title: editingId === "new" ? "Category added" : "Category updated", message: `${name} is ready to use on maintenance requests.` });
    } catch (error) {
      showToast({ variant: "error", title: "Category was not saved", message: error?.code === "23505" ? "A maintenance category with this name already exists." : error?.message || "The category could not be saved." });
    } finally {
      setCategorySaving(false);
    }
  }

  if (String(view) === "categories") {
    return <MaintenanceCategoryCards categories={categories} canEditCategories={canEditCategories} categorySaving={categorySaving} editingId={editingId} draftName={draftName} draftSubtitle={draftSubtitle} pageTitle={pageTitle} pageDescription={pageDescription} dataSource={dataSource} onOpenCategory={openCategoryForm} onCloseCategory={closeCategoryForm} onSaveCategory={saveCategory} onToggleCategory={toggleCategory} onNameChange={setDraftName} onSubtitleChange={setDraftSubtitle} />;
    return <motion.div className="module-content maintenance-page" initial={{ opacity: 1 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>{pageTitle}</h1><p className="muted-copy">{pageDescription} {dataSource === "supabase" ? "Connected." : dataSource === "loading" ? "Loading maintenance data…" : "Showing saved maintenance data."}</p></div>{canEditCategories ? <Button onClick={() => openCategoryForm()}><Plus size={16} /> Add category</Button> : null}</div><section className="profile-settings-section maintenance-settings-section"><div className="settings-section-heading"><div><h2>Maintenance categories</h2><p className="muted-copy">Active categories are available when reporting a workspace issue.</p></div>{!canEditCategories ? <span className="read-only-label">Admin editing only</span> : null}</div><div className="maintenance-category-grid">{categories.map((category, index) => <motion.article className={`maintenance-category-card ${category.active ? "is-active" : "is-deactivated"}`} key={category.id} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}><div className="maintenance-category-card-top"><span className="maintenance-category-card-icon" aria-hidden="true"><Settings2 size={18} /></span><span className={`maintenance-category-status ${category.active ? "is-active" : "is-inactive"}`}>{category.active ? <Check size={12} /> : <Power size={12} />}{category.active ? "Active" : "Deactivated"}</span></div><div className="maintenance-category-card-copy"><h3>{category.name}</h3><p>{category.active ? "Available for maintenance requests" : "Deactivated for new requests"}</p></div><div className="maintenance-category-card-actions">{canEditCategories ? <><Button type="button" variant="ghost" size="sm" onClick={() => openCategoryForm(category)} disabled={categorySaving}><Pencil size={14} /> Edit</Button><Button type="button" variant={category.active ? "danger" : "soft"} size="sm" loading={categorySaving} onClick={() => toggleCategory(category)}><Power size={14} /> {category.active ? "Deactivate" : "Activate"}</Button></> : <span className="read-only-label">View only</span>}</div></motion.article>)}</div>{editingId ? <form className="maintenance-category-form" onSubmit={saveCategory}><label className="settings-label">Category name<Input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. HVAC Repair" autoFocus /></label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { setEditingId(null); setDraftName(""); }}>Cancel</Button><Button type="submit" loading={categorySaving}><Check size={15} /> Save category</Button></div></form> : null}</section></motion.div>;
  }
  async function toggleCategory(category: MaintenanceCategory) {
    if (!canEditCategories || categorySaving) return;
    if (category.active) {
      if (categoryRecordCheck !== "ready") {
        showToast({ variant: "error", title: "Category status was not changed", message: "Active maintenance tickets could not be verified. Try again when the records are available." });
        return;
      }
      const categoryKey = category.name.trim().toLowerCase();
      const hasActiveTicket = records.some((record) => {
        if (!isActiveMaintenanceRecord(record)) return false;
        const recordCategory = String(record.category || "").trim().toLowerCase();
        return recordCategory === categoryKey || recordCategory === category.id.trim().toLowerCase();
      });
      if (hasActiveTicket) {
        showToast({ variant: "error", title: "Category cannot be deactivated", message: "This category has an active ticket. Complete or cancel it before deactivating the category." });
        return;
      }
    }
    setCategorySaving(true);
    try {
      const savedCategory = isSupabaseLeadsEnabled()
        ? mapSupabaseMaintenanceCategoryToOsCategory(await updateSupabaseMaintenanceCategory(category.id, { name: category.name, description: category.subtitle, active: !category.active }))
        : { ...category, active: !category.active, subtitle: category.subtitle || (!category.active ? "Available for maintenance requests" : "Deactivated for new requests") };
      const nextCategories = saveMaintenanceCategories(categories.map((item) => item.id === category.id ? savedCategory : item));
      setCategories(nextCategories);
      queryClient.setQueryData<MaintenanceCategoriesQuerySnapshot>(queryKeys.maintenance.categories, (current) => ({
        categories: nextCategories,
        dataSource: current?.dataSource || (isSupabaseLeadsEnabled() ? "supabase" : "demo"),
        errorMessage: "",
      }));
      showToast({ variant: "success", title: category.active ? "Category deactivated" : "Category activated", message: `${category.name} is ${category.active ? "hidden from new requests" : "available for new requests"}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Category status was not changed", message: error?.message || "The category status could not be updated." });
    } finally {
      setCategorySaving(false);
    }
  }

  return <motion.div className="module-content maintenance-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>{pageTitle}</h1><p className="muted-copy">{pageDescription} {dataSource === "supabase" ? "Connected." : dataSource === "loading" ? "Loading maintenance data…" : "Showing saved maintenance data."}</p></div>{view === "categories" && canEditCategories ? <Button onClick={() => openCategoryForm()}><Plus size={16} /> Add category</Button> : null}</div>{view !== "categories" ? <><section className="stat-grid module-stats maintenance-stats"><KpiCard icon={<ClipboardList size={18} />} label="Open requests" value={openRecords.length} detail="Waiting to be started" /><KpiCard icon={<Wrench size={18} />} label="In progress" value={inProgressRecords.length} detail="Currently being handled" /><KpiCard icon={<Check size={18} />} label="Resolved" value={resolvedRecords.length} detail="Completed maintenance" /><KpiCard icon={<AlertTriangle size={18} />} label="Critical issues" value={criticalRecords.length} detail="Active priority issues" /></section><div className="section-heading"><div><h2>{view === "requests" ? "Open requests" : "Current maintenance"}</h2><p className="muted-copy">Select a workspace from Workspaces to report, start or resolve an issue.</p></div></div><MaintenanceRecordTable records={visibleRecords} workspaces={workspaces} /></> : <section className="profile-settings-section maintenance-settings-section"><div className="settings-section-heading"><div><h2>Maintenance categories</h2><p className="muted-copy">Active categories are available when reporting a workspace issue.</p></div>{!canEditCategories ? <span className="read-only-label">Admin editing only</span> : null}</div><div className="maintenance-category-list">{categories.map((category) => <div className={`maintenance-category-row${category.active ? "" : " is-deactivated"}`} key={category.id}><div><strong>{category.name}</strong><span>{category.active ? "Available for maintenance requests" : "Deactivated for new requests"}</span></div><div className="maintenance-category-actions"><span className={`maintenance-category-status ${category.active ? "is-active" : "is-inactive"}`}>{category.active ? <Check size={12} /> : null}{category.active ? "Active" : "Deactivated"}</span>{canEditCategories ? <><button type="button" className="action-icon-btn" onClick={() => openCategoryForm(category)} aria-label={`Edit ${category.name}`} title="Edit category"><Pencil size={16} /></button><button type="button" className="action-icon-btn" onClick={() => toggleCategory(category)} aria-label={`${category.active ? "Deactivate" : "Activate"} ${category.name}`} title={category.active ? "Deactivate category" : "Activate category"}><Power size={16} /></button></> : null}</div></div>)}</div>{editingId ? <form className="maintenance-category-form" onSubmit={saveCategory}><label className="settings-label">Category name<Input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. HVAC Repair" autoFocus /></label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { setEditingId(null); setDraftName(""); }}>Cancel</Button><Button type="submit" loading={categorySaving}><Check size={15} /> Save category</Button></div></form> : null}</section>}</motion.div>;
}
