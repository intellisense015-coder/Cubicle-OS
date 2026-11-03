import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_BUCKET_LIMIT = 20_000;
const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export type SecurityAuditInput = {
  action: string;
  outcome: "success" | "denied" | "failure" | "rate_limited";
  actorUserId?: string | null;
  targetUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  request?: Request;
  metadata?: Record<string, unknown>;
};

function securitySecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || "cubicle-os-rate-limit-fallback";
}

function digest(value: string) {
  return createHmac("sha256", securitySecret()).update(value).digest("hex");
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function getClientIp(request: Request) {
  return firstForwardedValue(request.headers.get("x-vercel-forwarded-for"))
    || firstForwardedValue(request.headers.get("cf-connecting-ip"))
    || firstForwardedValue(request.headers.get("x-real-ip"))
    || firstForwardedValue(request.headers.get("x-forwarded-for"))
    || "unknown";
}

function fallbackConsume(bucketKey: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  for (const [key, entry] of fallbackBuckets) {
    if (entry.resetAt <= now) fallbackBuckets.delete(key);
  }
  if (!fallbackBuckets.has(bucketKey) && fallbackBuckets.size >= FALLBACK_BUCKET_LIMIT) {
    const oldestKey = fallbackBuckets.keys().next().value;
    if (oldestKey) fallbackBuckets.delete(oldestKey);
  }

  const existing = fallbackBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    fallbackBuckets.set(bucketKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(limit - 1, 0) };
  }

  existing.count = Math.min(existing.count + 1, limit + 1);
  const allowed = existing.count <= limit;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    remaining: Math.max(limit - existing.count, 0),
  };
}

async function consumeBucket(client: SupabaseClient | null, bucketKey: string, limit: number, windowSeconds: number) {
  if (!client) return fallbackConsume(bucketKey, limit, windowSeconds);

  const { data, error } = await client.rpc("consume_os_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // The fallback keeps a deployment usable while the OS migration is being
    // applied. Once the RPC exists, limits are shared across app instances.
    return fallbackConsume(bucketKey, limit, windowSeconds);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    retryAfterSeconds: Number(row?.retry_after_seconds || 0),
    remaining: Number(row?.remaining || 0),
  } satisfies RateLimitResult;
}

export async function checkRateLimits({
  client,
  request,
  scope,
  userId,
  ipLimit,
  userLimit,
  windowSeconds,
}: {
  client: SupabaseClient | null;
  request: Request;
  scope: string;
  userId?: string | null;
  ipLimit: number;
  userLimit?: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const ipResult = await consumeBucket(client, digest(`ip:${scope}:${getClientIp(request)}`), ipLimit, windowSeconds);
  if (!ipResult.allowed) return ipResult;
  if (!userId || !userLimit) return ipResult;
  return consumeBucket(client, digest(`user:${scope}:${userId}`), userLimit, windowSeconds);
}

export function rateLimitResponse(result: RateLimitResult) {
  return {
    status: 429,
    headers: { "Retry-After": String(Math.max(result.retryAfterSeconds, 1)) },
  };
}

export async function readJsonBody(request: Request, maxBytes: number, allowEmpty = false): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415 }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) return { ok: false, status: 415 };

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return { ok: false, status: 413 };

  if (!request.body) return allowEmpty ? { ok: true, value: {} } : { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes).trim();
  if (!text && allowEmpty) return { ok: true, value: {} };
  if (!text) return { ok: false, status: 400 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function requestBodyError(status: 400 | 413 | 415) {
  if (status === 413) return "Request body is too large.";
  if (status === 415) return "Unsupported request format.";
  return "Invalid request body.";
}

export async function recordSecurityAudit(client: SupabaseClient | null, input: SecurityAuditInput) {
  if (!client) return;
  const { error } = await client.from("os_security_audit_log").insert({
    action: input.action,
    outcome: input.outcome,
    actor_user_id: input.actorUserId || null,
    target_user_id: input.targetUserId || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    ip_hash: input.request ? digest(`audit-ip:${getClientIp(input.request)}`) : null,
    metadata: input.metadata || {},
  });
  if (error) console.warn("OS security audit write failed:", error.message);
}
