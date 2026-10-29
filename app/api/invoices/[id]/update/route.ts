import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: invoiceId } = await params;
    if (!invoiceId) return errorResponse("Invoice id is required.", 400);

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return errorResponse("Authentication is required.", 401);

    const userClient = authClient(token);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return errorResponse("Your session is invalid or expired.", 401);

    const { data: allowed, error: permissionError } = await userClient.rpc("is_permission_granted", { p_permission_key: "invoices.write" });
    if (permissionError || allowed !== true) return errorResponse("Invoice editing access required.", 403);

    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object") return errorResponse("Invoice changes are required.", 400);

    const invoice = input as Record<string, any>;
    const issueDate = dateKey(invoice.issueDate);
    const dueDate = dateKey(invoice.dueDate);
    const billingStartDate = dateKey(invoice.billingStartDate);
    const memberId = String(invoice.memberId || "").trim();
    if (!memberId || !issueDate || !dueDate) return errorResponse("A member, issue date and due date are required.", 400);
    if (billingStartDate && dueDate < billingStartDate) return errorResponse("Due date cannot be earlier than the billing start date.", 400);

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

    const admin = serviceClient();
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

    return NextResponse.json({ ok: true, invoice: updated, items: items || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice changes could not be saved.";
    console.error("Invoice update failed:", error);
    const status = message.includes("not configured") ? 503 : message.includes("permission") ? 403 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
