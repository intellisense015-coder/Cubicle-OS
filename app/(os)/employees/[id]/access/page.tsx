"use client";

import { ArrowLeft, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useHasPermission } from "@/lib/access-control";
import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { fetchEmployeesSnapshot } from "@/lib/employee-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchSupabaseUserPermissions, updateSupabaseUserPermission, type SupabaseAdminUserPermissionRow } from "@/lib/supabase/admin-users";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";

const DEMO_ACCESS_OPTIONS = [
  { permission_key: "dashboard.read", label: "Dashboard", description: "View workspace performance and operating summaries.", group: "Overview" },
  { permission_key: "leads.read", label: "Leads — View", description: "View the lead pipeline and lead details.", group: "Leads" },
  { permission_key: "leads.write", label: "Leads — Edit", description: "Create, update and assign leads.", group: "Leads" },
  { permission_key: "leads.followups.read", label: "Follow-ups — View", description: "View scheduled lead follow-ups.", group: "Leads" },
  { permission_key: "leads.followups.write", label: "Follow-ups — Add & edit", description: "Create and update lead follow-ups.", group: "Leads" },
  { permission_key: "leads.activity.read", label: "Lead activity — View", description: "View lead activity history.", group: "Leads" },
  { permission_key: "leads.activity.write", label: "Lead activity — Add & edit", description: "Add and update lead activity records.", group: "Leads" },
  { permission_key: "leads.journey.read", label: "Lead journey — View", description: "View complete lead journeys.", group: "Leads" },
  { permission_key: "leads.journey.write", label: "Lead journey — Add & edit", description: "Add and update lead journey entries.", group: "Leads" },
  { permission_key: "visits.read", label: "Visits — View", description: "View scheduled and completed visits.", group: "Visits" },
  { permission_key: "visits.write", label: "Visits — Edit", description: "Schedule and update visits.", group: "Visits" },
  { permission_key: "members.read", label: "Members — View", description: "View member records and memberships.", group: "People" },
  { permission_key: "members.write", label: "Members — Edit", description: "Create and update member records.", group: "People" },
  { permission_key: "companies.read", label: "Companies — View", description: "View company records.", group: "People" },
  { permission_key: "companies.write", label: "Companies — Edit", description: "Create and update company records.", group: "People" },
  { permission_key: "workspaces.read", label: "Workspaces — View", description: "View mapped workspaces and floor plans.", group: "Workspaces" },
  { permission_key: "workspaces.write", label: "Workspaces — Edit", description: "Configure workspace records.", group: "Workspaces" },
  { permission_key: "maintenance_categories.read", label: "Maintenance — View", description: "View maintenance categories and requests.", group: "Maintenance" },
  { permission_key: "maintenance_categories.write", label: "Maintenance — Edit", description: "Manage maintenance categories and workflows.", group: "Maintenance" },
  { permission_key: "invoices.read", label: "Billing — View", description: "View invoices and payment status.", group: "Billing" },
  { permission_key: "invoices.write", label: "Billing — Edit", description: "Create and update invoices.", group: "Billing" },
  { permission_key: "admin_users.read", label: "Employees — View", description: "View the employee directory.", group: "Administration" },
  { permission_key: "admin_users.manage", label: "Employees — Manage", description: "Invite employees and change account access.", group: "Administration" },
  { permission_key: "approvals.read", label: "Approvals — View", description: "View approval requests and alerts.", group: "Administration" },
  { permission_key: "settings.read", label: "Settings — View", description: "View authorized settings.", group: "Settings" },
];

type AccessRow = SupabaseAdminUserPermissionRow & { group?: string };

const LEAD_ACCESS_ITEMS = [
  { label: "All leads", description: "Manage the main leads page.", viewKey: "leads.read", editKey: "leads.write" },
  { label: "Follow-ups", description: "Schedule and review lead follow-ups.", viewKey: "leads.followups.read", editKey: "leads.followups.write" },
  { label: "Lead activity", description: "Review and update lead activity.", viewKey: "leads.activity.read", editKey: "leads.activity.write" },
  { label: "Lead journey", description: "Review and update complete lead journeys.", viewKey: "leads.journey.read", editKey: "leads.journey.write" },
] as const;

