import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";
import { checkRateLimits, rateLimitResponse, readJsonBody, recordSecurityAudit, requestBodyError } from "@/lib/server-security";
import { z } from "zod";

export const runtime = "nodejs";

const invoiceColumns = "id,invoice_number,member_id,workspace_id,account_name,currency,period_start,period_end,issue_date,due_date,billing_start_date,due_day,subtotal,tax_enabled,tax_rate,tax_amount,sales_tax_enabled,sales_tax_rate,sales_tax_amount,total_amount,payment_status,email_status,grace_until,manual_date_override,created_by,created_at,updated_at";
const legacyInvoiceColumns = "id,invoice_number,member_id,workspace_id,account_name,currency,period_start,period_end,issue_date,due_date,billing_start_date,due_day,subtotal,tax_enabled,tax_rate,tax_amount,total_amount,payment_status,email_status,grace_until,manual_date_override,created_by,created_at,updated_at";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isMissingSalesTaxColumn(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("sales_tax_enabled") || message.includes("sales_tax_rate") || message.includes("sales_tax_amount");
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

function dateKey(value: unknown) {
  const valueString = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(valueString) ? valueString : "";
}

function lastDayOfMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  if (!year || !month) return value;
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

function normalizedStatus(value: unknown, fallback = "due_soon") {
  return String(value || fallback).toLowerCase().replaceAll(" ", "_");
}

function boundedNumeric(value: unknown, maximum = 1_000_000_000_000) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 64) return false;
  const normalized = raw.replace(/^(?:PKR|Rs\.?)[\s]*/i, "").replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validInvoiceItems(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    const allowedKeys = new Set(["description", "amount", "price", "quantity"]);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
    if (typeof record.description !== "string") return false;
    const description = record.description.trim();
    const amount = record.amount ?? record.price;
    const quantity = record.quantity === undefined ? 1 : Number(record.quantity);
    return description.length >= 1 && description.length <= 240 && boundedNumeric(amount) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 10000;
  });
}

const invoiceUpdateKeys = new Set([
  "id", "invoice", "workspaceId", "memberId", "account", "period", "amount", "unitPrice", "qty", "itemDescription",
  "issueDate", "dueDate", "billingStartDate", "dueDay", "manualDateOverride", "subtotal", "charges", "items", "taxEnabled",
  "taxRate", "taxAmount", "taxLabel", "whtEnabled", "whtRate", "whtAmount", "salesTaxEnabled", "salesTaxRate", "salesTaxAmount",
  "graceUntil", "paymentStatus", "emailStatus",
]);

