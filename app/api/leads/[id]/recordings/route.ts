import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  checkRateLimits,
  rateLimitResponse,
  recordSecurityAudit,
} from "@/lib/server-security";

export const runtime = "nodejs";

const BUCKET = "lead-call-recordings";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const WRITE_PERMISSIONS = ["leads.write", "leads.followups.write", "leads.journey.write"] as const;
const allowedMimeTypes = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

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

function extensionFor(fileName: string) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "audio";
}

function safeFileName(fileName: string) {
  const cleaned = String(fileName || "recording")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "recording";
}

function storageErrorMessage(error: { code?: string; message?: string } | null | undefined) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (code === "PGRST205" || /bucket not found|relation .* does not exist|schema cache|could not find the table/i.test(message)) {
    return "Audio storage is not configured yet. Apply the lead-recordings migration before attaching audio.";
  }
  if (/permission|not authorized|row-level security|access denied/i.test(message)) {
    return "You do not have permission to upload recordings.";
  }
  return "The audio recording could not be uploaded.";
}

async function hasAnyPermission(userClient: ReturnType<typeof authClient>) {
  const results = await Promise.all(WRITE_PERMISSIONS.map((permission) => userClient.rpc("is_permission_granted", {
    p_permission_key: permission,
  })));
  return results.some(({ data, error }) => !error && data === true);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  let actorUserId = "";
  let leadId = "";

  try {
    const { id } = await params;
    leadId = String(id || "").trim();
    if (!z.string().uuid().safeParse(leadId).success) return errorResponse("Lead not found.", 404);

    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);
    actorUserId = userData.user.id;
    if (!(await hasAnyPermission(userClient))) return errorResponse("You do not have permission to upload recordings.", 403);

    admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "lead.recording.upload",
      userId: actorUserId,
      ipLimit: 12,
      userLimit: 12,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, {
        action: "lead.recording.upload",
        outcome: "rate_limited",
        actorUserId,
        entityType: "lead",
        entityId: leadId,
        request,
        metadata: { scope: "lead.recording.upload" },
      });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many recording uploads. Please try again later." }, response);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES + 256 * 1024) {
      return errorResponse("Audio recordings must be smaller than 25 MB.", 413);
    }
    const formData = await request.formData();
    const journeyEntryId = z.string().trim().min(1).max(160).safeParse(formData.get("journeyEntryId"));
    const fileValue = formData.get("file");
    if (!journeyEntryId.success || !fileValue || typeof fileValue !== "object" || typeof (fileValue as File).arrayBuffer !== "function") {
      return errorResponse("Choose a valid audio recording.", 400);
    }
    const file = fileValue as File;
    const extensionMimeType = ({
      aac: "audio/aac",
      m4a: "audio/m4a",
      mp3: "audio/mpeg",
      mp4: "audio/mp4",
      oga: "audio/ogg",
      ogg: "audio/ogg",
      wav: "audio/wav",
      webm: "audio/webm",
    } as Record<string, string>)[extensionFor(file.name)];
    const mimeType = String(file.type || extensionMimeType || "").toLowerCase();
    if (!allowedMimeTypes.has(mimeType) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return errorResponse("Audio recordings must be smaller than 25 MB and use a supported audio format.", 400);
    }

    const { data: journey, error: journeyError } = await admin
      .from("os_lead_journey")
      .select("lead_id,client_entry_id")
      .eq("lead_id", leadId)
      .eq("client_entry_id", journeyEntryId.data)
      .maybeSingle();
    if (journeyError) throw journeyError;
    if (!journey) return errorResponse("The follow-up could not be found.", 404);

    const extension = extensionFor(file.name).replace(/[^a-z0-9]/gi, "") || "audio";
    const storagePath = `${leadId}/${crypto.randomUUID()}.${extension}`;
    const fileBytes = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBytes, {
      cacheControl: "3600",
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: recording, error: metadataError } = await admin
      .from("os_lead_journey_recordings")
      .insert({
        lead_id: leadId,
        journey_client_entry_id: journeyEntryId.data,
        storage_path: storagePath,
        file_name: safeFileName(file.name),
        mime_type: mimeType,
        file_size: fileBytes.byteLength,
        uploaded_by: actorUserId,
      })
      .select("id,lead_id,journey_client_entry_id,storage_path,file_name,mime_type,file_size,created_at")
      .single();

    if (metadataError || !recording) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      throw metadataError || new Error("Recording metadata was not saved.");
    }

    await recordSecurityAudit(admin, {
      action: "lead.recording.upload",
      outcome: "success",
      actorUserId,
      entityType: "lead",
      entityId: leadId,
      request,
      metadata: { file_size: fileBytes.byteLength, mime_type: mimeType },
    });
    return NextResponse.json({ ok: true, recording });
  } catch (error) {
    if (admin && actorUserId && leadId) {
      await recordSecurityAudit(admin, {
        action: "lead.recording.upload",
        outcome: "failure",
        actorUserId,
        entityType: "lead",
        entityId: leadId,
        request,
        metadata: { reason: "recording_upload_failed" },
      });
    }
    console.error("Lead recording upload failed:", error);
    return errorResponse(storageErrorMessage(error as { code?: string; message?: string }), 400);
  }
}
