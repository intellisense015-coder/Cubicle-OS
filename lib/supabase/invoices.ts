import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { calculateInvoiceTotals, parseAmount } from "@/lib/invoice-calculations";

export type SupabaseInvoiceRow = {
  id: string;
  invoice_number: string;
  member_id: string;
  workspace_id: string | null;
  account_name: string;
  currency: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  billing_start_date: string | null;
  due_day: number;
  subtotal: number | string;
  tax_enabled: boolean;
  tax_rate: number | string;
  tax_amount: number | string;
  sales_tax_enabled?: boolean;
  sales_tax_rate?: number | string;
  sales_tax_amount?: number | string;
  total_amount: number | string;
  payment_status: string;
  email_status: string;
  grace_until: string | null;
  manual_date_override: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseInvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  sort_order: number;
  created_at: string;
};

const invoiceColumns = [
  "id",
  "invoice_number",
  "member_id",
  "workspace_id",
  "account_name",
  "currency",
  "period_start",
  "period_end",
  "issue_date",
  "due_date",
  "billing_start_date",
  "due_day",
  "subtotal",
  "tax_enabled",
  "tax_rate",
  "tax_amount",
  "sales_tax_enabled",
  "sales_tax_rate",
  "sales_tax_amount",
  "total_amount",
  "payment_status",
  "email_status",
  "grace_until",
  "manual_date_override",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

// Older production databases may not have received the Sales Tax migration
// yet. Keep a read/write compatibility projection so the register remains
// usable while the migration is being applied.
const legacyInvoiceColumns = [
  "id",
  "invoice_number",
  "member_id",
  "workspace_id",
  "account_name",
  "currency",
  "period_start",
  "period_end",
  "issue_date",
  "due_date",
  "billing_start_date",
  "due_day",
  "subtotal",
  "tax_enabled",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "payment_status",
  "email_status",
  "grace_until",
  "manual_date_override",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

const itemColumns = "id,invoice_id,description,quantity,unit_price,line_total,sort_order,created_at";

function amount(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function money(value: unknown) {
  return `PKR ${amount(value).toLocaleString("en-PK")}`;
}

function dateKey(value: unknown) {
  return String(value || "").slice(0, 10);
}

function monthLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function lastDayOfMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  if (!year || !month) return value;
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

function paymentStatus(value: unknown) {
  const normalized = String(value || "due_soon").toLowerCase();
  if (normalized === "due soon" || normalized === "due_soon") return "Due soon";
  if (normalized === "grace") return "Grace";
  if (normalized === "overdue") return "Overdue";
  if (normalized === "paid") return "Paid";
  return normalized === "cancelled" ? "Cancelled" : normalized === "draft" ? "Draft" : "Due soon";
}

function emailStatus(value: unknown) {
  const normalized = String(value || "not_sent").toLowerCase();
  if (normalized === "sent") return "Sent";
  if (normalized === "queued") return "Queued";
  if (normalized === "failed") return "Failed";
  return "Not sent";
}

export function mapSupabaseInvoiceToOsInvoice(row: SupabaseInvoiceRow, items: SupabaseInvoiceItemRow[] = []) {
  const charges = items
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({ description: item.description, amount: String(amount(item.line_total)) }));
  const firstItem = charges[0];
  return {
    id: row.id,
    invoice: row.invoice_number,
    workspaceId: row.workspace_id || "",
    memberId: row.member_id,
    account: row.account_name,
    period: monthLabel(row.period_start),
    amount: money(row.total_amount),
    unitPrice: money(row.subtotal),
    qty: "1",
    itemDescription: firstItem?.description || "Workspace monthly rent",
    issueDate: dateKey(row.issue_date),
    dueDate: dateKey(row.due_date),
    billingStartDate: dateKey(row.billing_start_date),
    dueDay: Number(row.due_day) || 5,
    manualDateOverride: row.manual_date_override,
    subtotal: String(amount(row.subtotal)),
    charges,
    items: items.map((item) => ({ description: item.description, price: String(amount(item.unit_price)), quantity: Number(item.quantity) || 1 })),
    taxEnabled: row.tax_enabled,
    taxRate: String(amount(row.tax_rate)),
    taxAmount: String(amount(row.tax_amount)),
    taxLabel: "WHT TAX",
    whtEnabled: row.tax_enabled,
    whtRate: String(amount(row.tax_rate)),
    whtAmount: String(amount(row.tax_amount)),
    salesTaxEnabled: row.sales_tax_enabled === true,
    salesTaxRate: String(amount(row.sales_tax_rate)),
    salesTaxAmount: String(amount(row.sales_tax_amount)),
    graceUntil: dateKey(row.grace_until),
    paymentStatus: paymentStatus(row.payment_status),
    emailStatus: emailStatus(row.email_status),
  };
}

async function currentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id || null;
}

export async function fetchSupabaseInvoices() {
  const client = getSupabaseBrowserClient();
  let { data: invoiceData, error: invoiceError } = await client
    .from("invoices")
    .select(invoiceColumns)
    .order("created_at", { ascending: false });

  if (invoiceError && isMissingSalesTaxColumn(invoiceError)) {
    const legacyResult = await client
      .from("invoices")
      .select(legacyInvoiceColumns)
      .order("created_at", { ascending: false });
    invoiceData = legacyResult.data;
    invoiceError = legacyResult.error;
  }
  if (invoiceError) throw invoiceError;
  const rows = (invoiceData || []) as unknown as SupabaseInvoiceRow[];
  if (!rows.length) return [];

  const { data: itemData, error: itemError } = await client
    .from("invoice_items")
    .select(itemColumns)
    .in("invoice_id", rows.map((row) => row.id))
    .order("sort_order", { ascending: true });

  if (itemError) throw itemError;
  const items = (itemData || []) as unknown as SupabaseInvoiceItemRow[];
  return rows.map((row) => mapSupabaseInvoiceToOsInvoice(row, items.filter((item) => item.invoice_id === row.id)));
}

function isMissingSalesTaxColumn(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("sales_tax_enabled") || message.includes("sales_tax_rate") || message.includes("sales_tax_amount");
}

export async function createSupabaseInvoice(invoice: any) {
  const issueDate = dateKey(invoice.issueDate) || new Date().toISOString().slice(0, 10);
  const periodStart = `${issueDate.slice(0, 7)}-01`;
  const items = Array.isArray(invoice.charges) && invoice.charges.length
    ? invoice.charges
    : [{ description: invoice.itemDescription || "Workspace monthly rent", amount: invoice.subtotal || invoice.amount }];
  const subtotal = parseAmount(invoice.subtotal || invoice.amount);
  const totals = calculateInvoiceTotals({
    subtotal,
    salesTaxEnabled: Boolean(invoice.salesTaxEnabled),
    salesTaxRate: invoice.salesTaxRate,
    whtEnabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled),
    whtRate: invoice.whtRate ?? invoice.taxRate,
  });
  const client = getSupabaseBrowserClient();
  const insertPayload = {
      invoice_number: invoice.invoice,
      member_id: invoice.memberId,
      workspace_id: invoice.workspaceId || null,
      account_name: invoice.account,
      period_start: periodStart,
      period_end: lastDayOfMonth(periodStart),
      issue_date: issueDate,
      due_date: dateKey(invoice.dueDate) || issueDate,
      billing_start_date: dateKey(invoice.billingStartDate) || null,
      due_day: Number(invoice.dueDay) || 5,
      subtotal: totals.subtotal,
      tax_enabled: Boolean(invoice.whtEnabled ?? invoice.taxEnabled) && totals.whtAmount > 0,
      tax_rate: totals.whtRate,
      tax_amount: totals.whtAmount,
      sales_tax_enabled: Boolean(invoice.salesTaxEnabled) && totals.salesTaxAmount > 0,
      sales_tax_rate: totals.salesTaxRate,
      sales_tax_amount: totals.salesTaxAmount,
      total_amount: totals.total,
      payment_status: String(invoice.paymentStatus || "Due soon").toLowerCase().replaceAll(" ", "_"),
      email_status: "not_sent",
      grace_until: dateKey(invoice.graceUntil) || null,
      manual_date_override: invoice.manualDateOverride === true,
      created_by: await currentUserId(),
    };
  let { data, error } = await client
    .from("invoices")
    .insert(insertPayload)
    .select(invoiceColumns)
    .single();

  if (error && isMissingSalesTaxColumn(error)) {
    const { sales_tax_enabled: _salesTaxEnabled, sales_tax_rate: _salesTaxRate, sales_tax_amount: _salesTaxAmount, ...legacyPayload } = insertPayload;
    const legacyResult = await client
      .from("invoices")
      .insert(legacyPayload)
      .select(legacyInvoiceColumns)
      .single();
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) throw error;
  const row = data as unknown as SupabaseInvoiceRow;
  const { data: itemData, error: itemError } = await client
    .from("invoice_items")
    .insert(items.map((item: any, index: number) => ({
      invoice_id: row.id,
      description: String(item.description || "Charge").trim(),
      quantity: Number(item.quantity) || 1,
      unit_price: amount(item.amount ?? item.price),
      sort_order: index,
    })))
    .select(itemColumns);

  if (itemError) throw itemError;
  return {
    ...mapSupabaseInvoiceToOsInvoice(row, (itemData || []) as unknown as SupabaseInvoiceItemRow[]),
    // Preserve the just-entered inclusive Sales Tax in the current client
    // session when the compatibility path had to use the legacy schema.
    salesTaxEnabled: Boolean(invoice.salesTaxEnabled) && totals.salesTaxAmount > 0,
    salesTaxRate: String(totals.salesTaxRate),
    salesTaxAmount: String(totals.salesTaxAmount),
    amount: `PKR ${totals.total.toLocaleString("en-PK")}`,
  };
}

