import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : request.headers.get("x-cron-secret") || "";
  return supplied === secret;
}

function PakistanDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function dateAfterDays(days: number) {
  const current = PakistanDate();
  const target = new Date(Date.UTC(current.year, current.month - 1, current.day + days));
  return target.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const admin = serviceClient();
    const targetDueDate = dateAfterDays(5);
    const { data: invoices, error: invoiceError } = await admin
      .from("invoices")
      .select("id,invoice_number,due_date,payment_status")
      .eq("due_date", targetDueDate)
      .neq("payment_status", "paid")
      .neq("payment_status", "cancelled");
    if (invoiceError) throw invoiceError;

    const queued: string[] = [];
    const skipped: string[] = [];
    const failures: Array<{ invoice: string; error: string }> = [];
    for (const invoice of invoices || []) {
      const { data: existing, error: existingError } = await admin
        .from("invoice_email_queue")
        .select("id,status")
        .eq("invoice_id", invoice.id)
        .eq("delivery_kind", "reminder_5_days")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        skipped.push(invoice.invoice_number);
        continue;
      }

      const { error: queueError } = await admin.rpc("queue_invoice_email", { p_invoice_id: invoice.id, p_delivery_kind: "reminder_5_days" });
      if (queueError) failures.push({ invoice: invoice.invoice_number, error: queueError.message });
      else queued.push(invoice.invoice_number);
    }

    return NextResponse.json({ ok: true, targetDueDate, considered: invoices?.length || 0, queued, skipped, failures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice reminders could not be queued.";
    console.error("Invoice reminder queue failed:", error);
    return NextResponse.json({ error: message }, { status: message.includes("CRON_SECRET") ? 503 : 502 });
  }
}
