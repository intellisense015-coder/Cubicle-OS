import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseAdminUserRow = {
  user_id: string;
  email: string | null;
  full_name?: string | null;
  role: string;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

export type SupabaseAdminRoleRow = {
  role_key: string;
  label: string;
  description: string;
};

export type SupabaseAdminRolePermissionRow = {
  permission_key: string;
  label: string;
  description: string;
  granted: boolean;
};

export type SupabaseAdminUserPermissionRow = SupabaseAdminRolePermissionRow & {
  overridden: boolean;
};

export type SupabaseAdminInviteInput = {
  name: string;
  email: string;
  phone?: string;
  roleKey: string;
};

export async function fetchSupabaseAdminUsers() {
  const { data, error } = await getSupabaseBrowserClient().rpc("list_visible_admin_users");
  if (error) throw error;
  return (data || []) as SupabaseAdminUserRow[];
}

export async function fetchSupabaseAdminRoles() {
  const { data, error } = await getSupabaseBrowserClient().rpc("list_admin_roles");
  if (error) throw error;
  return (data || []) as SupabaseAdminRoleRow[];
}

export async function fetchSupabaseRolePermissions(roleKey: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc("list_admin_role_permissions", {
    p_role_key: roleKey,
  });
  if (error) throw error;
  return (data || []) as SupabaseAdminRolePermissionRow[];
}

export async function updateSupabaseRolePermission(roleKey: string, permissionKey: string, granted: boolean) {
  const { error } = await getSupabaseBrowserClient().rpc("set_admin_role_permission", {
    p_role_key: roleKey,
    p_permission_key: permissionKey,
    p_granted: granted,
  });
  if (error) throw error;
}

export async function fetchSupabaseUserPermissions(userId: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc("list_admin_user_permissions", {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data || []) as SupabaseAdminUserPermissionRow[];
}

export async function updateSupabaseUserPermission(userId: string, permissionKey: string, granted: boolean) {
  const { error } = await getSupabaseBrowserClient().rpc("set_admin_user_permission", {
    p_user_id: userId,
    p_permission_key: permissionKey,
    p_granted: granted,
  });
  if (error) throw error;
}

export async function updateSupabaseAdminUser(userId: string, role: string, active: boolean) {
  const { data, error } = await getSupabaseBrowserClient().rpc("update_admin_user", {
    p_user_id: userId,
    p_role: role,
    p_active: active,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Supabase did not return the updated user.");
  return row as SupabaseAdminUserRow;
}

export async function updateSupabaseAdminUserEmail(userId: string, email: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Supabase could not update the email address.");
  if (!payload?.user) throw new Error("Supabase did not return the updated user.");
  return payload.user as SupabaseAdminUserRow;
}

export async function resetSupabaseUserMfa(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/mfa-reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Supabase could not reset the authenticator.");
  return payload as { reset: boolean; removedFactors: number };
}

export async function inviteSupabaseAdminUser(input: SupabaseAdminInviteInput) {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch("/api/admin/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Supabase could not send the invitation.");
  if (!payload?.user) throw new Error("Supabase did not return the invited user.");
  return payload.user as SupabaseAdminUserRow;
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  front_desk: "Front Desk",
  operations: "Operations",
  finance: "Finance",
  member_support: "Member support",
  community_manager: "Community manager",
  sales: "Sales",
  facilities: "Facilities",
  hr: "HR",
};

export function mapSupabaseAdminUserToOsEmployee(row: SupabaseAdminUserRow) {
  const email = row.email || row.user_id;
  const name = row.full_name?.trim() || row.email?.split("@")[0] || "Admin user";
  const roleKey = String(row.role || "editor").toLowerCase();
  const role = roleLabels[roleKey] || roleKey.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return {
    id: row.user_id,
    userId: row.user_id,
    backend: "supabase",
    roleKey,
    name,
    email,
    phone: "",
    role,
    permissions: role === "Owner" ? "All workspace access" : "Workspace access",
    status: row.active ? "Active" : "Disabled",
    lastActivity: row.last_sign_in_at ? row.last_sign_in_at.slice(0, 10) : "Not available",
  };
}
