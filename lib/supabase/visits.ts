import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

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
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  cancellation_details: string | null;
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
  "cancelled_at",
  "cancelled_by",
  "cancelled_by_name",
  "cancellation_reason",
  "cancellation_details",
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
  const cancellationNotes = String(row.notes || "");
  const reasonFromNotes = cancellationNotes.match(/^Cancellation reason:\s*(.+)$/im)?.[1]?.trim() || "";
  const detailsFromNotes = cancellationNotes.match(/^Cancellation details:\s*([\s\S]+)$/im)?.[1]?.trim() || "";
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
    cancelledAt: row.cancelled_at || (row.status === "Cancelled" ? row.updated_at : ""),
    cancelledBy: row.cancelled_by_name || row.cancelled_by || "",
    cancellationReason: row.cancellation_reason || reasonFromNotes,
    cancellationDetails: row.cancellation_details || detailsFromNotes,
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
  return secureOsMutation<SupabaseVisitRow>("visit.create", {
    leadId: visit.leadId,
    visitor: visit.visitor,
    company: visit.company?.trim() || "",
    date: visit.date,
    time: normalizeTime(visit.time),
    host: visit.host,
    purpose: visit.purpose.trim(),
    notes: visit.notes?.trim() || "",
  });
}

export async function updateSupabaseVisitStatus(id: string, status: SupabaseVisitStatus, cancellation?: { reason: string; details: string } | null) {
  return secureOsMutation<SupabaseVisitRow>("visit.status", { id, status, cancellationReason: cancellation?.reason || "", cancellationDetails: cancellation?.details || "" });
}
