import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return errorResponse("Authentication required.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) return errorResponse("Server-side Supabase user management is not configured.", 503);

  const { id: targetUserId } = await context.params;
  const userClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: callerData, error: callerError } = await userClient.auth.getUser(token);
  if (callerError || !callerData.user) return errorResponse("Your session is invalid or expired.", 401);

  const { data: assuranceData, error: assuranceError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assuranceData?.currentLevel !== "aal2") return errorResponse("AAL2 verification is required before resetting an authenticator.", 403);

  const { data: canManage, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "admin_users.manage" });
  if (permissionError || canManage !== true) return errorResponse("You are not allowed to reset employee authenticators.", 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: targetAdmin, error: targetError } = await adminClient
    .from("admin_users")
    .select("user_id, role, active")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetError || !targetAdmin) return errorResponse("Administrator account not found.", 404);
  if (targetAdmin.role === "owner") return errorResponse("Owner MFA is protected and cannot be reset here.", 403);

  const { data: factorsData, error: factorsError } = await adminClient.auth.admin.mfa.listFactors({ userId: targetUserId });
  if (factorsError) return errorResponse("Could not load the employee authenticator factors.", 500);

  const factors = factorsData?.factors;
  if (!Array.isArray(factors)) {
    return errorResponse("Supabase returned an invalid authenticator list.", 502);
  }
  if (!factors.length) {
    return errorResponse("No enrolled authenticator was found for this employee account.", 409);
  }

  for (const factor of factors) {
    const { error: deleteError } = await adminClient.auth.admin.mfa.deleteFactor({ userId: targetUserId, id: factor.id });
    if (deleteError) return errorResponse("The authenticator reset could not be completed.", 500);
  }

  const { data: remainingFactors, error: verifyError } = await adminClient.auth.admin.mfa.listFactors({ userId: targetUserId });
  if (verifyError) return errorResponse("The authenticator reset could not be verified.", 500);
  if (!Array.isArray(remainingFactors?.factors)) {
    return errorResponse("Supabase returned an invalid authenticator verification response.", 502);
  }
  if (remainingFactors.factors.length) {
    return errorResponse("Supabase did not remove the employee's authenticator. No reset was reported as successful.", 502);
  }

  return NextResponse.json({ reset: true, removedFactors: factors.length });
}
