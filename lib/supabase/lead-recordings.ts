import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const LEAD_RECORDINGS_BUCKET = "lead-call-recordings";
export const MAX_LEAD_RECORDING_BYTES = 25 * 1024 * 1024;
export const LEAD_RECORDING_SIGNED_URL_SECONDS = 5 * 60;

const mimeByExtension: Record<string, string> = {
  aac: "audio/aac",
  m4a: "audio/m4a",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

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

export type SupabaseLeadJourneyRecordingRow = {
  id: string;
  lead_id: string;
  journey_client_entry_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

function extensionFor(fileName: string) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function inferMimeType(file: File) {
  return file.type || mimeByExtension[extensionFor(file.name)] || "";
}

export function validateLeadRecordingFile(file: File | null | undefined) {
  if (!file) return { ok: true as const, mimeType: "" };
  const mimeType = inferMimeType(file);
  if (!allowedMimeTypes.has(mimeType)) {
    return { ok: false as const, message: "Choose an audio file such as MP3, WAV, M4A, OGG or WebM." };
  }
  if (file.size <= 0 || file.size > MAX_LEAD_RECORDING_BYTES) {
    return { ok: false as const, message: "Audio recordings must be smaller than 25 MB." };
  }
  return { ok: true as const, mimeType };
}

export async function uploadSupabaseLeadRecording({
  leadId,
  journeyEntryId,
  file,
}: {
  leadId: string;
  journeyEntryId: string;
  file: File;
}) {
  const validation = validateLeadRecordingFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const supabase = getSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error("Your session has expired. Sign in again.");

  const formData = new FormData();
  formData.append("journeyEntryId", journeyEntryId);
  formData.append("file", file, file.name);
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/recordings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  let payload: { recording?: SupabaseLeadJourneyRecordingRow; error?: string } = {};
  try { payload = await response.json(); } catch { /* keep the generic response below */ }
  if (!response.ok || !payload.recording) throw new Error(payload.error || "The audio recording could not be uploaded.");
  return payload.recording;
}

export async function createSupabaseLeadRecordingSignedUrl({ leadId, recordingId }: { leadId: string; recordingId: string }) {
  const { data: sessionData, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error("Your session has expired. Sign in again.");
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/recordings/${encodeURIComponent(recordingId)}/stream`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    let payload: { error?: string } = {};
    try { payload = await response.json(); } catch { /* keep the generic response below */ }
    throw new Error(payload.error || "The recording could not be opened.");
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) throw new Error("The recording is empty or unavailable.");
  return URL.createObjectURL(audioBlob);
}
