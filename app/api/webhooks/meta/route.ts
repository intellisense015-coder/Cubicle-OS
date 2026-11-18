import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { validEmail } from "@/lib/server-email";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_ENTRIES = 1000;
const MAX_CHANGES_PER_ENTRY = 100;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const pageIdPattern = /^\d{5,32}$/;
const leadgenIdPattern = /^[A-Za-z0-9:_-]{1,128}$/;

const metaChangeSchema = z.object({
  field: z.string().max(80),
  value: z.record(z.unknown()),
}).passthrough();

const metaEntrySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  changes: z.array(metaChangeSchema).max(MAX_CHANGES_PER_ENTRY),
}).passthrough();

const metaWebhookSchema = z.object({
  object: z.literal("page"),
  entry: z.array(metaEntrySchema).min(1).max(MAX_ENTRIES),
}).passthrough();

type MetaLeadValue = {
  leadgen_id?: unknown;
  page_id?: unknown;
  form_id?: unknown;
  ad_id?: unknown;
  created_time?: unknown;
};

type MetaLeadEvent = {
  leadgenId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
};

type MetaLeadField = {
  name?: unknown;
  values?: unknown;
};

class BodyTooLargeError extends Error {}

class MetaProcessingError extends Error {
  constructor(public readonly stage: string, message = "Meta lead processing failed.") {
    super(message);
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function configured(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function configuredPageId() {
  const value = configured("META_PAGE_ID");
  if (!pageIdPattern.test(value)) throw new Error("META_PAGE_ID is invalid.");
  return value;
}

function graphVersion() {
  const value = String(process.env.META_GRAPH_API_VERSION || "v27.0").trim();
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("META_GRAPH_API_VERSION is invalid.");
  return value;
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function readLimitedBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) throw new BodyTooLargeError();

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  const supplied = String(header || "").trim().match(/^sha256=([a-f0-9]{64})$/i)?.[1];
  if (!supplied) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeStringEqual(expected, supplied.toLowerCase());
}

function normalizeId(value: unknown, pattern: RegExp) {
  const result = String(value ?? "").trim();
  return pattern.test(result) ? result : null;
}

function eventValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MetaLeadValue : null;
}

function extractLeadEvents(payload: z.infer<typeof metaWebhookSchema>, expectedPageId: string) {
  const events: MetaLeadEvent[] = [];
  for (const entry of payload.entry) {
    const entryPageId = normalizeId(entry.id, pageIdPattern);
    if (entryPageId && entryPageId !== expectedPageId) continue;
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      const value = eventValue(change.value);
      const pageId = normalizeId(value?.page_id || entryPageId, pageIdPattern);
      const leadgenId = normalizeId(value?.leadgen_id, leadgenIdPattern);
      if (!pageId || pageId !== expectedPageId || !leadgenId) continue;
      events.push({
        leadgenId,
        pageId,
        formId: normalizeId(value?.form_id, leadgenIdPattern),
        adId: normalizeId(value?.ad_id, leadgenIdPattern),
      });
    }
  }
  return events;
}

function firstText(fields: Map<string, string>, names: string[]) {
  for (const name of names) {
    const value = fields.get(name);
    if (value) return value;
  }
  return "";
}

function normalizeFieldName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function fieldMap(fieldData: unknown) {
  const fields = new Map<string, string>();
  if (!Array.isArray(fieldData)) return fields;
  for (const rawField of fieldData as MetaLeadField[]) {
    const name = normalizeFieldName(rawField?.name);
    const values = Array.isArray(rawField?.values) ? rawField.values : [];
    const value = String(values[0] ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
    if (name && value) fields.set(name, value);
  }
  return fields;
}

function safeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return validEmail(normalized) && normalized.length <= 320 ? normalized : "";
}

function safePhone(value: string) {
  return value.replace(/[^0-9+() .-]/g, "").trim().slice(0, 40);
}

function parseTeamSize(value: string) {
  const match = value.match(/\d{1,4}/)?.[0];
  const number = Number(match || "1");
  return Number.isInteger(number) && number > 0 && number <= 10_000 ? number : 1;
}