function validInvoiceUpdateShape(invoice: Record<string, unknown>) {
  if (Object.keys(invoice).some((key) => !invoiceUpdateKeys.has(key))) return false;
  if (typeof invoice.memberId !== "string" || typeof invoice.account !== "string" || invoice.account.trim().length < 1 || invoice.account.trim().length > 240) return false;
  if (invoice.workspaceId !== undefined && invoice.workspaceId !== "" && !z.string().uuid().safeParse(invoice.workspaceId).success) return false;
  if (invoice.itemDescription !== undefined && (typeof invoice.itemDescription !== "string" || invoice.itemDescription.trim().length > 240)) return false;
  if (invoice.dueDay !== undefined) {
    const dueDay = Number(invoice.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return false;
  }
  for (const key of ["manualDateOverride", "taxEnabled", "whtEnabled", "salesTaxEnabled"] as const) {
    if (invoice[key] !== undefined && typeof invoice[key] !== "boolean") return false;
  }
  const paymentStatus = invoice.paymentStatus === undefined ? "due_soon" : normalizedStatus(invoice.paymentStatus);
  if (!["due_soon", "paid", "overdue", "grace", "grace_period", "cancelled", "draft"].includes(paymentStatus)) return false;
  if (invoice.graceUntil !== undefined && invoice.graceUntil !== "" && (typeof invoice.graceUntil !== "string" || !validDate(dateKey(invoice.graceUntil)))) return false;
  return true;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  let actorUserId = "";
  let invoiceId = "";
  try {
    const { id } = await params;
    invoiceId = String(id || "").trim();
    if (!invoiceId) return errorResponse("Invoice id is required.", 400);
    if (!z.string().uuid().safeParse(invoiceId).success) return errorResponse("Invoice not found.", 404);

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);
    actorUserId = userData.user.id;

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "invoices.write" });
    if (permissionError || allowed !== true) return errorResponse("Invoice editing access required.", 403);

    const body = await readJsonBody(request, 64 * 1024);
    if (!body.ok) {
      const status = "status" in body ? body.status : 400;
      return errorResponse(requestBodyError(status), status);
    }
    if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return errorResponse("Invoice changes are required.", 400);

    const invoice = body.value as Record<string, any>;
    if (!validInvoiceUpdateShape(invoice)) return errorResponse("Invoice changes are invalid.", 400);
    const issueDate = dateKey(invoice.issueDate);
    const dueDate = dateKey(invoice.dueDate);
    const billingStartDate = dateKey(invoice.billingStartDate);
    const memberId = String(invoice.memberId || "").trim();
    if (!z.string().uuid().safeParse(memberId).success || !issueDate || !dueDate || !validDate(issueDate) || !validDate(dueDate) || (billingStartDate && !validDate(billingStartDate))) return errorResponse("A valid member and invoice dates are required.", 400);
    if (billingStartDate && dueDate < billingStartDate) return errorResponse("Due date cannot be earlier than the billing start date.", 400);
    if (!boundedNumeric(invoice.subtotal ?? invoice.amount) || (invoice.salesTaxRate !== undefined && !boundedNumeric(invoice.salesTaxRate, 1000)) || (invoice.whtRate !== undefined && !boundedNumeric(invoice.whtRate, 1000))) return errorResponse("Invoice amounts and rates are invalid.", 400);
    if (invoice.charges !== undefined && !validInvoiceItems(invoice.charges)) return errorResponse("Invoice charges are invalid.", 400);
    if (invoice.items !== undefined && !validInvoiceItems(invoice.items)) return errorResponse("Invoice items are invalid.", 400);
    if (invoice.itemDescription !== undefined && String(invoice.itemDescription).trim().length > 240) return errorResponse("Invoice item description is too long.", 400);

    const rawItems = Array.isArray(invoice.charges) && invoice.charges.length
      ? invoice.charges
      : Array.isArray(invoice.items) && invoice.items.length
        ? invoice.items
        : [{ description: invoice.itemDescription || "Workspace monthly rent", amount: invoice.subtotal || invoice.amount }];
    const subtotal = parseAmount(invoice.subtotal || invoice.amount);
    const totals = calculateInvoiceTotals({
      subtotal,
      salesTaxEnabled: Boolean(invoice.salesTaxEnabled),
      salesTaxRate: invoice.salesTaxRate,
      whtEnabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled),
      whtRate: invoice.whtRate ?? invoice.taxRate,
    });

    admin = serviceClient();
    const rateLimit = await checkRateLimits({
      client: admin,
      request,
      scope: "invoice.update",
      userId: actorUserId,
      ipLimit: 60,
      userLimit: 60,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      await recordSecurityAudit(admin, { action: "invoice.update", outcome: "rate_limited", actorUserId, entityType: "invoice", entityId: invoiceId, request, metadata: { scope: "invoice.update" } });
      const response = rateLimitResponse(rateLimit);
      return NextResponse.json({ error: "Too many invoice update requests. Please try again later." }, response);
    }
    const { data: existing, error: existingError } = await admin
      .from("invoices")
      .select("id,due_date")
      .eq("id", invoiceId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return errorResponse("Invoice not found.", 404);

    const updatePayload = {
      member_id: memberId,
      workspace_id: invoice.workspaceId || null,
      account_name: String(invoice.account || "").trim(),
      period_start: `${issueDate.slice(0, 7)}-01`,
      period_end: lastDayOfMonth(`${issueDate.slice(0, 7)}-01`),
      issue_date: issueDate,
      due_date: dueDate,
      billing_start_date: billingStartDate || null,
      due_day: Number(invoice.dueDay) || 5,
      subtotal: totals.subtotal,
      tax_enabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled) && totals.whtAmount > 0,
      tax_rate: totals.whtRate,
      tax_amount: totals.whtAmount,
      sales_tax_enabled: Boolean(invoice.salesTaxEnabled) && totals.salesTaxAmount > 0,
      sales_tax_rate: totals.salesTaxRate,
      sales_tax_amount: totals.salesTaxAmount,
      total_amount: totals.total,
      payment_status: normalizedStatus(invoice.paymentStatus),
      grace_until: dateKey(invoice.graceUntil) || null,
      manual_date_override: invoice.manualDateOverride === true,
    };

    let updated: any;
    let updateError: any;
    ({ data: updated, error: updateError } = await admin
      .from("invoices")
      .update(updatePayload)
      .eq("id", invoiceId)
      .select(invoiceColumns)
      .single());

    if (updateError && isMissingSalesTaxColumn(updateError)) {
      const { sales_tax_enabled: _salesTaxEnabled, sales_tax_rate: _salesTaxRate, sales_tax_amount: _salesTaxAmount, ...legacyPayload } = updatePayload;
      const legacyResult = await admin
        .from("invoices")
        .update(legacyPayload)
        .eq("id", invoiceId)
        .select(legacyInvoiceColumns)
        .single();
      updated = legacyResult.data;
      updateError = legacyResult.error;
    }
    if (updateError) throw updateError;

    const { error: deleteItemsError } = await admin.from("invoice_items").delete().eq("invoice_id", invoiceId);
    if (deleteItemsError) throw deleteItemsError;
    const { data: items, error: itemError } = await admin
      .from("invoice_items")
      .insert(rawItems.map((item: any, index: number) => ({
        invoice_id: invoiceId,
        description: String(item.description || "Charge").trim(),
        quantity: Number(item.quantity) || 1,
        unit_price: parseAmount(item.amount ?? item.price),
        sort_order: index,
      })))
      .select("id,invoice_id,description,quantity,unit_price,line_total,sort_order,created_at");
    if (itemError) throw itemError;

    if (String(existing.due_date || "").slice(0, 10) !== dueDate) {
      await admin
        .from("invoice_email_queue")
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("delivery_kind", "reminder_5_days")
        .eq("status", "queued");
    }

    await recordSecurityAudit(admin, { action: "invoice.update", outcome: "success", actorUserId, entityType: "invoice", entityId: invoiceId, request, metadata: { item_count: (items || []).length } });
    return NextResponse.json({ ok: true, invoice: updated, items: items || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice changes could not be saved.";
    if (admin && invoiceId) await recordSecurityAudit(admin, { action: "invoice.update", outcome: "failure", actorUserId: actorUserId || null, entityType: "invoice", entityId: invoiceId, request, metadata: { reason: "update_failed" } });
    console.error("Invoice update failed:", error);
    const status = message.includes("not configured") ? 503 : message.includes("permission") ? 403 : 502;
    return NextResponse.json({ error: "Invoice changes could not be saved." }, { status });
  }
}
