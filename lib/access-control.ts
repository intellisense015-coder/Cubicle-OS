import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetchCurrentPermission(permissionKey).then((value) => {
      if (mounted) setAllowed(value);
    }).catch(() => {
      if (mounted) setAllowed(false);
    });

    return () => { mounted = false; };
  }, [permissionKey]);

  return allowed;
}

export function useIsAdmin() {
  return useHasPermission("admin_users.manage");
}

export function useMaintenancePermissions() {
  const [permissions, setPermissions] = useState<MaintenancePermissions>(() => getMaintenancePermissions(null));

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const role = await fetchCurrentAdminRole();
        if (mounted) setPermissions(getMaintenancePermissions(role));
      } catch {
        // Fail closed if the authenticated role cannot be read.
        if (mounted) setPermissions(getMaintenancePermissions(null));
      }
    };

    void refresh();
    return () => { mounted = false; };
  }, []);

  return permissions;
}
