import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimits, rateLimitResponse, recordSecurityAudit } from "@/lib/server-security";

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

function localPakistanDateTime() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, day: Number(values.day), time: `${values.hour}:${values.minute}`, year: Number(values.year), month: Number(values.month) };
}

function dateParts(value: string) { const [year, month, day] = value.split("-").map(Number); return { year, month, day }; }
function dateKey(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function addMonths(periodStart: string, months: number) {
  const { year, month } = dateParts(periodStart);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  return dateKey(target.getUTCFullYear(), target.getUTCMonth() + 1, 1);
}
function billingPeriodFor(sendDate: string, sendDay: number, dueDay: number) {
  const currentPeriod = `${sendDate.slice(0, 7)}-01`;
  return sendDay > dueDay ? addMonths(currentPeriod, 1) : currentPeriod;
}
function lastDayOfMonth(periodStart: string) { const { year, month } = dateParts(periodStart); return dateKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()); }
function dueDateFor(periodStart: string, dueDay: number, billingStartDate: string | null) {
  const { year, month } = dateParts(periodStart);
  const day = Math.min(Math.max(Number(dueDay) || 5, 1), new Date(Date.UTC(year, month, 0)).getUTCDate());
  const dueDate = dateKey(year, month, day);
  return billingStartDate && billingStartDate.slice(0, 7) === periodStart.slice(0, 7) && dueDate < billingStartDate ? billingStartDate : dueDate;
}
function amount(value: unknown) { const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0; }

async function nextInvoiceNumber(admin: any, year: number, seed = 1000) {
  const prefix = `INV-${year}-`;
  const { data, error } = await admin.from("invoices").select("invoice_number").like("invoice_number", `${prefix}%`).limit(2000);
  if (error) throw error;
  return (data || []).reduce((highest: number, row: any) => { const sequence = Number(String(row.invoice_number || "").slice(prefix.length)); return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest; }, seed) + 1;
}

async function claimPeriod(admin: any, periodStart: string) {
  const { error } = await admin.from("invoice_automation_runs").insert({ period_start: periodStart, status: "running", started_at: new Date().toISOString() });
  if (!error) return { claimed: true, completed: false };
  if (String(error.code) !== "23505") throw error;
  const { data: existing, error: readError } = await admin.from("invoice_automation_runs").select("status,started_at").eq("period_start", periodStart).maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "completed") return { claimed: false, completed: true };
  const startedAt = new Date(existing?.started_at || 0).getTime();
  if (existing?.status === "running" && Number.isFinite(startedAt) && Date.now() - startedAt < 30 * 60_000) return { claimed: false, completed: false };
  const { error: retryError } = await admin.from("invoice_automation_runs").update({ status: "running", started_at: new Date().toISOString(), completed_at: null, last_error: null }).eq("period_start", periodStart);
  if (retryError) throw retryError;
  return { claimed: true, completed: false };
}

