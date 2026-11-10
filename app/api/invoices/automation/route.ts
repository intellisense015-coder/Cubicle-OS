import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";

export const runtime = "nodejs";

const settingsSchema = z.object({
  enabled: z.boolean(),
  sendDay: z.number().int().min(1).max(28),
  sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Send time must use HH:mm."),
  memberIds: z.array(z.string().uuid()).max(500),
}).strict();

function authClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function errorResponse(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function authenticate(request: Request, permission: "invoices.read" | "invoices.write") {
  const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: errorResponse("Authentication is required.", 401) } as const;
  const userClient = authClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return { error: errorResponse("Your session is invalid or expired.", 401) } as const;
  const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: permission });
  if (permissionError || allowed !== true) return { error: errorResponse("Invoice automation access required.", 403) } as const;
  return { user: userData.user } as const;
}

function toSettings(row: any) {
  return { enabled: row?.enabled === true, sendDay: Number(row?.send_day) || 1, sendTime: String(row?.send_time || "09:00:00").slice(0, 5), memberIds: Array.isArray(row?.member_ids) ? row.member_ids : [], timezone: String(row?.timezone || "Asia/Karachi"), updatedAt: row?.updated_at || null };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request, "invoices.read");
    if ("error" in auth) return auth.error;
    const { data, error } = await serviceClient().from("invoice_automation_settings").select("id,enabled,send_day,send_time,member_ids,timezone,updated_at").eq("id", 1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, settings: toSettings(data) });
  } catch (error) {
    console.error("Invoice automation settings read failed:", error);
    return errorResponse("Invoice automation settings could not be loaded.", 502);
  }
}

export async function PUT(request: Request) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  let actorUserId = "";
  try {
    const auth = await authenticate(request, "invoices.write");
    if ("error" in auth) return auth.error;
    actorUserId = auth.user.id;
    admin = serviceClient();
    const rateLimit = await checkRateLimits({ client: admin, request, scope: "invoice.automation.settings", userId: actorUserId, ipLimit: 20, userLimit: 20, windowSeconds: 10 * 60 });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, { action: "invoice.automation.settings", outcome: "rate_limited", actorUserId, entityType: "invoice_automation", request });
      return NextResponse.json({ error: "Too many schedule changes. Please try again later." }, rateLimitResponse(rateLimit));
    }
    const body = await readJsonBody(request, 16 * 1024);
    if (!body.ok) { const status = "status" in body ? body.status : 400; return errorResponse(requestBodyError(status), status); }
    const parsed = settingsSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse("The monthly invoice schedule is invalid.", 400);
    const { enabled, sendDay, sendTime, memberIds } = parsed.data;
    const uniqueMemberIds = [...new Set(memberIds)];
    if (enabled && uniqueMemberIds.length === 0) return errorResponse("Select at least one member to receive automatic invoices.", 400);
    if (uniqueMemberIds.length) {
      const { data: activeMembers, error: memberError } = await admin.from("members").select("id").in("id", uniqueMemberIds).in("status", ["active", "activated"]);
      if (memberError) throw memberError;
      if ((activeMembers || []).length !== uniqueMemberIds.length) return errorResponse("Only active members can receive automatic invoices.", 400);
    }
    const { data, error } = await admin.from("invoice_automation_settings").upsert({ id: 1, enabled, send_day: sendDay, send_time: `${sendTime}:00`, member_ids: uniqueMemberIds, timezone: "Asia/Karachi", updated_by: actorUserId, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id,enabled,send_day,send_time,member_ids,timezone,updated_at").single();
    if (error) throw error;
    await recordSecurityAudit(admin, { action: "invoice.automation.settings", outcome: "success", actorUserId, entityType: "invoice_automation", request, metadata: { enabled, sendDay, sendTime, memberCount: uniqueMemberIds.length } });
    return NextResponse.json({ ok: true, settings: toSettings(data) });
  } catch (error) {
    if (admin && actorUserId) await recordSecurityAudit(admin, { action: "invoice.automation.settings", outcome: "failure", actorUserId, entityType: "invoice_automation", request });
    console.error("Invoice automation settings save failed:", error);
    return errorResponse("Invoice automation settings could not be saved.", 502);
  }
}
