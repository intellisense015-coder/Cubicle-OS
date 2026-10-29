"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { CheckCircle2, ChevronDown, CirclePlus, KeyRound, MailPlus, ShieldAlert, UserRoundCog } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { employeeRows } from "@/lib/module-d-data";
import { useToast } from "@/components/ui/toast-provider";
import { getSupabaseBrowserClient, isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseAdminRoles, fetchSupabaseAdminUsers, fetchSupabaseUserPermissions, inviteSupabaseAdminUser, mapSupabaseAdminUserToOsEmployee, resetSupabaseUserMfa, updateSupabaseAdminUser, updateSupabaseAdminUserEmail, updateSupabaseUserPermission } from "@/lib/supabase/admin-users";
import { useHasPermission } from "@/lib/access-control";
import { z } from "zod";

// TITLE: EMPLOYEE ROLE OPTIONS
const roleOptions = ["Owner", "Editor", "Front Desk", "Operations", "Finance", "Member support", "Community manager", "Sales", "Facilities", "HR", "Other / custom role"];
const normalizeEmployeeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeEmployeePhone = (value) => { const digits = String(value || "").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; };

const employeeInviteSchema = z.object({
  name: z.string().trim().min(1, "Enter the employee's name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().optional(),
  role: z.string().min(1, "Choose a role."),
  customRole: z.string().optional()
});

const employeeEditorSchema = z.object({
  email: z.string().trim().email("Enter a valid invitation email address."),
  role: z.string().min(1, "Choose a role."),
  permissions: z.array(z.string())
});

// TITLE: CUSTOM ROLE SELECT
function RoleSelect({ value, onChange, options = roleOptions }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>Role</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{options.map((role) => <button type="button" key={role} className={value === role ? "is-selected" : ""} onClick={() => { onChange(role); setOpen(false); }}>{role}</button>)}</div>}</div></div>;
}