function workspaceOption(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("private")) return "private-office";
  if (normalized.includes("dedicated")) return "dedicated-desk";
  if (normalized.includes("meeting")) return "meeting-room";
  if (normalized.includes("event")) return "event-space";
  if (normalized.includes("enterprise")) return "enterprise-solutions";
  return null;
}

function leadMessage(fields: Map<string, string>) {
  const lines = [...fields.entries()]
    .filter(([name]) => !["full_name", "name", "email", "phone", "phone_number"].includes(name))
    .slice(0, 30)
    .map(([name, value]) => `${name.replace(/_/g, " ")}: ${value}`);
  return ["Source: Meta Lead Ads", ...lines].join("\n").slice(0, 2000);
}

async function fetchMetaLead(leadgenId: string) {
  const token = configured("META_PAGE_ACCESS_TOKEN");
  const endpoint = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(leadgenId)}`
    + "?fields=id,field_data,created_time,form_id,ad_id";
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new MetaProcessingError("graph_fetch", "Meta lead retrieval failed.");
  }
  if (!response.ok) throw new MetaProcessingError("graph_fetch", "Meta lead retrieval failed.");
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.id !== leadgenId || !Array.isArray(body.field_data)) {
    throw new MetaProcessingError("graph_payload", "Meta returned an invalid lead payload.");
  }
  return body;
}

async function claimEvent(admin: SupabaseClient, event: MetaLeadEvent) {
  const now = new Date().toISOString();
  const inserted = await admin.from("os_meta_lead_events").insert({
    leadgen_id: event.leadgenId,
    page_id: event.pageId,
    form_id: event.formId,
    ad_id: event.adId,
    status: "processing",
    attempts: 1,
    updated_at: now,
  }).select("leadgen_id,status,lead_id,resend_email_id").maybeSingle();
  if (!inserted.error && inserted.data) return { claimed: true, event: inserted.data };
  if (inserted.error?.code !== "23505") throw new MetaProcessingError("event_claim", "Meta event could not be claimed.");

  const existing = await admin.from("os_meta_lead_events")
    .select("leadgen_id,status,lead_id,resend_email_id,attempts,updated_at")
    .eq("leadgen_id", event.leadgenId)
    .maybeSingle();
  if (existing.error) throw new MetaProcessingError("event_claim", "Meta event could not be checked.");
  if (!existing.data) throw new MetaProcessingError("event_claim", "Meta event could not be claimed.");
  if (existing.data.status === "completed") return { claimed: false, event: existing.data };

  const updatedAt = Date.parse(String(existing.data.updated_at || ""));
  const isFresh = Number.isFinite(updatedAt) && Date.now() - updatedAt < PROCESSING_LEASE_MS;
  if (existing.data.status === "processing" && isFresh) return { claimed: false, event: existing.data };

  const resumed = await admin.from("os_meta_lead_events")
    .update({
      status: "processing",
      page_id: event.pageId,
      form_id: event.formId,
      ad_id: event.adId,
      attempts: Math.min(1000, Number(existing.data.attempts || 1) + 1),
      last_error: null,
      updated_at: now,
    })
    .eq("leadgen_id", event.leadgenId)
    .eq("status", existing.data.status)
    .select("leadgen_id,status,lead_id,resend_email_id")
    .maybeSingle();
  if (resumed.error || !resumed.data) return { claimed: false, event: existing.data };
  return { claimed: true, event: resumed.data };
}

async function markEventFailed(admin: SupabaseClient, leadgenId: string, stage: string) {
  await admin.from("os_meta_lead_events").update({
    status: "failed",
    last_error: stage.slice(0, 120),
    updated_at: new Date().toISOString(),
  }).eq("leadgen_id", leadgenId).eq("status", "processing");
}

async function processEvent(admin: SupabaseClient, event: MetaLeadEvent) {
  const metaLead = await fetchMetaLead(event.leadgenId);
  const fields = fieldMap(metaLead.field_data);
  const name = firstText(fields, ["full_name", "name", "first_name"]) || `Meta lead ${event.leadgenId.slice(-8)}`;
  const email = safeEmail(firstText(fields, ["email", "email_address"]));
  const phone = safePhone(firstText(fields, ["phone_number", "phone", "mobile", "phone_no"]));
  const team = firstText(fields, ["team_size", "number_of_people", "team", "capacity"]);
  const workspace = firstText(fields, ["workspace", "workspace_type", "office_type", "space_type"]);

  if (!email && !phone) throw new MetaProcessingError("lead_validation", "Meta lead has no usable contact detail.");

  const leadInsert = await admin.from("leads").insert({
    person_name: name.slice(0, 160),
    contact_number: phone,
    email: email || "",
    team_size: parseTeamSize(team),
    shift: firstText(fields, ["shift", "working_hours"]).slice(0, 80) || "Flexible",
    workspace_option: workspaceOption(workspace),
    message: leadMessage(fields),
    meta_leadgen_id: event.leadgenId,
  }).select("id,person_name,email").maybeSingle();

  let lead = leadInsert.data;
  if (leadInsert.error?.code === "23505") {
    const existing = await admin.from("leads").select("id,person_name,email").eq("meta_leadgen_id", event.leadgenId).maybeSingle();
    if (existing.error || !existing.data) throw new MetaProcessingError("lead_idempotency", "Meta lead could not be resolved.");
    lead = existing.data;
  } else if (leadInsert.error || !lead) {
    throw new MetaProcessingError("lead_insert", "Meta lead could not be saved.");
  }

  const updated = await admin.from("os_meta_lead_events").update({
    lead_id: lead.id,
    status: "completed",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("leadgen_id", event.leadgenId).eq("status", "processing");
  if (updated.error) throw new MetaProcessingError("event_finalize", "Meta event could not be finalized.");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode") || "";
    const token = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge") || "";
    const expected = configured("META_WEBHOOK_VERIFY_TOKEN");
    if (mode !== "subscribe" || !challenge || !timingSafeStringEqual(token, expected)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    return new NextResponse(challenge.slice(0, 256), { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    if (error instanceof Error && error.message.includes("META_WEBHOOK_VERIFY_TOKEN")) {
      return NextResponse.json({ error: "Meta webhook verification is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Meta webhook verification failed." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let rawBody = "";
  let admin: SupabaseClient | null = null;
  let claimedLeadgenId = "";
  try {
    const appSecret = configured("META_APP_SECRET");
    const expectedPageId = configuredPageId();
    rawBody = await readLimitedBody(request);
    if (!rawBody || !verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    const parsed = metaWebhookSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return NextResponse.json({ error: "Invalid Meta webhook payload." }, { status: 400 });
    const events = extractLeadEvents(parsed.data, expectedPageId);
    if (!events.length) return NextResponse.json({ ok: true, ignored: true });

    admin = serviceClient();
    const results: string[] = [];
    for (const event of events) {
      const claim = await claimEvent(admin, event);
      if (!claim.claimed) {
        results.push(claim.event.status === "completed" ? "duplicate" : "in_progress");
        continue;
      }
      claimedLeadgenId = event.leadgenId;
      try {
        await processEvent(admin, event);
        results.push("processed");
      } catch (error) {
        const stage = error instanceof MetaProcessingError ? error.stage : "processing";
        await markEventFailed(admin, event.leadgenId, stage);
        throw error;
      } finally {
        claimedLeadgenId = "";
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    if (error instanceof Error && /not configured|invalid/i.test(error.message)) {
      return NextResponse.json({ error: "Meta webhook configuration is incomplete." }, { status: 503 });
    }
    if (admin && claimedLeadgenId) await markEventFailed(admin, claimedLeadgenId, "processing").catch(() => undefined);
    console.error("Meta lead webhook processing failed:", error instanceof MetaProcessingError ? error.stage : "processing");
    return NextResponse.json({ error: "Meta lead processing failed." }, { status: 500 });
  }
}
