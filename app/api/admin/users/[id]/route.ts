import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
}).strict().refine((value) => value.email !== undefined || value.full_name !== undefined || value.phone !== undefined);

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

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) {
    const status = "status" in body ? body.status : 400;
    return errorResponse(requestBodyError(status), status);
  }
  const parsed = updateUserSchema.safeParse(body.value);
  if (!parsed.success) return errorResponse("Enter valid employee profile details.", 400);

  const { id: targetUserId } = await context.params;
  if (!z.string().uuid().safeParse(targetUserId).success) return errorResponse("Administrator account not found.", 404);
  const userClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser(token);
  if (callerError || !callerData.user) return errorResponse("Your session is invalid or expired.", 401);

  const { data: canManage, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "admin_users.manage" });
  if (permissionError || canManage !== true) return errorResponse("You are not allowed to edit employee accounts.", 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const rateLimit = await checkRateLimits({
    client: adminClient,
    request,
    scope: "admin.user_profile_update",
    userId: callerData.user.id,
    ipLimit: 20,
    userLimit: 10,
    windowSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) {
    await recordSecurityAudit(adminClient, { action: "admin.user_profile_update", outcome: "rate_limited", actorUserId: callerData.user.id, targetUserId, request, metadata: { scope: "admin.user_profile_update" } });
    const response = rateLimitResponse(rateLimit);
    return NextResponse.json({ error: "Too many account update requests. Please try again later." }, response);
  }
  const { data: targetAdmin, error: targetError } = await adminClient
    .from("admin_users")
    .select("user_id, role, active, created_at")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError || !targetAdmin) return errorResponse("Administrator account not found.", 404);
  if (targetAdmin.role === "owner" && parsed.data.email !== undefined) return errorResponse("The owner email is protected and cannot be changed here.", 403);

  const normalizedEmail = parsed.data.email?.toLowerCase();
  if (normalizedEmail) {
    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return errorResponse("Could not verify whether this email is already registered.", 500);
    const authUsers = (users?.users || []) as Array<{ id: string; email?: string | null }>;
    const duplicate = authUsers.find((user) => user.id !== targetUserId && user.email?.toLowerCase() === normalizedEmail);
    if (duplicate) return errorResponse("An account with this email already exists.", 409);
  }

  const { data: currentUserData, error: currentUserError } = await adminClient.auth.admin.getUserById(targetUserId);
  if (currentUserError || !currentUserData.user) return errorResponse("Administrator account not found.", 404);
  const currentMetadata = currentUserData.user.user_metadata || {};
  const userUpdate: { email?: string; user_metadata?: Record<string, unknown> } = {};
  if (normalizedEmail) userUpdate.email = normalizedEmail;
  if (parsed.data.full_name !== undefined || parsed.data.phone !== undefined) {
    userUpdate.user_metadata = {
      ...currentMetadata,
      ...(parsed.data.full_name !== undefined ? { full_name: parsed.data.full_name } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    };
  }

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, userUpdate);
  if (updateError || !updatedUser.user) {
    await recordSecurityAudit(adminClient, { action: "admin.user_profile_update", outcome: "failure", actorUserId: callerData.user.id, targetUserId, request, metadata: { reason: "provider_rejected_update" } });
    return errorResponse("The administrator profile could not be updated.", 400);
  }

  await recordSecurityAudit(adminClient, { action: "admin.user_profile_update", outcome: "success", actorUserId: callerData.user.id, targetUserId, request });

  return NextResponse.json({
    user: {
      user_id: targetAdmin.user_id,
      email: updatedUser.user.email || normalizedEmail || null,
      phone: updatedUser.user.user_metadata?.phone || null,
      full_name: updatedUser.user.user_metadata?.full_name || updatedUser.user.user_metadata?.name || null,
      role: targetAdmin.role,
      active: targetAdmin.active,
      created_at: targetAdmin.created_at,
      last_sign_in_at: updatedUser.user.last_sign_in_at || null,
    },
  });
}
