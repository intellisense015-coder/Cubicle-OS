"use client";

import { useEffect, useMemo, useState } from "react";
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
import { z } from "zod";

// TITLE: EMPLOYEE ROLE OPTIONS
const roleOptions = ["Front Desk", "Operations", "Finance", "Member support", "Community manager", "Sales", "Facilities", "HR", "Other / custom role"];
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
  role: z.string().min(1, "Choose a role."),
  permissions: z.array(z.string())
});

// TITLE: CUSTOM ROLE SELECT
function RoleSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-label lead-source-field"><span>Role</span><div className="lead-source-select-wrap"><button type="button" className="text-select lead-source-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{value}<ChevronDown size={14} /></button>{open && <div className="lead-source-menu">{roleOptions.map((role) => <button type="button" key={role} className={value === role ? "is-selected" : ""} onClick={() => { onChange(role); setOpen(false); }}>{role}</button>)}</div>}</div></div>;
}

// TITLE: EMPLOYEE TABLE
function createEmployeeColumns(onManage) {
  const columnHelper = createColumnHelper<any>();
  return [columnHelper.accessor("name", { header: "Employee", cell: ({ row }) => <div className="table-primary"><strong>{row.original.name}</strong><span>{row.original.email}</span></div> }), columnHelper.accessor("role", { header: "Role" }), columnHelper.accessor("status", { header: "Account status", cell: ({ getValue }) => { const status = getValue(); return <span className={`status-tag status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status === "Disabled" ? "Suspended" : status}</span>; } }), columnHelper.accessor("lastActivity", { header: "Last activity" }), columnHelper.display({ id: "actions", header: "Action", cell: ({ row }) => <button className="action-icon-btn" type="button" onClick={() => onManage(row.original)} aria-label={`Manage ${row.original.name}`} title="Manage"><UserRoundCog size={16} /></button> })];
}

// TITLE: EMPLOYEE ACCESS EDITOR
function EmployeeEditor({ employee, onClose, onSave, onToggleStatus }) {
  const permissionOptions = ["Workspace access", "Leads", "Members & companies", "Visits", "Floor plan", "Workspaces", "Invoices", "Employees & access", "Approvals & alerts", "Settings", "Email templates", "Profile & security"];
  const formApi = useForm({ resolver: zodResolver(employeeEditorSchema), defaultValues: { role: employee.role, permissions: employee.permissions.split(" · ").filter(Boolean) }, mode: "onBlur" });
  const { handleSubmit, setValue, watch, formState } = formApi;
  const permissions = watch("permissions");
  const onSubmit = (values) => onSave({ ...employee, role: values.role, permissions: values.permissions.join(" · "), lastActivity: "Just now" });
  const togglePermission = (permission) => setValue("permissions", permissions.includes(permission) ? permissions.filter((item) => item !== permission) : [...permissions, permission], { shouldDirty: true });
  return <motion.form className="inline-form-card employee-editor-form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit(onSubmit)}><div className="card-heading"><div><h2>{employee.name}</h2><p className="muted-copy">{employee.email}</p></div></div><div className="inline-form-grid"><RoleSelect value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true, shouldValidate: true })} /></div><div className="permission-checklist"><strong>Role permissions</strong>{permissionOptions.map((permission) => <label key={permission} className="permission-check"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} /><span>{permission}</span></label>)}</div><div className="inline-form-actions employee-editor-actions"><Button type="button" variant="ghost" className={employee.status === "Disabled" ? "reactivate-account-button" : "suspend-account-button"} onClick={onToggleStatus}>{employee.status === "Disabled" ? "Reactivate account" : "Suspend account"}</Button><Button type="submit" disabled={formState.isSubmitting}>Save permissions</Button></div></motion.form>;
}

// TITLE: INVITE EMPLOYEE FORM
function InviteEmployee({ onCancel, onSave }) {
  const { showToast } = useToast();
  const formApi = useForm({ resolver: zodResolver(employeeInviteSchema), defaultValues: { name: "", email: "", phone: "", role: "Front Desk", customRole: "" }, mode: "onBlur" });
  const { register, handleSubmit, setError, setValue, watch, formState } = formApi;
  const selectedRole = watch("role") === "Other / custom role" ? watch("customRole").trim() : watch("role");
  const handleInvite = (form) => {
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
    onSave({ name: form.name, email: form.email, phone: form.phone, role: selectedRole });
  };
  const error = (field) => formState.errors[field]?.message;
  return <motion.div className="inline-form-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="card-heading"><div><h2>Invite employee</h2><p className="muted-copy">Choose a role or type a custom role for this demo.</p></div></div><div className="inline-form-grid"><label className="settings-label">Name<Input className={error("name") ? "has-error" : ""} {...register("name")} placeholder="Employee name" />{error("name") && <span className="lead-form-error">{error("name")}</span>}</label><label className="settings-label">Email<Input className={error("email") ? "has-error" : ""} type="email" {...register("email")} placeholder="employee@thecubicle.pk" />{error("email") && <span className="lead-form-error">{error("email")}</span>}</label><label className="settings-label">Phone<Input className={error("phone") ? "has-error" : ""} {...register("phone")} placeholder="+92" />{error("phone") && <span className="lead-form-error">{error("phone")}</span>}</label><RoleSelect value={watch("role")} onChange={(role) => setValue("role", role, { shouldDirty: true })} />{watch("role") === "Other / custom role" ? <label className="settings-label">Custom role<Input autoFocus className={error("customRole") ? "has-error" : ""} {...register("customRole")} placeholder="Type a role" />{!selectedRole && <span className="lead-form-error">Enter a custom role.</span>}</label> : null}</div><div className="inline-form-actions"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={formState.isSubmitting} onClick={handleSubmit(handleInvite)}><MailPlus size={15} /> {formState.isSubmitting ? "Sending..." : "Send invitation"}</Button></div></motion.div>;
}
// TITLE: EMPLOYEES AND ACCESS PAGE
export default function EmployeesPage() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => { const saved = getDemoValue("employees"); if (Array.isArray(saved)) setEmployees(saved); }, []);

  // TITLE: EMPLOYEE ACTIONS
  const persist = (nextEmployees) => { setEmployees(nextEmployees); saveDemoValue("employees", nextEmployees); };
  const saveEmployee = (employee, action = "permissions") => { persist(employees.map((item) => item.id === employee.id ? employee : item)); setSelected(null); showToast({ variant: "success", title: action === "status" ? `Account ${employee.status === "Disabled" ? "suspended" : "reactivated"}` : "Employee access updated", message: action === "status" ? `${employee.name}'s account is ${employee.status === "Disabled" ? "now suspended" : "active again"}.` : `${employee.name}'s permissions were saved.` }); };
  const toggleStatus = () => { const next = { ...selected, status: selected.status === "Disabled" ? "Active" : "Disabled", lastActivity: "Just now" }; saveEmployee(next, "status"); };
  const invite = (form) => { const next = { ...form, id: `employee-${Date.now()}`, permissions: "Workspace access", status: "Pending invite", lastActivity: "Not started" }; persist([next, ...employees]); setShowInvite(false); showToast({ variant: "success", title: "Invitation sent", message: `${next.name} can now set up their account.` }); };
  const sortedEmployees = useMemo(() => [...employees].sort((a, b) => Number(a.status === "Disabled") - Number(b.status === "Disabled")), [employees]);

  return <PageShell><motion.div className="module-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><div className="module-header"><div><h1>Employees & Access</h1><p className="muted-copy">Control who can access the OS and what they can change.</p></div><Button onClick={() => setShowInvite(true)}><CirclePlus size={16} /> Add employee</Button></div><section className="stat-grid module-stats"><KpiCard icon={<CheckCircle2 size={18} />} label="Active employees" value={employees.filter((employee) => employee.status === "Active").length} detail="All access checks healthy" /><KpiCard icon={<MailPlus size={18} />} label="Pending invitations" value={employees.filter((employee) => employee.status === "Pending invite").length} detail="Waiting for setup" /><KpiCard icon={<ShieldAlert size={18} />} label="Suspended accounts" value={employees.filter((employee) => employee.status === "Disabled").length} detail="Access removed" /><KpiCard icon={<KeyRound size={18} />} label="Approval-required" value="3" detail="Finance edits protected" /></section><div className="section-heading"><div><h2>Employee directory</h2><p className="muted-copy">Select an employee row to manage account access.</p></div></div><DataTable columns={createEmployeeColumns(setSelected)} data={sortedEmployees} onRowClick={setSelected} /><Dialog open={showInvite} onClose={() => setShowInvite(false)} ariaLabel="Add employee"><InviteEmployee onCancel={() => setShowInvite(false)} onSave={invite} /></Dialog><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} ariaLabel="Manage employee">{selected ? <EmployeeEditor employee={selected} onClose={() => setSelected(null)} onSave={saveEmployee} onToggleStatus={toggleStatus} /> : null}</Dialog></motion.div></PageShell>;
}