// TITLE: EMPLOYEE TABLE
function createEmployeeColumns(onManage, canManage) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("name", { header: "Employee", cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong><span>{row.original.status === "Pending invite" ? `Invite: ${row.original.email}` : row.original.email}</span></div> }), columnHelper.accessor("role", { header: "Role" }), columnHelper.accessor("status", { header: "Account status", cell: ({ getValue }) => { const status = getValue(); return <span className={`status-tag status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status === "Disabled" ? "Suspended" : status}</span>; } }), columnHelper.accessor("lastActivity", { header: "Last activity" }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => canManage ? <button className="action-icon-btn" type="button" onClick={() => onManage(row.original)} aria-label={`Manage ${row.original.name}`} title="Manage"><UserRoundCog size={16} /></button> : <span className="read-only-label">Read only</span> })];
}

// TITLE: EMPLOYEE ACCESS EDITOR
function permissionDisplayLabel(permission) {
  const action = permission.permission_key.split(".").slice(1).join(".") || "access";
  if (action === "read" || action === "view") return "View";
  if (action === "write") return "Edit";
  return action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function permissionModuleLabel(permission) {
  const module = permission.permission_key.split(".")[0] || permission.permission_key;
  return module.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function EmployeeEditor({ employee, adminRoles, onClose, onSave, onToggleStatus, autoResetMfa = false }) {
  const permissionOptions = ["Workspace access", "Leads", "Members & companies", "Visits", "Floor plan", "Workspaces", "Invoices", "Employees & access", "Approvals & alerts", "Settings", "Email templates", "Profile & security"];
  const isSupabaseUser = employee.backend === "supabase";
  const { showToast } = useToast();
  const router = useRouter();
  const [userPermissions, setUserPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState("");
  const [mfaResetting, setMfaResetting] = useState(false);
  const formApi = useForm({ resolver: zodResolver(employeeEditorSchema), defaultValues: { email: employee.email || "", role: employee.role, permissions: employee.permissions.split(" · ").filter(Boolean) }, mode: "onBlur" });
  const { handleSubmit, register, setValue, watch, formState } = formApi;
  const permissions = watch("permissions");
  const selectedRoleKey = adminRoles.find((role) => role.label === watch("role"))?.role_key || employee.roleKey;

  useEffect(() => {
    if (!isSupabaseUser || !employee.userId) {
      setUserPermissions([]);
      return;
    }

    let cancelled = false;
    setPermissionsLoading(true);
    void fetchSupabaseUserPermissions(employee.userId).then((rows) => {
      if (!cancelled) setUserPermissions(rows.filter((permission) => !permission.permission_key.startsWith("agreements.")));
    }).catch((error) => {
      if (!cancelled) {
        setUserPermissions([]);
        showToast({ variant: "error", title: "Permissions could not be loaded", message: error?.message || "Supabase did not return this role's permissions." });
      }
    }).finally(() => {
      if (!cancelled) setPermissionsLoading(false);
    });

    return () => { cancelled = true; };
  }, [isSupabaseUser, employee.userId, showToast]);
  const onSubmit = async (values) => {
    const selectedRole = adminRoles.find((role) => role.label === values.role);
    onSave({ ...employee, email: normalizeEmployeeEmail(values.email), role: values.role, roleKey: selectedRole?.role_key || employee.roleKey, permissions: values.permissions.join(" · "), lastActivity: "Just now" });
  };
  const togglePermission = (permission) => setValue("permissions", permissions.includes(permission) ? permissions.filter((item) => item !== permission) : [...permissions, permission], { shouldDirty: true });
  const toggleUserPermission = async (permission) => {
    if (!employee.userId || selectedRoleKey === "owner") return;
    const nextGranted = !permission.granted;
    setPermissionSaving(permission.permission_key);
    try {
      await updateSupabaseUserPermission(employee.userId, permission.permission_key, nextGranted);
      setUserPermissions((current) => current.map((item) => item.permission_key === permission.permission_key ? { ...item, granted: nextGranted, overridden: true } : item));
      showToast({ variant: "success", title: "Employee access updated", message: `${permissionModuleLabel(permission)} ${permissionDisplayLabel(permission).toLowerCase()} access for ${employee.name} is now ${nextGranted ? "enabled" : "disabled"}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Employee access was not updated", message: error?.message || "Supabase could not save this permission." });
    } finally {
      setPermissionSaving("");
    }
  };
  const continueMfaResetAfterVerification = () => {
    if (typeof window !== "undefined" && employee.userId) {
      window.sessionStorage.setItem("pending-mfa-reset-user", employee.userId);
    }
    router.push(`/mfa?next=${encodeURIComponent("/employees")}`);
  };
  const resetMfa = async (skipConfirmation = false) => {
    if (!employee.userId || selectedRoleKey === "owner" || mfaResetting) return;
    if (!skipConfirmation && !window.confirm(`Reset the authenticator for ${employee.name}? They will need to enroll a new authenticator at their next sign-in.`)) return;
    setMfaResetting(true);
    try {
      const { data: assuranceData } = await getSupabaseBrowserClient().auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceData?.nextLevel === "aal2" && assuranceData.currentLevel !== "aal2") {
        continueMfaResetAfterVerification();
        return;
      }
      const result = await resetSupabaseUserMfa(employee.userId);
      showToast({ variant: "success", title: "Authenticator reset", message: `${employee.name} can enroll a new authenticator at the next sign-in${result.removedFactors ? ` (${result.removedFactors} factor removed).` : "."}` });
    } catch (error) {
      const message = error?.message || "Supabase could not reset this authenticator.";
      if (/aal2|mfa verification|required before resetting/i.test(message)) {
        continueMfaResetAfterVerification();
        return;
      }
      showToast({ variant: "error", title: "Authenticator was not reset", message });
    } finally {
      setMfaResetting(false);
    }
  };
  useEffect(() => {
    if (!autoResetMfa || !employee.userId) return;
    if (typeof window !== "undefined") window.sessionStorage.removeItem("pending-mfa-reset-user");
    void resetMfa(true);
  }, [autoResetMfa, employee.userId]);
  const emailError = formState.errors.email?.message;
  return <motion.form className="inline-form-card employee-editor-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(onSubmit)}><div className="card-heading"><div><h2>{employee.name}</h2><p className="muted-copy">{isSupabaseUser ? "This account is managed by Supabase Auth and its administrator permissions." : "Invitation/account email can be edited before the employee accepts the invite."}</p></div></div><div className="inline-form-grid"><label className="settings-label">Invitation email<Input className={emailError ? "has-error" : ""} type="email" {...register("email")} disabled={isSupabaseUser && selectedRoleKey === "owner"} />{emailError && <span className="lead-form-error">{emailError}</span>}</label><RoleSelect options={isSupabaseUser ? adminRoles.map((role) => role.label) : roleOptions} value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true, shouldValidate: true })} /></div>{isSupabaseUser ? <><div className="employee-invite-note"><ShieldAlert size={14} /> Supabase role: <strong>{watch("role")}</strong>. Individual overrides below apply only to this account.</div><section className="employee-role-permissions"><div className="employee-role-permissions-heading"><strong>Employee access</strong><small>Choose View or Edit access for this employee. Owner access is always protected.</small></div>{selectedRoleKey === "owner" ? <p className="muted-copy">Owner access is protected and cannot be reduced.</p> : permissionsLoading ? <p className="muted-copy">Loading employee permissions…</p> : userPermissions.length ? <div className="permission-checklist">{userPermissions.map((permission) => <label key={permission.permission_key} className="permission-check"><input type="checkbox" checked={permission.granted} disabled={permissionSaving === permission.permission_key} onChange={() => void toggleUserPermission(permission)} /><span><strong>{permissionModuleLabel(permission)} — {permissionDisplayLabel(permission)}</strong><small>{permission.overridden ? "Employee-specific setting" : "Inherited from role"}{permission.description ? ` · ${permission.description}` : ""}</small></span></label>)}</div> : <p className="muted-copy">No active permissions were configured for this employee.</p>}</section><div className="employee-mfa-actions"><Button type="button" variant="ghost" onClick={() => void resetMfa()} disabled={mfaResetting}>{mfaResetting ? "Resetting authenticator…" : "Reset authenticator"}</Button><small>Removes this employee&apos;s current authenticator so they can enroll a new one.</small></div></> : <><div className="employee-invite-note"><MailPlus size={14} /> Demo invitation address: <strong>{watch("email") || "Not set"}</strong>. No external email is sent by this local demo.</div><div className="permission-checklist"><strong>Role permissions</strong>{permissionOptions.map((permission) => <label key={permission} className="permission-check"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} /><span>{permission}</span></label>)}</div></>}<div className="inline-form-actions employee-editor-actions"><Button type="button" variant="ghost" className={employee.status === "Disabled" ? "reactivate-account-button" : "suspend-account-button"} onClick={onToggleStatus}>{employee.status === "Disabled" ? "Reactivate account" : "Suspend account"}</Button><Button type="submit" disabled={formState.isSubmitting}>Save employee</Button></div></motion.form>;
}

