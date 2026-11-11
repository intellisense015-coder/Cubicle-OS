import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";
import { sendResendEmail } from "@/lib/server-email";
import { resolveOsEmailSender } from "@/lib/server-os-email";
import { renderInvitationEmailHtml, renderInvitationEmailSubject, renderInvitationEmailText } from "@/lib/invitation-email-html";
import { getOsEmailTemplate } from "@/lib/server-os-email-templates";

export const runtime = "nodejs";

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(30).optional().default(""),
  roleKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
  template: z.object({
    subject: z.string().trim().max(200).optional(),
    body: z.string().max(5000).optional(),
  }).strict().optional(),
}).strict();

const inviteAcceptSchema = z.object({
  action: z.literal("accept"),
  code: z.string().trim().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function templateValue(template: unknown, key: "subject" | "body") {
  if (!template || typeof template !== "object") return undefined;
  const value = (template as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function acceptInvitation(request: NextRequest, code: string, supabaseUrl: string, publicKey: string, serviceRoleKey: string) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: invitation, error: invitationError } = await adminClient
    .from("admin_invitation_links")
    .select("id,user_id,email,provider_token_hash,expires_at,consumed_at")
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (invitationError || !invitation) return errorResponse("This invitation link is invalid or has expired.", 400);

  let response = NextResponse.json({ ok: true, email: invitation.email });
  const sessionClient = createServerClient(supabaseUrl, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: sessionData, error: verifyError } = await sessionClient.auth.verifyOtp({
    type: "invite",
    token_hash: invitation.provider_token_hash,
  });
  if (verifyError || !sessionData.session || sessionData.user?.id !== invitation.user_id) {
    await recordSecurityAudit(adminClient, { action: "admin.invite.accept", outcome: "failure", actorUserId: invitation.user_id, request, metadata: { reason: "provider_token_rejected" } });
    return errorResponse("This invitation link is invalid or has expired.", 400);
  }

  const { error: consumeError } = await adminClient
    .from("admin_invitation_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("consumed_at", null);
  if (consumeError) {
    console.error("Invitation link could not be finalized:", consumeError.message);
    return errorResponse("The invitation could not be completed. Ask an owner to send a new invitation.", 500);
  }

  await recordSecurityAudit(adminClient, { action: "admin.invite.accept", outcome: "success", actorUserId: invitation.user_id, request, metadata: { email: invitation.email } });
  return response;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
    return errorResponse("Server-side Supabase invitation is not configured.", 503);
  }

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) {
    const status = "status" in body ? body.status : 400;
    return errorResponse(requestBodyError(status), status);
  }

  const acceptPayload = inviteAcceptSchema.safeParse(body.value);
  if (acceptPayload.success) return acceptInvitation(request, acceptPayload.data.code, supabaseUrl, supabasePublicKey, serviceRoleKey);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return errorResponse("Authentication required.", 401);

  const parsed = inviteSchema.safeParse(body.value);
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

  const rateLimit = await checkRateLimits({
    client: adminClient,
    request,
    scope: "admin.invite",
    userId: userData.user.id,
    ipLimit: 10,
    userLimit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) {
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "rate_limited", actorUserId: userData.user.id, request, metadata: { scope: "admin.invite" } });
    const response = rateLimitResponse(rateLimit);
    return NextResponse.json({ error: "Too many invitation requests. Please try again later." }, response);
  }

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

  const requestOrigin = new URL(request.url).origin;
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const siteUrl = /^(https?:\/\/localhost|https?:\/\/127\.0\.0\.1)/i.test(requestOrigin)
    ? requestOrigin
    : configuredSiteUrl || requestOrigin;
  const invitationRedirect = new URL("/accept-invite", siteUrl);
  invitationRedirect.searchParams.set("invite", "1");
  invitationRedirect.searchParams.set("email", normalizedEmail);
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: normalizedEmail,
    options: {
      data: {
        full_name: parsed.data.name,
        phone: parsed.data.phone || null,
      },
      redirectTo: invitationRedirect.toString(),
    },
  });
  const actionLink = invitation?.properties?.action_link || "";
  if (invitationError || !invitation?.user || !actionLink) {
    console.error("Employee invitation link generation failed:", invitationError?.message || "No invitation link returned.");
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, request, metadata: { reason: "provider_rejected_invitation" } });
    return errorResponse("The invitation could not be prepared.", 502);
  }

  let providerActionUrl: URL;
  try {
    providerActionUrl = new URL(invitation.properties.action_link);
  } catch {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "provider_link_invalid" } });
    return errorResponse("The invitation could not be prepared.", 502);
  }
  const providerTokenHash = providerActionUrl.searchParams.get("token") || providerActionUrl.searchParams.get("token_hash") || "";
  if (!providerTokenHash) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "provider_token_missing" } });
    return errorResponse("The invitation could not be prepared.", 502);
  }

  // Keep the provider token server-side. The employee receives only an opaque,
  // short-lived code that is exchanged by the server before the accept page
  // receives a session. This prevents Supabase auth tokens from appearing in
  // email links, browser history, referrers, or screenshots.
  const inviteCode = randomBytes(32).toString("base64url");
  const inviteCodeHash = createHash("sha256").update(inviteCode).digest("hex");
  const invitationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: linkError } = await adminClient.from("admin_invitation_links").insert({
    user_id: invitation.user.id,
    email: normalizedEmail,
    code_hash: inviteCodeHash,
    provider_token_hash: providerTokenHash,
    expires_at: invitationExpiresAt,
  });
  if (linkError) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "invitation_link_storage_failed" } });
    return errorResponse("The invitation could not be prepared.", 500);
  }

  const acceptLink = new URL("/accept-invite", siteUrl);
  acceptLink.searchParams.set("code", inviteCode);
  const secureActionLink = acceptLink.toString();

  const { data: adminUser, error: adminUserError } = await adminClient
    .from("admin_users")
    .insert({ user_id: invitation.user.id, role: parsed.data.roleKey, active: true })
    .select("user_id, role, active, created_at")
    .single();

  if (adminUserError || !adminUser) {
    await adminClient.from("admin_invitation_links").delete().eq("user_id", invitation.user.id);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "administrator_link_failed" } });
    return errorResponse("The invitation could not be linked to an administrator role.", 500);
  }

  const { error: authStateError } = await adminClient
    .from("os_auth_state")
    .insert({
      user_id: invitation.user.id,
      role: parsed.data.roleKey,
      is_onboarded: false,
      invitation_status: "pending",
      invited_by: userData.user.id,
      invited_at: new Date().toISOString(),
    });
  if (authStateError) {
    await adminClient.from("admin_users").delete().eq("user_id", invitation.user.id);
    await adminClient.from("admin_invitation_links").delete().eq("user_id", invitation.user.id);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "os_auth_state_link_failed" } });
    return errorResponse("The invitation could not be linked to the OS authentication state.", 500);
  }

  let invitationEmail;
  try {
    const storedTemplate = await getOsEmailTemplate(adminClient, "employee-invitation");
    const emailInput = { name: parsed.data.name, actionLink: secureActionLink };
    const templateBody = templateValue(parsed.data.template, "body") || storedTemplate.body;
    const subject = renderInvitationEmailSubject(templateValue(parsed.data.template, "subject") || storedTemplate.subject, emailInput);
    const html = renderInvitationEmailHtml({ ...emailInput, subject, body: templateBody });
    const text = renderInvitationEmailText({ ...emailInput, body: templateBody });
    const sender = await resolveOsEmailSender({ client: adminClient, purpose: "invitations" });
    invitationEmail = await sendResendEmail({
      from: sender.from,
      replyTo: sender.replyTo,
      to: [normalizedEmail],
      subject,
      html,
      text,
    });
  } catch (emailError) {
    await adminClient.from("admin_users").delete().eq("user_id", invitation.user.id);
    await adminClient.from("os_auth_state").delete().eq("user_id", invitation.user.id);
    await adminClient.from("admin_invitation_links").delete().eq("user_id", invitation.user.id);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "failure", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { reason: "resend_delivery_failed", error: emailError instanceof Error ? emailError.message : "unknown" } });
    return errorResponse("The invitation could not be delivered. Please try again.", 502);
  }

  await recordSecurityAudit(adminClient, { action: "admin.invite", outcome: "success", actorUserId: userData.user.id, targetUserId: invitation.user.id, request, metadata: { role: parsed.data.roleKey, provider: "resend", provider_message_id: invitationEmail.id } });

  return NextResponse.json({
    user: { ...adminUser, email: normalizedEmail, full_name: parsed.data.name, last_sign_in_at: null, role_label: role.label },
  }, { status: 201 });
}
