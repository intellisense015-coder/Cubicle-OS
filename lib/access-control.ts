import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export const ADMIN_ROLES = new Set(["owner", "admin", "administrator", "workspace admin"]);

export type MaintenancePermissions = {
  canReport: boolean;
  canStart: boolean;
  canResolve: boolean;
  canCancel: boolean;
};

export function getMaintenancePermissions(role: unknown): MaintenancePermissions {
  const normalized = String(role || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (["owner", "admin", "administrator", "workspace admin", "manager", "operations", "technician"].includes(normalized)) {
    return { canReport: true, canStart: true, canResolve: true, canCancel: true };
  }
  if (normalized === "front desk" || normalized === "member support") {
    return { canReport: true, canStart: false, canResolve: false, canCancel: false };
  }
  return { canReport: false, canStart: false, canResolve: false, canCancel: false };
}

export function hasAdminAccess(role: unknown) {
  return ADMIN_ROLES.has(String(role || "").trim().toLowerCase().replace(/[_-]+/g, " "));
}

async function fetchCurrentAdminRole() {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data, error } = await supabase.rpc("get_my_admin_role");
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export function useIsOwner() {
  const roleQuery = useQuery({
    queryKey: queryKeys.adminRole.all,
    queryFn: fetchCurrentAdminRole,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return String(roleQuery.data || "").trim().toLowerCase() === "owner";
}

async function fetchCurrentPermission(permissionKey: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return false;

  const { data, error } = await supabase.rpc("is_permission_granted", {
    p_permission_key: permissionKey,
  });
  if (error) throw error;
  return data === true;
}

export function useHasPermission(permissionKey: string) {
  const permissionQuery = useQuery({
    queryKey: queryKeys.permissions.byKey(permissionKey),
    queryFn: () => fetchCurrentPermission(permissionKey),
    // Permission caches are intentionally shorter than business-data caches.
    // RLS remains the authorization boundary; this only prevents duplicate UI checks.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return permissionQuery.data === true;
}

export function useIsAdmin() {
  return useHasPermission("admin_users.manage");
}

export function useMaintenancePermissions() {
  const roleQuery = useQuery({
    queryKey: queryKeys.adminRole.all,
    queryFn: fetchCurrentAdminRole,
    // Role changes should be noticed quickly without an RPC per component mount.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  // Fail closed while loading or when the role cannot be read.
  return getMaintenancePermissions(roleQuery.data);
}
