import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseVisitStatus = "Scheduled" | "Completed" | "Cancelled" | "No-show";

export type SupabaseVisitRow = {
  id: string;
  lead_id: string;
  visitor_name: string;
  company_name: string | null;
  visit_date: string;
  visit_time: string;
  host: string;
  purpose: string;
  status: SupabaseVisitStatus;
  notes: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const visitColumns = [
  "id",
  "lead_id",
  "visitor_name",
  "company_name",
  "visit_date",
  "visit_time",
  "host",
  "purpose",
  "status",
  "notes",
  "created_by",
  "completed_at",
  "created_at",
  "updated_at",
].join(",");

function normalizeTime(value: unknown) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return String(value || "");
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

async function currentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id || null;
}

export function mapSupabaseVisitToOsVisit(row: SupabaseVisitRow) {
  return {
    id: row.id,
    backend: "supabase",
    leadId: row.lead_id,
    visitor: row.visitor_name,
    company: row.company_name || "",
    date: row.visit_date,
    time: String(row.visit_time || "").slice(0, 5),
    host: row.host,
    purpose: row.purpose,
    status: row.status,
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSupabaseVisits() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("visits")
    .select(visitColumns)
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as SupabaseVisitRow[];
}

export async function createSupabaseVisit(visit: {
  leadId: string;
  visitor: string;
  company?: string;
  date: string;
  time: string;
  host: string;
  purpose: string;
  notes?: string;
}) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("visits")
    .insert({
      lead_id: visit.leadId,
      visitor_name: visit.visitor,
      company_name: visit.company?.trim() || null,
      visit_date: visit.date,
      visit_time: normalizeTime(visit.time),
      host: visit.host,
      purpose: visit.purpose.trim(),
      status: "Scheduled",
      notes: visit.notes?.trim() || null,
      created_by: await currentUserId(),
    })
    .select(visitColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseVisitRow;
}

export async function updateSupabaseVisitStatus(id: string, status: SupabaseVisitStatus) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("visits")
    .update({
      status,
      completed_at: status === "Completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select(visitColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseVisitRow;
}
