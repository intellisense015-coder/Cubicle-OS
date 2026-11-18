import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { checkRateLimits, rateLimitResponse } from "@/lib/server-security";

export const runtime = "nodejs";

const BUCKET = "lead-call-recordings";

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

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return { invalid: true as const };
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2] || 0), 0);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return { invalid: true as const };
  }
  return { start, end: Math.min(end, size - 1), invalid: false as const };
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
      scope: "lead.recording.stream",
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
      .select("storage_path,file_name,mime_type")
      .eq("id", recordingUuid)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording || !recording.storage_path || recording.storage_path.includes("..") || recording.storage_path.startsWith("/")) {
      return errorResponse("Recording not found.", 404);
    }

    const { data: audioBlob, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(recording.storage_path);
    if (downloadError || !audioBlob) throw downloadError || new Error("Recording unavailable.");

    const audioBytes = await audioBlob.arrayBuffer();
    const audioSize = audioBytes.byteLength;
    const range = parseRange(request.headers.get("range"), audioSize);
    if (range?.invalid) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${audioSize}`, "Accept-Ranges": "bytes" },
      });
    }

    const contentType = recording.mime_type === "audio/ogg"
      ? "audio/ogg; codecs=opus"
      : recording.mime_type || "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });
    if (!range) {
      headers.set("Content-Length", String(audioSize));
      return new Response(audioBytes, { status: 200, headers });
    }

    const length = range.end - range.start + 1;
    headers.set("Content-Length", String(length));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${audioSize}`);
    return new Response(audioBytes.slice(range.start, range.end + 1), { status: 206, headers });
  } catch (error) {
    console.error("Lead recording stream failed:", error);
    return errorResponse("The recording could not be opened.", 400);
  }
}
