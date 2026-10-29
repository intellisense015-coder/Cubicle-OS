import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(30).optional().default(""),
  roleKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) return errorResponse("Authentication required.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
    return errorResponse("Server-side Supabase invitation is not configured.", 503);
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a valid name, email, phone and role.", 400);

  const userClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);

  const { data: canManage, error: permissionError } = await userClient.rpc("is_permission_granted", {
    p_permission_key: "admin_users.manage",
  });
  if (permissionError) return errorResponse("Could not verify invitation permissions.", 403);
  if (canManage !== true) return errorResponse("You are not allowed to invite employees.", 403);

  const { data: callerRole, error: roleError } = await userClient.rpc("get_my_admin_role");
  if (roleError) return errorResponse("Could not verify your administrator role.", 403);
  if (parsed.data.roleKey === "owner" && String(callerRole || "").toLowerCase() !== "owner") {
    return errorResponse("Only an owner can invite another owner.", 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: role, error: roleLookupError } = await adminClient
    .from("admin_roles")
    .select("role_key, label, active")
    .eq("role_key", parsed.data.roleKey)
    .eq("active", true)
    .maybeSingle();

  if (roleLookupError) return errorResponse("Could not validate the selected role.", 500);
  if (!role) return errorResponse("That role is not active.", 400);

  const { data: existingUsers, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return errorResponse("Could not verify whether this email is already registered.", 500);
  const normalizedEmail = parsed.data.email.toLowerCase();
  const existingUser = (existingUsers.users as Array<{ email?: string | null }>).find((item) => item.email?.toLowerCase() === normalizedEmail);
  if (existingUser) return errorResponse("An account with this email already exists.", 409);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: {
      full_name: parsed.data.name,
      phone: parsed.data.phone || null,
    },
    redirectTo: new URL("/accept-invite", siteUrl).toString(),
  });

  if (invitationError || !invitation.user) {
    return errorResponse(invitationError?.message || "Supabase could not send the invitation.", 400);
  }

  const { data: adminUser, error: adminUserError } = await adminClient
    .from("admin_users")
    .insert({ user_id: invitation.user.id, role: parsed.data.roleKey, active: true })
    .select("user_id, role, active, created_at")
    .single();

  if (adminUserError || !adminUser) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    return errorResponse("The invitation could not be linked to an administrator role.", 500);
  }

  return NextResponse.json({
    user: { ...adminUser, email: normalizedEmail, full_name: parsed.data.name, last_sign_in_at: null, role_label: role.label },
  }, { status: 201 });
}
