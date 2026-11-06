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

async function fetchCurrentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.user.id || null;
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

export function usePermissionStatus(permissionKey: string) {
  const userQuery = useQuery({
    queryKey: ["auth", "current-user"],
    queryFn: fetchCurrentUserId,
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const permissionQuery = useQuery({
    // Include the authenticated user in the cache key. Without this, a
    // browser switching from an owner account to an employee can reuse the
    // owner's cached true permission result.
    queryKey: queryKeys.permissions.byUserAndKey(userQuery.data || "anonymous", permissionKey),
    queryFn: () => fetchCurrentPermission(permissionKey),
    enabled: Boolean(userQuery.data),
    // Permission caches are intentionally shorter than business-data caches.
    // RLS remains the authorization boundary; this only prevents duplicate UI checks.
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    allowed: permissionQuery.data === true,
    isLoading: userQuery.isLoading || permissionQuery.isLoading,
  };
}

export function useHasPermission(permissionKey: string) {
  return usePermissionStatus(permissionKey).allowed;
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

const OS_ROUTE_PERMISSIONS: Record<string, string> = {
  "/dashboard": "dashboard.read",
  "/leads": "leads.read",
  "/leads/follow-ups": "leads.followups.read",
  "/leads/activity": "leads.activity.read",
  "/leads/journey": "leads.journey.read",
  "/visits": "visits.read",
  "/visits/upcoming": "visits.read",
  "/visits/history": "visits.read",
  "/members": "members.read",
  "/companies": "companies.read",
  "/maintenance": "maintenance_categories.read",
  "/maintenance/requests": "maintenance_categories.read",
  "/maintenance/categories": "maintenance_categories.read",
  "/workspaces": "workspaces.read",
  "/floor-plan": "workspaces.read",
  "/invoices": "invoices.read",
  "/quotations": "quotations.read",
  "/proposals": "proposals.read",
  "/employees": "admin_users.read",
  "/approvals": "approvals.read",
  "/email-templates": "email_templates.read",
  "/settings": "settings.read",
};

export function getOsRoutePermission(href: string) {
  return OS_ROUTE_PERMISSIONS[href];
}

export function useOsNavigationPermissions() {
  const dashboard = useHasPermission("dashboard.read");
  const leads = useHasPermission("leads.read");
  const leadFollowUps = useHasPermission("leads.followups.read");
  const leadActivity = useHasPermission("leads.activity.read");
  const leadJourney = useHasPermission("leads.journey.read");
  const visits = useHasPermission("visits.read");
  const members = useHasPermission("members.read");
  const companies = useHasPermission("companies.read");
  const maintenance = useHasPermission("maintenance_categories.read");
  const workspaces = useHasPermission("workspaces.read");
  const invoices = useHasPermission("invoices.read");
  const quotations = useHasPermission("quotations.read");
  const proposals = useHasPermission("proposals.read");
  const employees = useHasPermission("admin_users.read");
  const approvals = useHasPermission("approvals.read");
  const emailTemplates = useHasPermission("email_templates.read");
  const settings = useHasPermission("settings.read");

  return {
    dashboard,
    leads,
    leadFollowUps,
    leadActivity,
    leadJourney,
    visits,
    members,
    companies,
    maintenance,
    workspaces,
    invoices,
    quotations,
    proposals,
    employees,
    approvals,
    emailTemplates,
    settings,
  };
}