// TITLE: INVITE EMPLOYEE FORM
function InviteEmployee({ onCancel, onSave, roleOptions: availableRoleOptions = roleOptions }) {
  const { showToast } = useToast();
  const formApi = useForm({ resolver: zodResolver(employeeInviteSchema), defaultValues: { name: "", email: "", phone: "", role: availableRoleOptions.includes("Front Desk") ? "Front Desk" : availableRoleOptions[0] || "Front Desk", customRole: "" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const selectedRole = watch("role") === "Other / custom role" ? watch("customRole").trim() : watch("role");
  const handleInvite = async (form) => {
    if (!selectedRole) { setError("customRole", { message: "Enter a custom role." }); showToast({ variant: "error", title: "Invitation was not sent", message: "Enter a role before sending the invitation." }); return; }
    const savedEmployees = getDemoValue("employees");
    const employees = Array.isArray(savedEmployees) ? savedEmployees : [];
    const email = normalizeEmployeeEmail(form.email);
    const phone = normalizeEmployeePhone(form.phone);
    const ownerEmail = normalizeEmployeeEmail(getDemoSession().email);
    const ownerPhone = normalizeEmployeePhone(getDemoValue("profilePhone") || "+92 300 0000000");
    let hasBusinessError = false;
    if (employees.some((employee) => normalizeEmployeeEmail(employee.email) === email)) { setError("email", { message: "An employee with this email address is already registered." }); hasBusinessError = true; }
    else if (email === ownerEmail) { setError("email", { message: "This email address is already used by the owner or an employee." }); hasBusinessError = true; }
    if (phone && employees.some((employee) => normalizeEmployeePhone(employee.phone) === phone)) { setError("phone", { message: "An employee with this phone number is already registered." }); hasBusinessError = true; }
    else if (phone && phone === ownerPhone) { setError("phone", { message: "This phone number is already used by the owner or an employee." }); hasBusinessError = true; }
    if (hasBusinessError) {
      showToast({ variant: "error", title: "Invitation was not sent", message: "Please fix the highlighted email or phone number and try again." });
      return;
    }
    await onSave({ name: form.name, email, phone, role: selectedRole });
  };
  const error = (field) => formState.errors[field]?.message;
  return <motion.div className="inline-form-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="card-heading"><div><h2>Invite employee</h2><p className="muted-copy">Choose an active access role and send a secure Supabase invitation.</p></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input className={error("name") ? "has-error" : ""} {...register("name")} placeholder="Employee name" />{error("name") && <span className="lead-form-error">{error("name")}</span>}</label><label className="settings-label">Email<Input className={error("email") ? "has-error" : ""} type="email" {...register("email")} placeholder="employee@thecubicle.pk" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">Phone<Input className={error("phone") ? "has-error" : ""} {...register("phone")} placeholder="+92" />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><RoleSelect options={availableRoleOptions} value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true })} />{watch("role") === "Other / custom role" ? <label className="settings-label">Custom role<Input autoFocus className={error("customRole") ? "has-error" : ""} {...register("customRole")} placeholder="Type a role" />{!selectedRole && <span className="lead-form-error">Enter a custom role.</span>}</label> : null}</div><div className="inline-form-actions"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={formState.isSubmitting} onClick={handleSubmit(handleInvite)}><MailPlus size={15} /> {formState.isSubmitting ? "Sending..." : "Send invitation"}</Button></div></motion.div>;
}
// TITLE: EMPLOYEES AND ACCESS PAGE
export default function EmployeesPage() {
  const { showToast } = useToast();
  const canView = useHasPermission("employees.read");
  const canManage = useHasPermission("admin_users.manage");
  const supabaseEnabled = isSupabaseLeadsEnabled();
  const [employees, setEmployees] = useState([]);
  const [adminRoles, setAdminRoles] = useState([{ role_key: "owner", label: "Owner", description: "" }, { role_key: "editor", label: "Editor", description: "" }]);
  const [selected, setSelected] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [employeeView, setEmployeeView] = useState("active");

  useEffect(() => {
    const saved = getDemoValue("employees");
    if (Array.isArray(saved)) setEmployees(saved);
    if (!isSupabaseLeadsEnabled() || (!canView && !canManage)) return;
    void fetchSupabaseAdminUsers().then((rows) => {
      const remoteEmployees = rows.map(mapSupabaseAdminUserToOsEmployee);
      setEmployees(remoteEmployees);
      if (remoteEmployees.length) saveDemoValue("employees", remoteEmployees, { notify: false });
    }).catch((error) => {
      showToast({ variant: "error", title: "Users could not be loaded", message: error?.message || "Supabase did not return the admin users." });
    });
    if (canManage) {
      void fetchSupabaseAdminRoles().then((rows) => {
        if (rows.length) setAdminRoles(rows);
      }).catch((error) => {
        showToast({ variant: "error", title: "Roles could not be loaded", message: error?.message || "Supabase did not return the active roles." });
      });
    }
  }, [canManage, canView, showToast]);

  useEffect(() => {
    if (typeof window === "undefined" || !employees.length) return;
    const pendingUserId = window.sessionStorage.getItem("pending-mfa-reset-user");
    if (!pendingUserId) return;
    const target = employees.find((employee) => employee.userId === pendingUserId && employee.backend === "supabase");
    if (target) setSelected({ ...target, autoResetMfa: true });
  }, [employees]);

  // TITLE: EMPLOYEE ACTIONS
  const persist = (nextEmployees) => { setEmployees(nextEmployees); saveDemoValue("employees", nextEmployees); };
  const saveEmployee = async (employee, action = "permissions") => {
    try {
      if (employee.backend === "supabase") {
        const role = employee.roleKey || adminRoles.find((item) => item.label === employee.role)?.role_key;
        if (!role) throw new Error("Select a valid Supabase role.");
        const userId = employee.userId || employee.id;
        const emailChanged = normalizeEmployeeEmail(employee.email) !== normalizeEmployeeEmail(selected?.email);
        const emailRow = emailChanged ? await updateSupabaseAdminUserEmail(userId, employee.email) : null;
        const row = await updateSupabaseAdminUser(userId, role, employee.status !== "Disabled");
        const persistedEmployee = { ...mapSupabaseAdminUserToOsEmployee({ ...row, email: emailRow?.email || employee.email || row.email, full_name: emailRow?.full_name || row.full_name || employee.name, last_sign_in_at: emailRow?.last_sign_in_at || row.last_sign_in_at }), name: employee.name };
        persist(employees.map((item) => item.id === employee.id ? persistedEmployee : item));
        setSelected(null);
        showToast({ variant: "success", title: action === "status" ? "Account access updated" : "User role updated", message: `${persistedEmployee.email} was saved to Supabase.` });
        return;
      }
      persist(employees.map((item) => item.id === employee.id ? employee : item));
      setSelected(null);
      showToast({ variant: "success", title: action === "status" ? `Account ${employee.status === "Disabled" ? "suspended" : "reactivated"}` : "Employee access updated", message: action === "status" ? `${employee.name}'s account is ${employee.status === "Disabled" ? "now suspended" : "active again"}.` : `${employee.name}'s permissions were saved.` });
    } catch (error) {
      showToast({ variant: "error", title: "User access was not updated", message: error?.message || "Supabase could not save this user." });
    }
  };
  const toggleStatus = () => { const next = { ...selected, status: selected.status === "Disabled" ? "Active" : "Disabled", lastActivity: "Just now" }; void saveEmployee(next, "status"); };
  const invite = async (form) => {
    const email = normalizeEmployeeEmail(form.email);
    if (supabaseEnabled) {
      const selectedRole = adminRoles.find((role) => role.label === form.role);
      if (!selectedRole) {
        showToast({ variant: "error", title: "Invitation was not sent", message: "Choose an active Supabase role." });
        return;
      }
      try {
        const invited = await inviteSupabaseAdminUser({ name: form.name, email, phone: normalizeEmployeePhone(form.phone), roleKey: selectedRole.role_key });
        const persistedEmployee = mapSupabaseAdminUserToOsEmployee(invited);
        persist([persistedEmployee, ...employees.filter((employee) => employee.id !== persistedEmployee.id)]);
        setShowInvite(false);
        showToast({ variant: "success", title: "Invitation sent", message: `${email} was invited with the ${selectedRole.label} role.` });
      } catch (error) {
        showToast({ variant: "error", title: "Invitation was not sent", message: error?.message || "Supabase could not send the invitation." });
      }
      return;
    }
    const next = { ...form, email, id: `employee-${Date.now()}`, permissions: "Workspace access", status: "Pending invite", lastActivity: "Not started" };
    persist([next, ...employees]);
    setShowInvite(false);
    showToast({ variant: "success", title: "Invitation recorded", message: `The local demo invitation is addressed to ${next.email}.` });
  };
  const sortedEmployees = useMemo(() => [...employees].sort((a, b) => Number(a.status === "Disabled") - Number(b.status === "Disabled")), [employees]);
  const activeCount = employees.filter((employee) => employee.status !== "Disabled").length;
  const suspendedCount = employees.filter((employee) => employee.status === "Disabled").length;
  const visibleEmployees = sortedEmployees.filter((employee) => employeeView === "active" ? employee.status !== "Disabled" : employee.status === "Disabled");

  if (!canView && !canManage) return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employees & Access</h1><p className="muted-copy">Employee records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Employees — View access.</div></motion.div></PageShell>;

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employees & Access</h1><p className="muted-copy">Control who can access the OS and what they can change.</p></div>{canManage ? <Button onClick={() => setShowInvite(true)}><CirclePlus size={16} /> Add employee</Button> : <span className="read-only-label">View only</span>}</div><section className="stat-grid module-stats"><KpiCard icon={<CheckCircle2 size={18} />} label="Active employees" value={activeCount} detail="All access checks healthy" /><KpiCard icon={<MailPlus size={18} />} label="Pending invitations" value={employees.filter((employee) => employee.status === "Pending invite").length} detail="Waiting for setup" /><KpiCard icon={<ShieldAlert size={18} />} label="Suspended accounts" value={suspendedCount} detail="Access removed" /><KpiCard icon={<KeyRound size={18} />} label="Approval-required" value="3" detail="Finance edits protected" /></section><div className="section-heading"><div><h2>Employee directory</h2><p className="muted-copy">{canManage ? "Select an employee row to manage account access." : "Employee details are visible; account changes are restricted."}</p></div><div className="directory-view-toggle" role="group" aria-label="Employee status filter"><button className={employeeView === "active" ? "is-selected" : ""} type="button" onClick={() => setEmployeeView("active")}>Active ({activeCount})</button><button className={employeeView === "suspended" ? "is-selected" : ""} type="button" onClick={() => setEmployeeView("suspended")}>Suspended ({suspendedCount})</button></div></div><DataTable columns={createEmployeeColumns(canManage ? setSelected : () => undefined, canManage)} data={visibleEmployees} onRowClick={canManage ? setSelected : undefined} emptyMessage={employeeView === "active" ? "No active employees found." : "No suspended employees found."} /><Dialog open={showInvite && canManage} onClose={() => setShowInvite(false)} ariaLabel="Add employee"><InviteEmployee roleOptions={supabaseEnabled ? adminRoles.map((role) => role.label) : roleOptions} onCancel={() => setShowInvite(false)} onSave={invite} /></Dialog><Dialog open={Boolean(selected) && canManage} onClose={() => setSelected(null)} ariaLabel="Manage employee">{selected ? <EmployeeEditor employee={selected} adminRoles={adminRoles} onClose={() => setSelected(null)} onSave={saveEmployee} onToggleStatus={toggleStatus} autoResetMfa={selected.autoResetMfa === true} /> : null}</Dialog></motion.div></PageShell>;
}