export async function updateSupabaseInvoice(invoiceId: string, invoice: any) {
  const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again before editing an invoice.");
  const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/update`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Supabase could not save the invoice changes.");
  const refreshed = await fetchSupabaseInvoices();
  const saved = refreshed.find((item) => item.id === invoiceId);
  if (!saved) throw new Error("The invoice was saved but could not be reloaded from Supabase.");
  return saved;
}

export async function recordSupabaseInvoicePayment(invoiceId: string, amountToRecord: number, paymentMethod = "other", reference = "", notes = "") {
  const { data, error } = await getSupabaseBrowserClient().rpc("record_invoice_payment", {
    p_invoice_id: invoiceId,
    p_amount: amountToRecord,
    p_payment_method: paymentMethod,
    p_reference: reference || null,
    p_notes: notes || null,
  });

  if (error) throw error;
  return data as unknown as SupabaseInvoiceRow;
}

export async function queueSupabaseInvoiceEmail(invoiceId: string, deliveryKind = "initial") {
  const { data, error } = await getSupabaseBrowserClient().rpc("queue_invoice_email", {
    p_invoice_id: invoiceId,
    p_delivery_kind: deliveryKind,
  });

  if (error) throw error;
  return data as { id: string; status: string; recipient_email: string; invoice_id: string };
}
