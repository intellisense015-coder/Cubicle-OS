"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import { motion } from "motion/react";
import { CheckCircle2, ChevronDown, CirclePlus, KeyRound, MailPlus, ShieldAlert, UserRoundCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDemoSession, getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { useToast } from "@/components/ui/toast-provider";
import { getSupabaseBrowserClient, isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { inviteSupabaseAdminUser, mapSupabaseAdminUserToOsEmployee, updateSupabaseAdminUser, updateSupabaseAdminUserProfile } from "@/lib/supabase/admin-users";
import { useHasPermission } from "@/lib/access-control";
import { z } from "zod";
import { queryKeys } from "@/lib/query-keys";
import { fetchEmployeeRolesSnapshot, fetchEmployeesSnapshot, fallbackAdminRoles, type EmployeeQuerySnapshot } from "@/lib/employee-query";
import { fetchApprovalsSnapshot } from "@/lib/approval-query";

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
  name: z.string().trim().min(1, "Enter the employee's name."),
  email: z.string().trim().email("Enter a valid invitation email address."),
  phone: z.string().optional(),
  role: z.string().min(1, "Choose a role.")
});

// TITLE: CUSTOM ROLE SELECT
function RoleSelect({ value, onChange, options = roleOptions }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>Access role</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{options.map((role) => <button type="button" key={role} className={value === role ? "is-selected" : ""} onClick={() => { onChange(role); setOpen(false); }}>{role}</button>)}</div>}</div></div>;
}

