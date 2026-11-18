import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { checkRateLimits, rateLimitResponse } from "@/lib/server-security";

export const runtime = "nodejs";

const BUCKET = "lead-call-recordings";
const SIGNED_URL_SECONDS = 5 * 60;

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

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) {
  try {
    const { id, recordingId } = await params;
    const leadId = String(id || "").trim();
    const recordingUuid = String(recordingId || "").trim();
    if (!z.string().uuid().safeParse(leadId).success || !z.string().uuid().safeParse(recordingUuid).success) {
      return errorResponse("Recording not found.", 404);
    }

    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);
    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", {
      p_permission_key: "leads.read",
    });
    if (permissionError || allowed !== true) return errorResponse("Lead access required.", 403);

    const admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "lead.recording.open",
      userId: userData.user.id,
      ipLimit: 60,
      userLimit: 120,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many recording requests. Please try again later." }, response);
    }

    const { data: recording, error: recordingError } = await admin
      .from("os_lead_journey_recordings")
      .select("id,lead_id,storage_path,file_name")
      .eq("id", recordingUuid)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording || !recording.storage_path || recording.storage_path.includes("..") || recording.storage_path.startsWith("/")) {
      return errorResponse("Recording not found.", 404);
    }

    const { data, error: signedUrlError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(recording.storage_path, SIGNED_URL_SECONDS);
    if (signedUrlError || !data?.signedUrl) throw signedUrlError || new Error("Recording link unavailable.");
    return NextResponse.json({ signedUrl: data.signedUrl, fileName: recording.file_name });
  } catch (error) {
    console.error("Lead recording URL failed:", error);
    return errorResponse("The recording could not be opened.", 400);
  }
}
