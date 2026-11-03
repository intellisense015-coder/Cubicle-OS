import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";

export const runtime = "nodejs";

// TITLE: COMMUNICATION CHANNELS
const supportedChannels = new Set(["Email", "WhatsApp"]);

const communicationSchema = z.object({
  templateId: z.string().trim().min(1).max(120),
  templateName: z.string().trim().max(160).optional(),
  channel: z.enum(["Email", "WhatsApp"]),
  recipient: z.string().trim().min(1).max(320),
  recipientName: z.string().trim().max(160).optional(),
  subject: z.string().trim().max(240).optional(),
  body: z.string().max(12000).optional(),
}).strict();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function securityClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// TITLE: MOCK COMMUNICATION DELIVERY ENDPOINT
export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);

    const { data: assuranceData, error: assuranceError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assuranceData?.currentLevel !== "aal2") return errorResponse("MFA verification is required.", 403);

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", {
      p_permission_key: "email_templates.write",
    });
    if (permissionError || allowed !== true) return errorResponse("Communication sending access required.", 403);

    const auditClient = securityClient();
    const rateLimit = await checkRateLimits({
      client: auditClient,
      request,
      scope: "communications.send",
      userId: userData.user.id,
      ipLimit: 20,
      userLimit: 20,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(auditClient, { action: "communications.send", outcome: "rate_limited", actorUserId: userData.user.id, request, metadata: { scope: "communications.send" } });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many communication requests. Please try again later." }, response);
    }

    const body = await readJsonBody(request, 64 * 1024);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return errorResponse(requestBodyError(status), status);
    }
    const parsed = communicationSchema.safeParse(body.value);
    if (!parsed.success || !supportedChannels.has(parsed.data.channel)) {
      return errorResponse("Template, recipient and a supported delivery channel are required.", 400);
    }

    const payload = parsed.data;
    const delivery = {
      id: `delivery-${Date.now()}`,
      templateId: payload.templateId,
      templateName: payload.templateName,
      channel: payload.channel,
      recipient: payload.recipient,
      recipientName: payload.recipientName || "Recipient",
      subject: payload.subject || "",
      body: payload.body || "",
      status: "Queued",
      createdAt: new Date().toISOString()
    };
    await recordSecurityAudit(auditClient, { action: "communications.send", outcome: "success", actorUserId: userData.user.id, request, metadata: { channel: payload.channel, template_id: payload.templateId } });
    return NextResponse.json({ ok: true, delivery });
  } catch {
    return NextResponse.json({ error: "Invalid communication request." }, { status: 400 });
  }
}
