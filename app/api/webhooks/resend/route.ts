import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const signatureToleranceSeconds = 5 * 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResendEvent = {
  type?: unknown;
  created_at?: unknown;
  data?: Record<string, unknown>;
};

type DeliveryState = "sent" | "delivered" | "queued" | "delayed" | "bounced" | "complained" | "suppressed" | "failed";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function configuredWebhookSecret() {
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured.");
  return secret;
}

function secretBytes(secret: string) {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signatureMatches(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected, "base64");
  const suppliedBytes = Buffer.from(supplied, "base64");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function verifyResendSignature(body: string, headers: Headers) {
  const webhookId = headers.get("svix-id") || "";
  const webhookTimestamp = headers.get("svix-timestamp") || "";
  const webhookSignature = headers.get("svix-signature") || "";
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const timestamp = Number(webhookTimestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > signatureToleranceSeconds) return false;

  const signedPayload = `${webhookId}.${webhookTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes(configuredWebhookSecret())).update(signedPayload).digest("base64");
  return webhookSignature
    .split(" ")
    .map((value) => value.trim())
    .filter(Boolean)
    .some((value) => {
      const [version, signature] = value.split(",", 2);
      return version === "v1" && Boolean(signature) && signatureMatches(expected, signature);
    });
}

function stringValue(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function tagsFrom(data: Record<string, unknown>) {
  const tags = data.tags;
  const result = new Map<string, string>();
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!tag || typeof tag !== "object") continue;
      const name = stringValue((tag as Record<string, unknown>).name);
      const value = stringValue((tag as Record<string, unknown>).value);
      if (name && value) result.set(name, value);
    }
  } else if (tags && typeof tags === "object") {
    for (const [name, value] of Object.entries(tags)) {
      const normalized = stringValue(value);
      if (normalized) result.set(name, normalized);
    }
  }
  return result;
}

function deliveryState(eventType: string): DeliveryState | null {
  if (eventType === "email.sent") return "sent";
  if (eventType === "email.delivered") return "delivered";
  if (eventType === "email.delivery_delayed") return "delayed";
  if (eventType === "email.bounced") return "bounced";
  if (eventType === "email.complained") return "complained";
  if (eventType === "email.suppressed") return "suppressed";
  if (eventType === "email.failed") return "failed";
  return null;
}

function activityDeliveryStatus(state: DeliveryState) {
  return state === "bounced" || state === "complained" || state === "suppressed" || state === "failed" ? "failed" : state === "queued" || state === "delayed" ? "pending" : "sent";
}

function terminalState(state: DeliveryState) {
  return state !== "queued" && state !== "delayed";
}

function stateRank(state: DeliveryState) {
  if (state === "queued" || state === "delayed") return 1;
  if (state === "sent") return 2;
  return 3;
}

function eventReason(data: Record<string, unknown>) {
  return stringValue(data.reason) || stringValue(data.message) || stringValue(data.error) || null;
}

async function findActivity(admin: any, invoiceId: string | null, activityId: string | null, emailId: string | null) {
  if (activityId && isUuid(activityId)) {
    const { data, error } = await admin.from("activity_log").select("id,entity_id,metadata,delivery_status").eq("id", activityId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (emailId) {
    const { data, error } = await admin
      .from("activity_log")
      .select("id,entity_id,metadata,delivery_status")
      .in("action", ["invoice.email_delivery", "invoice.email"])
      .filter("metadata->>provider_message_id", "eq", emailId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (invoiceId) {
    const { data, error } = await admin
      .from("activity_log")
      .select("id,entity_id,metadata,delivery_status")
      .in("action", ["invoice.email_delivery", "invoice.email"])
      .eq("entity_id", invoiceId)
      .eq("delivery_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function findQueue(admin: any, invoiceId: string | null, queueId: string | null, emailId: string | null) {
  if (queueId && isUuid(queueId)) {
    const { data, error } = await admin.from("invoice_email_queue").select("id,invoice_id,status,provider_message_id").eq("id", queueId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (emailId) {
    const { data, error } = await admin.from("invoice_email_queue").select("id,invoice_id,status,provider_message_id").eq("provider_message_id", emailId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (invoiceId) {
    const { data, error } = await admin
      .from("invoice_email_queue")
      .select("id,invoice_id,status,provider_message_id")
      .eq("invoice_id", invoiceId)
      .in("status", ["queued", "processing", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

export async function POST(request: Request) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    if (!verifyResendSignature(rawBody, request.headers)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });

    const event = JSON.parse(rawBody) as ResendEvent;
    const eventType = stringValue(event.type);
    const state = eventType ? deliveryState(eventType) : null;
    if (!eventType || !state) return NextResponse.json({ ok: true, ignored: true });

    const data = event.data && typeof event.data === "object" ? event.data : {};
    const tags = tagsFrom(data);
    const taggedInvoiceId = tags.get("invoice_id");
    const invoiceId = isUuid(taggedInvoiceId) ? taggedInvoiceId : null;
    const activityId = isUuid(tags.get("activity_id")) ? tags.get("activity_id") || null : null;
    const queueId = isUuid(tags.get("queue_id")) ? tags.get("queue_id") || null : null;
    const emailId = stringValue(data.email_id) || stringValue(data.id);
    const providerReason = eventReason(data);
    const admin = serviceClient();
    const activity = await findActivity(admin, invoiceId, activityId, emailId);
    const queue = await findQueue(admin, invoiceId, queueId, emailId);
    const resolvedInvoiceId = invoiceId || activity?.entity_id || queue?.invoice_id || null;

    const existingEventType = stringValue(activity?.metadata?.resend_event_type);
    const existingState = existingEventType ? deliveryState(existingEventType) : null;
    const incomingEventTime = Date.parse(String(event.created_at || ""));
    const existingEventTime = Date.parse(String(activity?.metadata?.resend_event_created_at || ""));
    const isOlderEvent = existingState && stateRank(existingState) > stateRank(state)
      || Number.isFinite(incomingEventTime) && Number.isFinite(existingEventTime) && incomingEventTime < existingEventTime;
    if (isOlderEvent) return NextResponse.json({ ok: true, ignored: true, reason: "stale_event" });

    if (resolvedInvoiceId) {
      const { error } = await admin.from("invoices").update({ email_status: state }).eq("id", resolvedInvoiceId);
      if (error) throw error;
    }

    const now = new Date().toISOString();
    if (activity) {
      const existingMetadata = activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {};
      const metadata = {
        ...existingMetadata,
        provider: "resend",
        provider_message_id: emailId || existingMetadata.provider_message_id || null,
        resend_email_id: emailId || existingMetadata.resend_email_id || null,
        resend_event_type: eventType,
        resend_event_id: request.headers.get("svix-id"),
        resend_event_created_at: stringValue(event.created_at),
        ...(providerReason ? { resend_reason: providerReason } : {}),
      };
      const { error } = await admin.from("activity_log").update({
        delivery_status: activityDeliveryStatus(state),
        completed_at: terminalState(state) ? now : null,
        metadata,
      }).eq("id", activity.id);
      if (error) throw error;
    }

    if (queue) {
      const queueUpdate: Record<string, unknown> = {
        status: state === "queued" || state === "delayed" ? "queued" : state === "bounced" || state === "complained" || state === "suppressed" || state === "failed" ? "failed" : "sent",
        provider_message_id: emailId || queue.provider_message_id || null,
        last_error: providerReason || null,
        updated_at: now,
      };
      if (state === "sent" || state === "delivered") queueUpdate.sent_at = now;
      const { error } = await admin.from("invoice_email_queue").update(queueUpdate).eq("id", queue.id);
      if (error) throw error;
    }

    if (!resolvedInvoiceId && !activity && !queue) console.warn("Resend webhook did not match an invoice delivery:", { eventType, emailId });
    return NextResponse.json({ ok: true, matched: Boolean(resolvedInvoiceId || activity || queue), status: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend webhook processing failed.";
    if (message.includes("RESEND_WEBHOOK_SECRET")) return NextResponse.json({ error: "Resend webhook secret is not configured." }, { status: 503 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    console.error("Resend webhook processing failed:", error);
    return NextResponse.json({ error: "Resend webhook processing failed." }, { status: 500 });
  }
}