// TITLE: EMPLOYEE TABLE
function createEmployeeColumns(onManage, canManage) {
  const columnHelper = createColumnHelper<any>();
  return [
    columnHelper.accessor("name", { header: "Employee Name", cell: ({ getValue }) => <strong>{getValue()}</strong> }),
    columnHelper.accessor("email", { header: "Email" }),
    columnHelper.accessor("phone", { header: "Phone Number", cell: ({ getValue }) => getValue() || "—" }),
    columnHelper.accessor("role", { header: "Role" }),
    columnHelper.accessor("status", { header: "Account Status", cell: ({ getValue }) => { const status = getValue(); return <span className={`status-tag status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status === "Disabled" ? "Suspended" : status}</span>; } }),
    columnHelper.accessor("lastActivity", { header: "Last Activity", cell: ({ getValue }) => formatEmployeeLastActivity(getValue()) }),
    columnHelper.display({ id: "actions", header: "Actions", cell: ({ row }) => canManage ? <button className="action-icon-btn" type="button" onClick={() => onManage(row.original)} aria-label={`Manage access for ${row.original.name}`} title="Manage access"><UserRoundCog size={16} /></button> : <span className="read-only-label">Read only</span> }),
  ];
}

function formatEmployeeLastActivity(value) {
  const normalized = String(value || "").trim();
  if (!normalized || ["Not available", "Not started", "Just now"].includes(normalized)) return normalized || "Not available";

  const todayMatch = normalized.match(/^Today,\s*(\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
  if (todayMatch) {
    const today = new Date();
    const [time, meridiem] = todayMatch[1].toUpperCase().split(/\s+/);
    const [hours, minutes] = time.split(":").map(Number);
    let hour = hours;
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    today.setHours(hour, minutes, 0, 0);
    return formatEmployeeTimestamp(today);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : formatEmployeeTimestamp(parsed);
}

function formatEmployeeTimestamp(value) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(value);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).format(value).toLowerCase();
  return `${date}, ${time}`;
}

function EmployeeEditor({ employee, adminRoles, onSave, onToggleStatus }) {
  const isSupabaseUser = employee.backend === "supabase";
  const [statusSaving, setStatusSaving] = useState(false);
  const formApi = useForm({ resolver: zodResolver(employeeEditorSchema), defaultValues: { name: employee.name || "", email: employee.email || "", phone: employee.phone || "", role: employee.role }, mode: "onBlur" });
  const { handleSubmit, register, setValue, watch, formState } = formApi;
  const selectedRoleKey = adminRoles.find((role) => role.label === watch("role"))?.role_key || employee.roleKey;
  const onSubmit = async (values) => {
    const selectedRole = adminRoles.find((role) => role.label === values.role);
    await onSave({ ...employee, name: values.name.trim(), email: normalizeEmployeeEmail(values.email), phone: normalizeEmployeePhone(values.phone), role: values.role, roleKey: selectedRole?.role_key || employee.roleKey, lastActivity: "Just now" });
  };
  const handleToggleStatus = async () => {
    if (statusSaving || formState.isSubmitting) return;
    setStatusSaving(true);
    try { await onToggleStatus(); } finally { setStatusSaving(false); }
  };
  const emailError = formState.errors.email?.message;
  return <motion.form className="inline-form-card employee-editor-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(onSubmit)}><div className="card-heading"><div><h2>{employee.name}</h2><p className="muted-copy">{isSupabaseUser ? "Update this employee’s identity and account access." : "Update the employee details before saving this account."}</p></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input {...register("name")} /></label><label className="settings-label">Email<Input className={emailError ? "has-error" : ""} type="email" {...register("email")} disabled={isSupabaseUser && selectedRoleKey === "owner"} />{emailError && <span className="lead-form-error">{emailError}</span>}</label><label className="settings-label">Phone number<Input {...register("phone")} placeholder="+92" /></label><RoleSelect options={isSupabaseUser ? adminRoles.map((role) => role.label) : roleOptions} value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true, shouldValidate: true })} /></div><div className="inline-form-actions employee-editor-actions"><Button type="button" variant="ghost" loading={statusSaving} disabled={formState.isSubmitting} className={employee.status === "Disabled" ? "reactivate-account-button" : "suspend-account-button"} onClick={handleToggleStatus}>{employee.status === "Disabled" ? "Reactivate account" : "Suspend account"}</Button><Button type="submit" loading={formState.isSubmitting}>Save employee</Button></div></motion.form>;
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
  return <motion.div className="inline-form-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="card-heading"><div><h2>Invite employee</h2><p className="muted-copy">Choose an active access role and send a secure Supabase invitation.</p></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input className={error("name") ? "has-error" : ""} {...register("name")} placeholder="Employee name" />{error("name") && <span className="lead-form-error">{error("name")}</span>}</label><label className="settings-label">Email<Input className={error("email") ? "has-error" : ""} type="email" {...register("email")} placeholder="employee@thecubicle.pk" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">Phone<Input className={error("phone") ? "has-error" : ""} {...register("phone")} placeholder="+92" />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><RoleSelect options={availableRoleOptions} value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true })} />{watch("role") === "Other / custom role" ? <label className="settings-label">Custom role<Input autoFocus className={error("customRole") ? "has-error" : ""} {...register("customRole")} placeholder="Type a role" />{!selectedRole && <span className="lead-form-error">Enter a custom role.</span>}</label> : null}</div><div className="inline-form-actions"><Button variant="ghost" onClick={onCancel} disabled={formState.isSubmitting}>Cancel</Button><Button loading={formState.isSubmitting} onClick={handleSubmit(handleInvite)}><MailPlus size={15} /> Send invitation</Button></div></motion.div>;
}
// TITLE: EMPLOYEES AND ACCESS PAGE
export default function EmployeesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canView = useHasPermission("employees.read");
  const canManage = useHasPermission("admin_users.manage");
  const supabaseEnabled = isSupabaseLeadsEnabled();
  const [employees, setEmployees] = useState(() => {
    const saved = getDemoValue("employees");
    return Array.isArray(saved) ? saved : [];
  });
  const [adminRoles, setAdminRoles] = useState(fallbackAdminRoles);
  const [selected, setSelected] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [employeeView, setEmployeeView] = useState("active");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState(() => normalizeEmployeeEmail(getDemoSession().email));

  useEffect(() => {
    if (!supabaseEnabled) return undefined;
    let mounted = true;
    void getSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setCurrentUserId(data.user?.id || "");
      setCurrentUserEmail(normalizeEmployeeEmail(data.user?.email || getDemoSession().email));
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [supabaseEnabled]);

  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.all,
    queryFn: fetchEmployeesSnapshot,
    enabled: canView || canManage,
  });
  const rolesQuery = useQuery({
    queryKey: queryKeys.employees.roles,
    queryFn: fetchEmployeeRolesSnapshot,
    enabled: canManage,
  });
  const approvalsQuery = useQuery({
    queryKey: queryKeys.approvals.all,
    queryFn: fetchApprovalsSnapshot,
  });

  useEffect(() => {
    if (!employeesQuery.data) return;
    setEmployees(employeesQuery.data.employees);
    if (employeesQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Users could not be loaded", message: "Showing the saved employee data." });
    }
  }, [employeesQuery.data, showToast]);

  useEffect(() => {
    if (!rolesQuery.data) return;
    setAdminRoles(rolesQuery.data.roles);
    if (rolesQuery.data.errorMessage) {
      showToast({ variant: "error", title: "Roles could not be loaded", message: "Showing the available fallback roles." });
    }
  }, [rolesQuery.data, showToast]);

  // TITLE: EMPLOYEE ACTIONS
  const persist = (nextEmployees) => {
    setEmployees(nextEmployees);
    queryClient.setQueryData<EmployeeQuerySnapshot>(queryKeys.employees.all, (current) => ({
      ...(current || { dataSource: supabaseEnabled ? "supabase" : "demo", errorMessage: "" }),
      employees: nextEmployees,
      errorMessage: "",
    }));
    saveDemoValue("employees", nextEmployees);
  };
  const saveEmployee = async (employee, action = "profile") => {
    try {
      if (employee.backend === "supabase") {
        const role = employee.roleKey || adminRoles.find((item) => item.label === employee.role)?.role_key;
        if (!role) throw new Error("Select a valid Supabase role.");
        const userId = employee.userId || employee.id;
        const emailChanged = normalizeEmployeeEmail(employee.email) !== normalizeEmployeeEmail(selected?.email);
        const nameChanged = String(employee.name || "").trim() !== String(selected?.name || "").trim();
        const phoneChanged = normalizeEmployeePhone(employee.phone) !== normalizeEmployeePhone(selected?.phone);
        const profileRow = emailChanged || nameChanged || phoneChanged
          ? await updateSupabaseAdminUserProfile(userId, {
            ...(emailChanged ? { email: employee.email } : {}),
            ...(nameChanged ? { fullName: employee.name } : {}),
            ...(phoneChanged ? { phone: normalizeEmployeePhone(employee.phone) } : {}),
          })
          : null;
        const row = await updateSupabaseAdminUser(userId, role, employee.status !== "Disabled");
        const persistedEmployee = { ...mapSupabaseAdminUserToOsEmployee({ ...row, email: profileRow?.email || employee.email || row.email, phone: profileRow?.phone || employee.phone || row.phone, full_name: profileRow?.full_name || row.full_name || employee.name, last_sign_in_at: profileRow?.last_sign_in_at || row.last_sign_in_at }), name: employee.name, phone: normalizeEmployeePhone(employee.phone) };
        persist(employees.map((item) => item.id === employee.id ? persistedEmployee : item));
        setSelected(null);
        showToast({ variant: "success", title: action === "status" ? "Account access updated" : "User role updated", message: `${persistedEmployee.email} was updated successfully.` });
        return;
      }
      persist(employees.map((item) => item.id === employee.id ? employee : item));
      setSelected(null);
      showToast({ variant: "success", title: action === "status" ? `Account ${employee.status === "Disabled" ? "suspended" : "reactivated"}` : "Employee profile updated", message: action === "status" ? `${employee.name}'s account is ${employee.status === "Disabled" ? "now suspended" : "active again"}.` : `${employee.name}'s profile was saved.` });
    } catch (error) {
      showToast({ variant: "error", title: "User access was not updated", message: error?.message || "The user account could not be updated." });
    }
  };
  const toggleStatus = () => { const next = { ...selected, status: selected.status === "Disabled" ? "Active" : "Disabled", lastActivity: "Just now" }; void saveEmployee(next, "status"); };
  const invite = async (form) => {
    const email = normalizeEmployeeEmail(form.email);
    if (supabaseEnabled) {
      const selectedRole = adminRoles.find((role) => role.label === form.role);
      if (!selectedRole) {
        showToast({ variant: "error", title: "Invitation was not sent", message: "Choose an active role." });
        return;
      }
      try {
        const invited = await inviteSupabaseAdminUser({ name: form.name, email, phone: normalizeEmployeePhone(form.phone), roleKey: selectedRole.role_key });
        const persistedEmployee = mapSupabaseAdminUserToOsEmployee(invited);
        persist([persistedEmployee, ...employees.filter((employee) => employee.id !== persistedEmployee.id)]);
        setShowInvite(false);
        showToast({ variant: "success", title: "Invitation sent", message: `${email} was invited with the ${selectedRole.label} role.` });
      } catch (error) {
      showToast({ variant: "error", title: "Invitation was not sent", message: error?.message || "The invitation could not be sent." });
      }
      return;
    }
    const next = { ...form, email, id: `employee-${Date.now()}`, permissions: "Workspace access", status: "Pending invite", lastActivity: "Not started" };
    persist([next, ...employees]);
    setShowInvite(false);
    showToast({ variant: "success", title: "Invitation recorded", message: `The local demo invitation is addressed to ${next.email}.` });
  };
  const employeesWithoutCurrentUser = useMemo(() => employees.filter((employee) => {
    const employeeId = String(employee.userId || employee.id || "");
    const employeeEmail = normalizeEmployeeEmail(employee.email);
    const isCurrentUser = Boolean(currentUserId && employeeId === currentUserId) || Boolean(currentUserEmail && employeeEmail === currentUserEmail);
    return !isCurrentUser;
  }), [currentUserEmail, currentUserId, employees]);
  const sortedEmployees = useMemo(() => [...employeesWithoutCurrentUser].sort((a, b) => Number(a.status === "Disabled") - Number(b.status === "Disabled")), [employeesWithoutCurrentUser]);
  const activeCount = employeesWithoutCurrentUser.filter((employee) => employee.status !== "Disabled").length;
  const suspendedCount = employeesWithoutCurrentUser.filter((employee) => employee.status === "Disabled").length;
  const approvalRequiredCount = useMemo(
    () => (approvalsQuery.data?.approvals || []).filter((approval) => approval.status === "Pending").length,
    [approvalsQuery.data?.approvals],
  );
  const visibleEmployees = sortedEmployees.filter((employee) => employeeView === "active" ? employee.status !== "Disabled" : employee.status === "Disabled");

  if (!canView && !canManage) return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employees & Access</h1><p className="muted-copy">Employee records are restricted for this account.</p></div><span className="read-only-label">No view access</span></div><div className="table-empty-state">Ask an owner or administrator to grant Employees — View access.</div></motion.div>;

  return <motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employees & Access</h1><p className="muted-copy">Control who can access the OS and what they can change.</p></div>{canManage ? <Button onClick={() => setShowInvite(true)}><CirclePlus size={16} /> Add employee</Button> : <span className="read-only-label">View only</span>}</div><section className="stat-grid module-stats"><KpiCard icon={<CheckCircle2 size={18} />} label="Active employees" value={activeCount} detail="All access checks healthy" /><KpiCard icon={<MailPlus size={18} />} label="Pending invitations" value={employees.filter((employee) => employee.status === "Pending invite").length} detail="Waiting for setup" /><KpiCard icon={<ShieldAlert size={18} />} label="Suspended accounts" value={suspendedCount} detail="Access removed" /><KpiCard icon={<KeyRound size={18} />} label="Approval-required" value={approvalRequiredCount} detail="Pending owner approvals" /></section><div className="section-heading"><div><h2>Employee directory</h2><p className="muted-copy">{canManage ? "Select an employee row to edit details. Use the access action to manage permissions." : "Employee details are visible; account changes are restricted."}</p></div><div className="directory-view-toggle" role="group" aria-label="Employee status filter"><button className={employeeView === "active" ? "is-selected" : ""} type="button" onClick={() => setEmployeeView("active")}>Active ({activeCount})</button><button className={employeeView === "suspended" ? "is-selected" : ""} type="button" onClick={() => setEmployeeView("suspended")}>Suspended ({suspendedCount})</button></div></div><DataTable columns={createEmployeeColumns(canManage ? (employee) => router.push(`/employees/${encodeURIComponent(employee.id)}/access`) : () => undefined, canManage)} data={visibleEmployees} onRowClick={canManage ? setSelected : undefined} emptyMessage={employeeView === "active" ? "No active employees found." : "No suspended employees found."} /><Dialog open={showInvite && canManage} onClose={() => setShowInvite(false)} ariaLabel="Add employee"><InviteEmployee roleOptions={supabaseEnabled ? adminRoles.map((role) => role.label) : roleOptions} onCancel={() => setShowInvite(false)} onSave={invite} /></Dialog><Dialog open={Boolean(selected) && canManage} onClose={() => setSelected(null)} ariaLabel="Manage employee">{selected ? <EmployeeEditor employee={selected} adminRoles={adminRoles} onSave={saveEmployee} onToggleStatus={toggleStatus} /> : null}</Dialog></motion.div>;
}
