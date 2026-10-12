import { useEffect, useState } from "react";
import { getDemoValue } from "@/lib/demo-session";

export const ADMIN_ROLES = new Set(["owner", "admin", "administrator", "workspace admin"]);

export function hasAdminAccess(role: unknown) {
  return ADMIN_ROLES.has(String(role || "").trim().toLowerCase());
}

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const refresh = () => setIsAdmin(hasAdminAccess(getDemoValue("demoRole") || "Owner"));
    refresh();
    const handleChange = (event: CustomEvent<{ key?: string }>) => {
      if (event.detail?.key === "demoRole") refresh();
    };
    window.addEventListener("cubicle-demo-change", handleChange as EventListener);
    return () => window.removeEventListener("cubicle-demo-change", handleChange as EventListener);
  }, []);

  return isAdmin === true;
}