const LEAD_PERMISSION_KEYS = new Set<string>(LEAD_ACCESS_ITEMS.flatMap((item) => [item.viewKey, item.editKey]));

function groupForPermission(permissionKey: string) {
  const prefix = permissionKey.split(".")[0];
  if (prefix === "dashboard") return "Overview";
  if (prefix === "leads") return "Leads";
  if (prefix === "visits") return "Visits";
  if (["members", "companies"].includes(prefix)) return "People";
  if (["workspaces", "floor_plan"].includes(prefix)) return "Workspaces";
  if (prefix.startsWith("maintenance")) return "Maintenance";
  if (["invoices", "quotations", "proposals"].includes(prefix)) return "Billing";
  if (["admin_users", "approvals", "email_templates"].includes(prefix)) return "Administration";
  if (prefix === "settings") return "Settings";
  return "Other access";
}

function normalizeRows(rows: SupabaseAdminUserPermissionRow[]) {
  return rows
    .filter((row) => !row.permission_key.startsWith("agreements."))
    .map((row) => ({ ...row, group: groupForPermission(row.permission_key) }))
    .sort((a, b) => `${a.group}:${a.label}`.localeCompare(`${b.group}:${b.label}`));
}

function demoRows(employeeId: string): AccessRow[] {
  const saved = getDemoValue(`employee-permissions-${employeeId}`);
  return DEMO_ACCESS_OPTIONS.map((row) => ({
    ...row,
    granted: typeof saved?.[row.permission_key] === "boolean" ? saved[row.permission_key] : true,
    overridden: true,
  }));
}

function AccessSwitch({ checked, disabled, loading, onChange, label }: { checked: boolean; disabled?: boolean; loading?: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`employee-access-switch${checked ? " is-on" : ""}${loading ? " is-loading" : ""}`} disabled={disabled || loading} onClick={onChange}><span /></button>;
}

function PermissionControl({ label, row, disabled, onChange }: { label: string; row?: AccessRow; disabled: boolean; onChange: (row: AccessRow) => void }) {
  if (!row) return null;
  return <div className="employee-access-control"><span>{label}</span><AccessSwitch checked={row.granted} disabled={disabled} onChange={() => onChange(row)} label={`${row.granted ? "Disable" : "Enable"} ${label} access for ${row.label}`} /></div>;
}

function AccessLoading() {
  return <div className="employee-access-loading" role="status" aria-label="Loading employee access"><span /><span /><span /><span /></div>;
}

