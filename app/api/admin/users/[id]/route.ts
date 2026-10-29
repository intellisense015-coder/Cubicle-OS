import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  email: z.string().trim().email().max(320),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return errorResponse("Authentication required.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) return errorResponse("Server-side Supabase user management is not configured.", 503);

  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a valid email address.", 400);

  const { id: targetUserId } = await context.params;
  const userClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser(token);
  if (callerError || !callerData.user) return errorResponse("Your session is invalid or expired.", 401);

  const { data: canManage, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "admin_users.manage" });
  if (permissionError || canManage !== true) return errorResponse("You are not allowed to edit employee accounts.", 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: targetAdmin, error: targetError } = await adminClient
    .from("admin_users")
    .select("user_id, role, active, created_at")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError || !targetAdmin) return errorResponse("Administrator account not found.", 404);
  if (targetAdmin.role === "owner") return errorResponse("The owner email is protected and cannot be changed here.", 403);

  const normalizedEmail = parsed.data.email.toLowerCase();
  const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return errorResponse("Could not verify whether this email is already registered.", 500);
  const authUsers = (users?.users || []) as Array<{ id: string; email?: string | null }>;
  const duplicate = authUsers.find((user) => user.id !== targetUserId && user.email?.toLowerCase() === normalizedEmail);
  if (duplicate) return errorResponse("An account with this email already exists.", 409);

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, { email: normalizedEmail });
  if (updateError || !updatedUser.user) return errorResponse(updateError?.message || "Supabase could not update this email address.", 400);

  return NextResponse.json({
    user: {
      user_id: targetAdmin.user_id,
      email: updatedUser.user.email || normalizedEmail,
      full_name: updatedUser.user.user_metadata?.full_name || updatedUser.user.user_metadata?.name || null,
      role: targetAdmin.role,
      active: targetAdmin.active,
      created_at: targetAdmin.created_at,
      last_sign_in_at: updatedUser.user.last_sign_in_at || null,
    },
  });
}
