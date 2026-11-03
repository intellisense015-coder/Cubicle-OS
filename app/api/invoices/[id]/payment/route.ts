import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  checkRateLimits,
  rateLimitResponse,
  readJsonBody,
  recordSecurityAudit,
  requestBodyError,
} from "@/lib/server-security";

export const runtime = "nodejs";

const paymentSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000_000),
  paymentMethod: z.enum(["cash", "bank_transfer", "card", "other"]).default("other"),
  reference: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(1000).default(""),
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

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  let actorUserId = "";
  let invoiceId = "";

  try {
    const { id } = await params;
    invoiceId = String(id || "").trim();
    if (!invoiceId || !z.string().uuid().safeParse(invoiceId).success) return errorResponse("Invoice not found.", 404);

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);
    actorUserId = userData.user.id;

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", {
      p_permission_key: "invoices.write",
    });
    if (permissionError || allowed !== true) return errorResponse("Invoice payment access required.", 403);

    const body = await readJsonBody(request, 8 * 1024);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return errorResponse(requestBodyError(status), status);
    }
    const parsed = paymentSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse("Enter a valid payment amount and payment details.", 400);

    admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "invoice.payment",
      userId: actorUserId,
      ipLimit: 30,
      userLimit: 20,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, {
        action: "invoice.payment",
        outcome: "rate_limited",
        actorUserId,
        entityType: "invoice",
        entityId: invoiceId,
        request,
        metadata: { scope: "invoice.payment" },
      });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many payment requests. Please try again later." }, response);
    }

    const { data, error } = await userClient.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.paymentMethod,
      p_reference: parsed.data.reference || null,
      p_notes: parsed.data.notes || null,
    });
    if (error) throw error;

    await recordSecurityAudit(admin, {
      action: "invoice.payment",
      outcome: "success",
      actorUserId,
      entityType: "invoice",
      entityId: invoiceId,
      request,
      metadata: { amount: parsed.data.amount, payment_method: parsed.data.paymentMethod },
    });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (error) {
    if (admin && invoiceId) {
      await recordSecurityAudit(admin, {
        action: "invoice.payment",
        outcome: "failure",
        actorUserId: actorUserId || null,
        entityType: "invoice",
        entityId: invoiceId,
        request,
        metadata: { reason: "payment_failed" },
      });
    }
    console.error("Invoice payment failed:", error);
    return NextResponse.json({ error: "The invoice payment could not be recorded." }, { status: 400 });
  }
}