export default function EmployeeAccessPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const canManage = useHasPermission("admin_users.manage");
  const employeeId = decodeURIComponent(String(params?.id || ""));
  const supabaseEnabled = isSupabaseLeadsEnabled();
  const employeesQuery = useQuery({ queryKey: queryKeys.employees.all, queryFn: fetchEmployeesSnapshot, enabled: canManage });
  const employee = useMemo(() => employeesQuery.data?.employees.find((item) => String(item.id) === employeeId), [employeeId, employeesQuery.data?.employees]);
  const isOwner = employee?.roleKey === "owner" || String(employee?.role).toLowerCase() === "owner";
  const permissionsQuery = useQuery({
    queryKey: queryKeys.employees.permissions(employee?.userId || employeeId),
    queryFn: () => fetchSupabaseUserPermissions(employee?.userId || employeeId),
    enabled: canManage && Boolean(employee) && supabaseEnabled && employee?.backend === "supabase" && !isOwner,
  });
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [savedRows, setSavedRows] = useState<AccessRow[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState("All access");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    if (employee.backend !== "supabase" || !supabaseEnabled) {
      const nextRows = demoRows(employeeId);
      setRows(nextRows);
      setSavedRows(nextRows);
      setPendingChanges({});
      return;
    }
    if (isOwner) {
      // Owner permission overrides are intentionally never fetched or written.
      // Render the protected permission catalogue as enabled so the owner can
      // still audit the effective access without being offered unsafe toggles.
      const nextRows = DEMO_ACCESS_OPTIONS.map((row) => ({ ...row, granted: true, overridden: false }));
      setRows(nextRows);
      setSavedRows(nextRows);
      setPendingChanges({});
      return;
    }
    if (permissionsQuery.data) {
      const nextRows = normalizeRows(permissionsQuery.data);
      setRows(nextRows);
      setSavedRows(nextRows);
      setPendingChanges({});
    }
  }, [employee, employeeId, isOwner, permissionsQuery.data, supabaseEnabled]);

  const groupedRows = useMemo(() => rows.reduce<Record<string, AccessRow[]>>((groups, row) => {
    const group = row.group || groupForPermission(row.permission_key);
    (groups[group] ||= []).push(row);
    return groups;
  }, {}), [rows]);

  const groupedEntries = useMemo(() => Object.entries(groupedRows), [groupedRows]);
  const visibleGroups = useMemo(() => activeGroup === "All access" ? groupedEntries : groupedEntries.filter(([group]) => group === activeGroup), [activeGroup, groupedEntries]);

  useEffect(() => {
    if (activeGroup !== "All access" && !groupedRows[activeGroup]) setActiveGroup("All access");
  }, [activeGroup, groupedRows]);

  function pairedPermissionKey(permissionKey: string) {
    if (permissionKey.endsWith(".write")) return `${permissionKey.slice(0, -".write".length)}.read`;
    if (permissionKey.endsWith(".read")) return `${permissionKey.slice(0, -".read".length)}.write`;
    return null;
  }

  function togglePermission(row: AccessRow) {
    if (isOwner || isSaving || !employee) return;
    const nextGranted = !row.granted;
    const pairedKey = pairedPermissionKey(row.permission_key);
    const pairedRow = pairedKey ? rows.find((item) => item.permission_key === pairedKey) : undefined;
    const changes: Record<string, boolean> = { [row.permission_key]: nextGranted };

    // Editing requires viewing. Turning View off also removes the dependent
    // edit permission so the employee can never end up in an invalid state.
    if (pairedRow && ((row.permission_key.endsWith(".write") && nextGranted) || (row.permission_key.endsWith(".read") && !nextGranted))) {
      changes[pairedKey] = row.permission_key.endsWith(".write");
    }

    setRows((current) => current.map((item) => changes[item.permission_key] === undefined ? item : { ...item, granted: changes[item.permission_key] }));
    setPendingChanges((current) => {
      const next = { ...current };
      Object.entries(changes).forEach(([permissionKey, granted]) => {
        const savedRow = savedRows.find((item) => item.permission_key === permissionKey);
        if (savedRow?.granted === granted) delete next[permissionKey];
        else next[permissionKey] = granted;
      });
      return next;
    });
  }

  async function savePermissions() {
    if (isOwner || isSaving || !employee || !Object.keys(pendingChanges).length) return;
    const changes = { ...pendingChanges };
    setIsSaving(true);
    try {
      if (employee.backend === "supabase" && supabaseEnabled) {
        await Promise.all(Object.entries(changes).map(([permissionKey, granted]) => updateSupabaseUserPermission(employee.userId || employee.id, permissionKey, granted)));
        await permissionsQuery.refetch();
      } else {
        const current = getDemoValue(`employee-permissions-${employeeId}`) || {};
        saveDemoValue(`employee-permissions-${employeeId}`, { ...current, ...changes });
        setSavedRows(rows);
      }
      setPendingChanges({});
      showToast({ variant: "success", title: "Access updated", message: `${employee.name}'s permissions were updated.` });
    } catch (error) {
      setRows(savedRows);
      setPendingChanges(changes);
      showToast({ variant: "error", title: "Access was not updated", message: error instanceof Error ? error.message : "The permissions could not be saved." });
    } finally {
      setIsSaving(false);
    }
  }

  const renderGroup = ([group, groupRows]: [string, AccessRow[]]) => {
    if (group === "Leads") {
      const rowsByKey = new Map(groupRows.map((row) => [row.permission_key, row]));
      const configuredLeadItems = LEAD_ACCESS_ITEMS.filter((item) => rowsByKey.has(item.viewKey) || rowsByKey.has(item.editKey));
      return <section className="employee-access-group" key={group}><div className="employee-access-group-heading"><h2>{group}</h2></div><div className="employee-access-list">{configuredLeadItems.map((item) => <div className="employee-access-row employee-access-row-with-controls" key={item.label}><div><strong>{item.label}</strong><span>{item.description}</span></div><div className="employee-access-controls"><PermissionControl label="View" row={rowsByKey.get(item.viewKey)} disabled={isOwner || isSaving} onChange={togglePermission} /><PermissionControl label="Add & edit" row={rowsByKey.get(item.editKey)} disabled={isOwner || isSaving} onChange={togglePermission} /></div></div>)}</div></section>;
    }

    return <section className="employee-access-group" key={group}><div className="employee-access-group-heading"><h2>{group}</h2></div><div className="employee-access-list">{groupRows.filter((row) => !LEAD_PERMISSION_KEYS.has(row.permission_key)).map((row) => <div className="employee-access-row" key={row.permission_key}><div><strong>{row.label}</strong><span>{row.description}</span></div><AccessSwitch checked={row.granted} disabled={isOwner || isSaving} onChange={() => togglePermission(row)} label={`${row.granted ? "Disable" : "Enable"} ${row.label}`} /></div>)}</div></section>;
  };

  if (!canManage) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employee access</h1><p className="muted-copy">You do not have permission to manage employee access.</p></div></div><div className="table-empty-state">Ask an owner or administrator to grant Employees — Manage access.</div></motion.div>;
  if (employeesQuery.isLoading) return <motion.div className="module-content employee-access-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><AccessLoading /></motion.div>;
  if (!employee) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employee not found</h1><p className="muted-copy">This employee may have been removed or is no longer visible to your account.</p></div></div><Button variant="ghost" onClick={() => router.push("/employees")}><ArrowLeft size={15} /> Back to employees</Button></motion.div>;

  return <motion.div className="module-content employee-access-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
    <div className="employee-access-topbar"><Button variant="ghost" className="employee-access-back-button" onClick={() => router.push("/employees")}><ArrowLeft size={15} /> Back to employees</Button>{Object.keys(pendingChanges).length > 0 && <Button variant="primary" className="employee-access-save-button" loading={isSaving} disabled={isSaving} onClick={() => void savePermissions()}>Save changes</Button>}</div>
    <div className="module-header employee-access-heading"><div><h1>Employee access</h1><p className="muted-copy">Control what {employee.name} can view and change in the OS.</p></div></div>
    <div className="employee-access-filters" role="tablist" aria-label="Permission categories"><button type="button" role="tab" aria-selected={activeGroup === "All access"} className={activeGroup === "All access" ? "is-active" : ""} onClick={() => setActiveGroup("All access")}>All access</button>{groupedEntries.map(([group]) => <button type="button" role="tab" aria-selected={activeGroup === group} className={activeGroup === group ? "is-active" : ""} onClick={() => setActiveGroup(group)} key={group}>{group}</button>)}</div>
    <section className="employee-access-identity"><span className="employee-access-avatar"><UserRound size={20} /></span><div><strong>{employee.name}</strong><span>{employee.email}</span></div><span className={`status-tag status-${String(employee.status).toLowerCase().replaceAll(" ", "-")}`}>{employee.status === "Disabled" ? "Suspended" : employee.status}</span></section>
    {permissionsQuery.isLoading && !rows.length ? <AccessLoading /> : permissionsQuery.error && employee.backend === "supabase" ? <div className="table-empty-state">Permissions could not be loaded. Refresh the page and try again.</div> : <div className="employee-access-groups">{visibleGroups.map(renderGroup)}</div>}
  </motion.div>;
}
