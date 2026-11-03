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
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    if (!employee) return;
    if (employee.backend !== "supabase" || !supabaseEnabled) {
      setRows(demoRows(employeeId));
      return;
    }
    if (isOwner) {
      // Owner permission overrides are intentionally never fetched or written.
      // Render the protected permission catalogue as enabled so the owner can
      // still audit the effective access without being offered unsafe toggles.
      setRows(DEMO_ACCESS_OPTIONS.map((row) => ({ ...row, granted: true, overridden: false })));
      return;
    }
    if (permissionsQuery.data) setRows(normalizeRows(permissionsQuery.data));
  }, [employee, employeeId, isOwner, permissionsQuery.data, supabaseEnabled]);

  const groupedRows = useMemo(() => rows.reduce<Record<string, AccessRow[]>>((groups, row) => {
    const group = row.group || groupForPermission(row.permission_key);
    (groups[group] ||= []).push(row);
    return groups;
  }, {}), [rows]);

  async function togglePermission(row: AccessRow) {
    if (isOwner || savingKey || !employee) return;
    const nextGranted = !row.granted;
    const previousRows = rows;
    setSavingKey(row.permission_key);
    setRows((current) => current.map((item) => item.permission_key === row.permission_key ? { ...item, granted: nextGranted } : item));
    try {
      if (employee.backend === "supabase" && supabaseEnabled) {
        await updateSupabaseUserPermission(employee.userId || employee.id, row.permission_key, nextGranted);
        await permissionsQuery.refetch();
      } else {
        const current = getDemoValue(`employee-permissions-${employeeId}`) || {};
        saveDemoValue(`employee-permissions-${employeeId}`, { ...current, [row.permission_key]: nextGranted });
      }
      showToast({ variant: "success", title: "Access updated", message: `${row.label} is now ${nextGranted ? "enabled" : "disabled"} for ${employee.name}.` });
    } catch (error) {
      setRows(previousRows);
      showToast({ variant: "error", title: "Access was not updated", message: error instanceof Error ? error.message : "The permission could not be saved." });
    } finally {
      setSavingKey("");
    }
  }

  if (!canManage) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employee access</h1><p className="muted-copy">You do not have permission to manage employee access.</p></div></div><div className="table-empty-state">Ask an owner or administrator to grant Employees — Manage access.</div></motion.div>;
  if (employeesQuery.isLoading) return <motion.div className="module-content employee-access-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><AccessLoading /></motion.div>;
  if (!employee) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employee not found</h1><p className="muted-copy">This employee may have been removed or is no longer visible to your account.</p></div></div><Button variant="ghost" onClick={() => router.push("/employees")}><ArrowLeft size={15} /> Back to employees</Button></motion.div>;

  return <motion.div className="module-content employee-access-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
    <div className="employee-access-topbar"><Button variant="ghost" onClick={() => router.push("/employees")}><ArrowLeft size={15} /> Back to employees</Button></div>
    <div className="module-header employee-access-heading"><div><h1>Employee access</h1><p className="muted-copy">Control what {employee.name} can view and change in the OS.</p></div></div>
    <section className="employee-access-identity"><span className="employee-access-avatar"><UserRound size={20} /></span><div><strong>{employee.name}</strong><span>{employee.email}</span></div><span className={`status-tag status-${String(employee.status).toLowerCase().replaceAll(" ", "-")}`}>{employee.status === "Disabled" ? "Suspended" : employee.status}</span></section>
    {permissionsQuery.isLoading && !rows.length ? <AccessLoading /> : permissionsQuery.error && employee.backend === "supabase" ? <div className="table-empty-state">Permissions could not be loaded. Refresh the page and try again.</div> : <div className="employee-access-groups">{Object.entries(groupedRows).map(([group, groupRows]) => <section className="employee-access-group" key={group}><div className="employee-access-group-heading"><div><h2>{group}</h2><p>Choose the access this employee needs.</p></div></div><div className="employee-access-list">{groupRows.map((row) => <div className="employee-access-row" key={row.permission_key}><div><strong>{row.label}</strong><span>{row.description}</span></div><AccessSwitch checked={row.granted} disabled={isOwner} loading={savingKey === row.permission_key} onChange={() => void togglePermission(row)} label={`${row.granted ? "Disable" : "Enable"} ${row.label}`} /></div>)}</div></section>)}</div>}
  </motion.div>;
}
