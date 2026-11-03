import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import {
  fetchSupabaseAdminRoles,
  fetchSupabaseAdminUsers,
  mapSupabaseAdminUserToOsEmployee,
  type SupabaseAdminRoleRow,
} from "@/lib/supabase/admin-users";

type EmployeeDataSource = "supabase" | "demo";

export type EmployeeQuerySnapshot = {
  employees: any[];
  dataSource: EmployeeDataSource;
  errorMessage: string;
};

export type EmployeeRolesQuerySnapshot = {
  roles: SupabaseAdminRoleRow[];
  dataSource: EmployeeDataSource;
  errorMessage: string;
};

export const fallbackAdminRoles: SupabaseAdminRoleRow[] = [
  { role_key: "owner", label: "Owner", description: "" },
  { role_key: "editor", label: "Editor", description: "" },
];

function cachedEmployees() {
  const saved = getDemoValue("employees");
  return Array.isArray(saved) ? saved : [];
}

function errorMessage(error: unknown, resource: string) {
  const message = error instanceof Error ? error.message : "The saved data could not be loaded.";
  return `Supabase could not load ${resource}: ${message}`;
}

export async function fetchEmployeesSnapshot(): Promise<EmployeeQuerySnapshot> {
  const cached = cachedEmployees();
  if (!isSupabaseLeadsEnabled()) {
    return { employees: cached, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseAdminUsers();
    const employees = rows.map(mapSupabaseAdminUserToOsEmployee);
    if (employees.length) saveDemoValue("employees", employees, { notify: false });
    return { employees, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      employees: cached,
      dataSource: "demo",
      errorMessage: errorMessage(error, "employees"),
    };
  }
}

export async function fetchEmployeeRolesSnapshot(): Promise<EmployeeRolesQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { roles: fallbackAdminRoles, dataSource: "demo", errorMessage: "" };
  }

  try {
    const roles = await fetchSupabaseAdminRoles();
    return { roles: roles.length ? roles : fallbackAdminRoles, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      roles: fallbackAdminRoles,
      dataSource: "demo",
      errorMessage: errorMessage(error, "employee roles"),
    };
  }
}
