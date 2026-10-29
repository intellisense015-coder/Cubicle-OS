import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseMaintenanceRecordRow = {
  id: string;
  workspace_id: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  reported_by: string | null;
  reported_at: string;
  assigned_to_id: string | null;
  started_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  cancellation_reason: string | null;
  resolution_summary: string | null;
  parts_used: string | null;
  resolution_notes: string | null;
  verified_ready_for_use: boolean;
  created_at: string;
  updated_at: string;
};

export type SupabaseMaintenanceEventRow = {
  id: string;
  maintenance_id: string;
  from_status: string | null;
  to_status: string;
  action: string;
  notes: string | null;
  actor_id: string | null;
  created_at: string;
};

const recordColumns = [
  "id",
  "workspace_id",
  "status",
  "category",
  "severity",
  "title",
  "description",
  "reported_by",
  "reported_at",
  "assigned_to_id",
  "started_at",
  "resolved_by",
  "resolved_at",
  "cancellation_reason",
  "resolution_summary",
  "parts_used",
  "resolution_notes",
  "verified_ready_for_use",
  "created_at",
  "updated_at",
].join(",");

const eventColumns = "id,maintenance_id,from_status,to_status,action,notes,actor_id,created_at";

export function mapSupabaseMaintenanceRecordToOsRecord(row: SupabaseMaintenanceRecordRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    reportedById: row.reported_by || undefined,
    reportedAt: row.reported_at,
    assignedToId: row.assigned_to_id || undefined,
    startedAt: row.started_at || undefined,
    resolvedById: row.resolved_by || undefined,
    resolvedAt: row.resolved_at || undefined,
    cancellationReason: row.cancellation_reason || undefined,
    resolutionSummary: row.resolution_summary || undefined,
    partsUsed: row.parts_used || undefined,
    resolutionNotes: row.resolution_notes || undefined,
    verifiedReadyForUse: row.verified_ready_for_use,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSupabaseMaintenanceEventToOsEvent(row: SupabaseMaintenanceEventRow) {
  return {
    id: row.id,
    maintenanceId: row.maintenance_id,
    fromStatus: row.from_status || undefined,
    toStatus: row.to_status,
    action: row.action,
    notes: row.notes || undefined,
    actorId: row.actor_id || undefined,
    createdAt: row.created_at,
  };
}

async function currentUserId() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id || null;
}

export async function fetchSupabaseMaintenanceRecords() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_records")
    .select(recordColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as SupabaseMaintenanceRecordRow[];
}

export async function fetchSupabaseMaintenanceEvents() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_events")
    .select(eventColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as SupabaseMaintenanceEventRow[];
}

export async function createSupabaseMaintenanceRecord(record: any) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_records")
    .insert({
      workspace_id: String(record.workspaceId),
      status: record.status,
      category: String(record.category || "Uncategorized"),
      severity: record.severity,
      title: String(record.title || "Maintenance issue"),
      description: String(record.description || ""),
      reported_by: await currentUserId(),
      reported_at: record.reportedAt || new Date().toISOString(),
      assigned_to_id: record.assignedToId || null,
      started_at: record.startedAt || null,
      resolved_by: record.resolvedById || null,
      resolved_at: record.resolvedAt || null,
      cancellation_reason: record.cancellationReason || null,
      resolution_summary: record.resolutionSummary || null,
      parts_used: record.partsUsed || null,
      resolution_notes: record.resolutionNotes || null,
      verified_ready_for_use: record.verifiedReadyForUse === true,
      updated_at: record.updatedAt || new Date().toISOString(),
    })
    .select(recordColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseMaintenanceRecordRow;
}

export async function updateSupabaseMaintenanceRecord(id: string, record: any) {
  const resolvedBy = record.status === "RESOLVED" ? await currentUserId() : null;
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_records")
    .update({
      status: record.status,
      category: String(record.category || "Uncategorized"),
      severity: record.severity,
      title: String(record.title || "Maintenance issue"),
      description: String(record.description || ""),
      assigned_to_id: record.assignedToId || null,
      started_at: record.startedAt || null,
      resolved_by: resolvedBy,
      resolved_at: record.resolvedAt || null,
      cancellation_reason: record.cancellationReason || null,
      resolution_summary: record.resolutionSummary || null,
      parts_used: record.partsUsed || null,
      resolution_notes: record.resolutionNotes || null,
      verified_ready_for_use: record.verifiedReadyForUse === true,
      updated_at: record.updatedAt || new Date().toISOString(),
    })
    .eq("id", id)
    .select(recordColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseMaintenanceRecordRow;
}

export async function createSupabaseMaintenanceEvent(event: any, maintenanceId: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_events")
    .insert({
      maintenance_id: maintenanceId,
      from_status: event.fromStatus || null,
      to_status: event.toStatus,
      action: event.action,
      notes: event.notes || null,
      actor_id: await currentUserId(),
    })
    .select(eventColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseMaintenanceEventRow;
}