export async function GET(request: Request) {
  let admin: ReturnType<typeof serviceClient> | null = null;
  const localNow = localPakistanDateTime();
  const periodStart = `${localNow.year}-${String(localNow.month).padStart(2, "0")}-01`;
  try {
    if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    admin = serviceClient();
    const rateLimit = await checkRateLimits({ client: admin, request, scope: "invoice.automation.run", ipLimit: 10, windowSeconds: 60 });
    if (!rateLimit.allowed) { await recordSecurityAudit(admin, { action: "invoice.automation.run", outcome: "rate_limited", request, metadata: { scope: "invoice.automation.run" } }); return NextResponse.json({ error: "Too many automation requests. Please try again later." }, rateLimitResponse(rateLimit)); }
    const { data: settings, error: settingsError } = await admin.from("invoice_automation_settings").select("enabled,send_day,send_time,member_ids,timezone").eq("id", 1).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.enabled) return NextResponse.json({ ok: true, skipped: "disabled" });
    const sendDay = Number(settings.send_day) || 1;
    const sendTime = String(settings.send_time || "09:00:00").slice(0, 5);
    if (localNow.day < sendDay || localNow.time < sendTime) return NextResponse.json({ ok: true, skipped: "not_due", periodStart, localTime: localNow.time });
    const memberIds = Array.isArray(settings.member_ids) ? [...new Set(settings.member_ids.map((id: unknown) => String(id)).filter(Boolean))] : [];
    if (!memberIds.length) return NextResponse.json({ error: "No invoice recipients are configured." }, { status: 409 });
    const claim = await claimPeriod(admin, periodStart);
    if (!claim.claimed) return NextResponse.json({ ok: true, skipped: claim.completed ? "already_completed" : "already_running", periodStart });

    const { data: members, error: membersError } = await admin.from("members").select("id,member_name,email,company_name,assigned_space,monthly_rent,billing_start_date,due_day,status,membership_status").in("status", ["active", "activated"]).in("id", memberIds);
    if (membersError) throw membersError;
    const sequenceByYear = new Map<number, number>();
    let generatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures: Array<{ member: string; error: string }> = [];

    for (const member of members || []) {
      const dueDay = Number(member.due_day) || 5;
      const billingPeriodStart = billingPeriodFor(localNow.date, sendDay, dueDay);
      const invoiceYear = dateParts(billingPeriodStart).year;
      const { data: existing, error: existingError } = await admin.from("invoices").select("id,invoice_number").eq("member_id", member.id).eq("period_start", billingPeriodStart).limit(1);
      if (existingError) throw existingError;
      if (existing?.length) { skippedCount += 1; continue; }
      const subtotal = amount(member.monthly_rent);
      if (subtotal <= 0) { failedCount += 1; failures.push({ member: member.member_name, error: "Monthly rent is zero." }); continue; }
      if (!sequenceByYear.has(invoiceYear)) sequenceByYear.set(invoiceYear, await nextInvoiceNumber(admin, invoiceYear));
      const invoiceSequence = sequenceByYear.get(invoiceYear) as number;
      sequenceByYear.set(invoiceYear, invoiceSequence + 1);
      const invoiceNumber = `INV-${invoiceYear}-${invoiceSequence}`;
      const billingStartDate = member.billing_start_date || billingPeriodStart;
      const dueDate = dueDateFor(billingPeriodStart, dueDay, billingStartDate);
      const accountName = `${member.member_name} - ${member.company_name || "No company"}`;
      const { data: invoice, error: invoiceError } = await admin.from("invoices").insert({ invoice_number: invoiceNumber, member_id: member.id, workspace_id: member.assigned_space || null, account_name: accountName, currency: "PKR", period_start: billingPeriodStart, period_end: lastDayOfMonth(billingPeriodStart), issue_date: localNow.date, due_date: dueDate, billing_start_date: billingStartDate, due_day: dueDay, subtotal, tax_enabled: false, tax_rate: 0, tax_amount: 0, sales_tax_enabled: false, sales_tax_rate: 0, sales_tax_amount: 0, total_amount: subtotal, payment_status: "due_soon", email_status: "not_sent", grace_until: null, manual_date_override: false }).select("id,invoice_number").single();
      if (invoiceError) { if (String(invoiceError.code) === "23505") { skippedCount += 1; continue; } failedCount += 1; failures.push({ member: member.member_name, error: "Invoice could not be created." }); continue; }
      const { error: itemError } = await admin.from("invoice_items").insert({ invoice_id: invoice.id, description: member.assigned_space ? `${member.assigned_space} workspace service` : "Workspace monthly rent", quantity: 1, unit_price: subtotal, sort_order: 0 });
      if (itemError) { await admin.from("invoices").delete().eq("id", invoice.id); failedCount += 1; failures.push({ member: member.member_name, error: "Invoice line item could not be created." }); continue; }
      const { error: queueError } = await admin.rpc("queue_invoice_email", { p_invoice_id: invoice.id, p_delivery_kind: "initial" });
      if (queueError) { await admin.from("invoices").update({ email_status: "failed" }).eq("id", invoice.id); failedCount += 1; failures.push({ member: member.member_name, error: "Invoice was created but could not be queued for email." }); continue; }
      generatedCount += 1;
    }

    const { error: completeError } = await admin.from("invoice_automation_runs").update({ status: "completed", generated_count: generatedCount, skipped_count: skippedCount, failed_count: failedCount, completed_at: new Date().toISOString(), last_error: failures.length ? JSON.stringify(failures).slice(0, 4000) : null }).eq("period_start", periodStart);
    if (completeError) throw completeError;
    return NextResponse.json({ ok: true, periodStart, generatedCount, skippedCount, failedCount, failures });
  } catch (error) {
    console.error("Recurring invoice generation failed:", error);
    if (admin) await admin.from("invoice_automation_runs").update({ status: "failed", completed_at: new Date().toISOString(), last_error: "Recurring invoice generation failed." }).eq("period_start", periodStart);
    return NextResponse.json({ error: "Recurring invoices could not be generated." }, { status: 502 });
  }
}
