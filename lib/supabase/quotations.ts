import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

export type SupabaseQuotationRow = {
  id: string;
  quotation_number: string;
  lead_id: string;
  company_name: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  issue_date: string;
  valid_until: string;
  status: string;
  subtotal: number | string;
  wht_enabled: boolean;
  wht_rate: number | string;
  wht_amount: number | string;
  sales_tax_enabled: boolean;
  sales_tax_rate: number | string;
  sales_tax_amount: number | string;
  total_amount: number | string;
  terms: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseQuotationItemRow = {
  id: string;
  quotation_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  sort_order: number;
  created_at: string;
};

const quotationColumns = [
  "id",
  "quotation_number",
  "lead_id",
  "company_name",
  "customer_name",
  "customer_email",
  "customer_phone",
  "issue_date",
  "valid_until",
  "status",
  "subtotal",
  "wht_enabled",
  "wht_rate",
  "wht_amount",
  "sales_tax_enabled",
  "sales_tax_rate",
  "sales_tax_amount",
  "total_amount",
  "terms",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

const itemColumns = "id,quotation_id,description,quantity,unit_price,line_total,sort_order,created_at";

function amount(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  return String(value || "").slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusLabel(value: unknown) {
  const normalized = String(value || "draft").toLowerCase();
  return normalized === "accepted"
    ? "Accepted"
    : normalized === "sent"
      ? "Sent"
      : normalized === "expired"
        ? "Expired"
        : "Draft";
}

function statusValue(value: unknown) {
  const normalized = String(value || "Draft").trim().toLowerCase();
  return ["draft", "sent", "accepted", "expired"].includes(normalized) ? normalized : "draft";
}

function money(value: unknown) {
  return `Rs. ${amount(value).toLocaleString("en-PK")}`;
}

function normalizeItems(items: any[] = []) {
  return items
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = amount(item.amount ?? item.price ?? item.unit_price);
      return {
        description: String(item.description || "Charge").trim(),
        quantity,
        unit_price: unitPrice,
        line_total: Math.round(unitPrice * quantity * 100) / 100,
        sort_order: index,
      };
    })
    .filter((item) => item.description);
}

export function mapSupabaseQuotationToOsQuotation(row: SupabaseQuotationRow, items: SupabaseQuotationItemRow[] = []) {
  const sortedItems = [...items].sort((left, right) => left.sort_order - right.sort_order);
  // Older quotation edits could leave the previous item rows in place when
  // the delete was subject to RLS. Hide those exact historical duplicates
  // while the corrected update path cleans them up on the next save.
  const uniqueItems = sortedItems.filter((item, index, allItems) => {
    const key = `${item.description.trim().toLowerCase()}|${amount(item.line_total)}|${Number(item.quantity) || 1}`;
    return allItems.findIndex((candidate) => `${candidate.description.trim().toLowerCase()}|${amount(candidate.line_total)}|${Number(candidate.quantity) || 1}` === key) === index;
  });
  const charges = uniqueItems.map((item) => ({
    id: item.id,
    description: item.description,
    amount: String(amount(item.line_total)),
    quantity: Number(item.quantity) || 1,
  }));
  const monthlyRentLine = charges.find((item) => item.description.trim().toLowerCase() === "monthly rent") || charges[0];
  const monthlyRent = monthlyRentLine?.amount || "0";

  return {
    id: row.id,
    backend: "supabase",
    quotation: row.quotation_number,
    leadId: row.lead_id,
    account: row.company_name || "Company",
    company: row.company_name || "",
    customerName: row.customer_name,
    customerEmail: row.customer_email || "",
    customerPhone: row.customer_phone || "",
    date: dateValue(row.issue_date),
    validUntil: dateValue(row.valid_until),
    validThrough: dateValue(row.valid_until),
    status: statusLabel(row.status),
    subtotal: String(amount(row.subtotal)),
    // Keep this numeric for the register formatter; the printable template
    // formats the value separately.
    amount: String(amount(row.total_amount)),
    taxEnabled: Boolean(row.wht_enabled),
    taxRate: String(amount(row.wht_rate)),
    taxAmount: String(amount(row.wht_amount)),
    taxLabel: "WHT TAX",
    whtEnabled: Boolean(row.wht_enabled),
    whtRate: String(amount(row.wht_rate)),
    whtAmount: String(amount(row.wht_amount)),
    salesTaxEnabled: Boolean(row.sales_tax_enabled),
    salesTaxRate: String(amount(row.sales_tax_rate)),
    salesTaxAmount: String(amount(row.sales_tax_amount)),
    totalAmount: String(amount(row.total_amount)),
    monthlyRent,
    monthlyRentDescription: monthlyRentLine?.description || "Monthly rent",
    terms: row.terms || "",
    charges,
    items: charges.map((item) => ({ description: item.description, price: item.amount, quantity: item.quantity })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id || null;
}

async function nextQuotationNumber() {
  const year = new Date().getFullYear();
  const prefix = `QUO-${year}-`;
  const { data, error } = await getSupabaseBrowserClient()
    .from("quotations")
    .select("quotation_number,created_at")
    .like("quotation_number", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  const highest = (data || []).reduce((current, row) => {
    const value = Number(String(row.quotation_number || "").slice(prefix.length));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 1000);
  return `${prefix}${highest + 1}`;
}

async function fetchQuotationItems(ids: string[]) {
  if (!ids.length) return [] as SupabaseQuotationItemRow[];
  const { data, error } = await getSupabaseBrowserClient()
    .from("quotation_items")
    .select(itemColumns)
    .in("quotation_id", ids)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as SupabaseQuotationItemRow[];
}

export async function fetchSupabaseQuotations() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("quotations")
    .select(quotationColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data || []) as unknown as SupabaseQuotationRow[];
  const items = await fetchQuotationItems(rows.map((row) => row.id));
  return rows.map((row) => mapSupabaseQuotationToOsQuotation(row, items.filter((item) => item.quotation_id === row.id)));
}

export async function createSupabaseQuotation(input: any) {
  const result = await secureOsMutation<{ row: SupabaseQuotationRow; items: SupabaseQuotationItemRow[] }>("quotation.create", { input });
  return mapSupabaseQuotationToOsQuotation(result.row, result.items);
}

export async function updateSupabaseQuotation(id: string, input: any) {
  const result = await secureOsMutation<{ row: SupabaseQuotationRow; items: SupabaseQuotationItemRow[] }>("quotation.update", { id, input });
  return mapSupabaseQuotationToOsQuotation(result.row, result.items);
}

export async function updateSupabaseQuotationStatus(id: string, status: string) {
  const result = await secureOsMutation<{ row: SupabaseQuotationRow; items: SupabaseQuotationItemRow[] }>("quotation.status", { id, status });
  return mapSupabaseQuotationToOsQuotation(result.row, result.items);
}
