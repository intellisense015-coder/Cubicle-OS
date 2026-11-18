import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import {
  fetchSupabaseAdminRoles,
  fetchSupabaseAdminUsers,
  mapSupabaseAdminUserToOsEmployee,
  type SupabaseAdminRoleRow,
} from "@/lib/supabase/admin-users";

type EmployeeDataSource = "supabase" | "error";

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

export function isAssignableEmployee(employee: any) {
  const status = String(employee?.status || "").trim().toLowerCase();
  const invitationStatus = String(employee?.invitationStatus ?? employee?.invitation_status ?? "").trim().toLowerCase();
  return status === "active" && invitationStatus === "accepted" && Boolean(String(employee?.name || "").trim());
}

function errorMessage(error: unknown, resource: string) {
  const message = error instanceof Error ? error.message : "The saved data could not be loaded.";
  return `Could not load ${resource}: ${message}`;
}

export async function fetchEmployeesSnapshot(): Promise<EmployeeQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { employees: [], dataSource: "error", errorMessage: "Supabase is required for employee records." };
  }

  try {
    const rows = await fetchSupabaseAdminUsers();
    const employees = rows.map(mapSupabaseAdminUserToOsEmployee);
    return { employees, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      employees: [],
      dataSource: "error",
      errorMessage: errorMessage(error, "employees"),
    };
  }
}

export async function fetchEmployeeRolesSnapshot(): Promise<EmployeeRolesQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { roles: [], dataSource: "error", errorMessage: "Supabase is required for employee roles." };
  }

  try {
    const roles = await fetchSupabaseAdminRoles();
    return { roles, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      roles: [],
      dataSource: "error",
      errorMessage: errorMessage(error, "employee roles"),
    };
  }
}
