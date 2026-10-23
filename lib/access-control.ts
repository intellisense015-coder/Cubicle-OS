import { useEffect, useState } from "react";
import { getDemoValue } from "@/lib/demo-session";

export const ADMIN_ROLES = new Set(["owner", "admin", "administrator", "workspace admin"]);

export type MaintenancePermissions = {
  canReport: boolean;
  canStart: boolean;
  canResolve: boolean;
  canCancel: boolean;
};

export function getDemoRole() {
  return String(getDemoValue("demoRole") || "Owner").trim();
}

export function getMaintenancePermissions(role: unknown): MaintenancePermissions {
  const normalized = String(role || "owner").trim().toLowerCase();
  if (["owner", "admin", "administrator", "workspace admin", "manager", "operations", "technician"].includes(normalized)) {
    return { canReport: true, canStart: true, canResolve: true, canCancel: true };
  }
  if (normalized === "front desk" || normalized === "member support") {
    return { canReport: true, canStart: false, canResolve: false, canCancel: false };
  }
  return { canReport: false, canStart: false, canResolve: false, canCancel: false };
}

export function hasAdminAccess(role: unknown) {
  return ADMIN_ROLES.has(String(role || "").trim().toLowerCase());
}

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const refresh = () => setIsAdmin(hasAdminAccess(getDemoRole()));
    refresh();
    const handleChange = (event: CustomEvent<{ key?: string }>) => {
      if (event.detail?.key === "demoRole") refresh();
    };
    window.addEventListener("cubicle-demo-change", handleChange as EventListener);
    return () => window.removeEventListener("cubicle-demo-change", handleChange as EventListener);
  }, []);

  return isAdmin === true;
}

export function useMaintenancePermissions() {
  const [permissions, setPermissions] = useState<MaintenancePermissions>(() => getMaintenancePermissions(getDemoRole()));

  useEffect(() => {
    const refresh = () => setPermissions(getMaintenancePermissions(getDemoRole()));
    refresh();
    const handleChange = () => refresh();
    window.addEventListener("cubicle-demo-change", handleChange);
    return () => window.removeEventListener("cubicle-demo-change", handleChange);
  }, []);

  return permissions;
}
