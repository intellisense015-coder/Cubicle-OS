import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

export type SupabaseWorkspaceRow = {
  id: string;
  floor_id: string;
  label: string;
  workspace_type: string;
  kind: string;
  zone: string;
  capacity: number | null;
  occupant: string;
  company_name: string;
  member_id: string | null;
  monthly_rent: number | string;
  billing_start_date: string | null;
  due_day: number;
  grace_period_days: number;
  status: "available" | "occupied" | "reserved" | "maintenance";
  membership_status: "active" | "notice_period";
  notice_start_date: string | null;
  expected_leaving_date: string | null;
  notice_notes: string | null;
  maintenance_category_id: string | null;
  maintenance_status: "active" | "locked" | "blocked" | "deactivated";
  maintenance_reason: string | null;
  operational_status: "ACTIVE" | "UNDER_MAINTENANCE" | "OUT_OF_SERVICE";
  active_maintenance_id: string | null;
  created_at: string;
  updated_at: string;
};

const workspaceColumns = [
  "id",
  "floor_id",
  "label",
  "workspace_type",
  "kind",
  "zone",
  "capacity",
  "occupant",
  "company_name",
  "member_id",
  "monthly_rent",
  "billing_start_date",
  "due_day",
  "grace_period_days",
  "status",
  "membership_status",
  "notice_start_date",
  "expected_leaving_date",
  "notice_notes",
  "maintenance_category_id",
  "maintenance_status",
  "maintenance_reason",
  "operational_status",
  "active_maintenance_id",
  "created_at",
  "updated_at",
].join(",");

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asMoney(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function asDate(value: unknown) {
  return asString(value) || null;
}

function asUuid(value: unknown) {
  const normalized = asString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function formatMoney(value: unknown) {
  return `PKR ${asMoney(value).toLocaleString("en-PK")}`;
}

export function mapSupabaseWorkspaceToOsWorkspace(row: SupabaseWorkspaceRow) {
  return {
    id: row.id,
    areaId: row.id,
    backend: "supabase",
    floor: row.floor_id,
    label: row.label,
    type: row.workspace_type,
    kind: row.kind,
    zone: row.zone,
    capacity: row.capacity,
    occupant: row.occupant,
    company: row.company_name,
    memberId: row.member_id || "",
    monthlyRent: formatMoney(row.monthly_rent),
    billingStartDate: row.billing_start_date || "",
    dueDay: Number(row.due_day) || 5,
    gracePeriodDays: Number(row.grace_period_days) || 3,
    membershipStatus: row.membership_status === "notice_period" ? "Notice period" : "Active",
    noticeStartDate: row.notice_start_date || "",
    expectedLeavingDate: row.expected_leaving_date || "",
    noticeNotes: row.notice_notes || "",
    maintenanceCategoryId: row.maintenance_category_id || "",
    maintenanceStatus: row.maintenance_status,
    maintenanceReason: row.maintenance_reason || "",
    operationalStatus: row.operational_status,
    activeMaintenanceId: row.active_maintenance_id || "",
    status: row.status,
  };
}

export function toSupabaseWorkspaceInput(workspace: any) {
  return {
    id: asString(workspace?.areaId || workspace?.id),
    floor_id: asString(workspace?.floor || "floor-4"),
    label: asString(workspace?.label),
    workspace_type: asString(workspace?.type),
    kind: asString(workspace?.kind),
    zone: asString(workspace?.zone),
    capacity: workspace?.capacity === "" || workspace?.capacity == null ? null : Number(workspace.capacity),
    occupant: asString(workspace?.occupant || "Available"),
    company_name: asString(workspace?.company || "Unassigned"),
    member_id: asUuid(workspace?.memberId),
    monthly_rent: asMoney(workspace?.monthlyRent),
    billing_start_date: asDate(workspace?.billingStartDate),
    due_day: Number(workspace?.dueDay) || 5,
    grace_period_days: Number(workspace?.gracePeriodDays) || 3,
    status: ["available", "occupied", "reserved", "maintenance"].includes(workspace?.status) ? workspace.status : "available",
    membership_status: String(workspace?.membershipStatus || "Active").toLowerCase().replace(/\s+/g, "_") === "notice_period" ? "notice_period" : "active",
    notice_start_date: asDate(workspace?.noticeStartDate),
    expected_leaving_date: asDate(workspace?.expectedLeavingDate),
    notice_notes: asString(workspace?.noticeNotes) || null,
    maintenance_category_id: asString(workspace?.maintenanceCategoryId) || null,
    maintenance_status: ["active", "locked", "blocked", "deactivated"].includes(workspace?.maintenanceStatus) ? workspace.maintenanceStatus : "deactivated",
    maintenance_reason: asString(workspace?.maintenanceReason) || null,
    operational_status: ["ACTIVE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(workspace?.operationalStatus) ? workspace.operationalStatus : "ACTIVE",
    active_maintenance_id: asString(workspace?.activeMaintenanceId) || null,
  };
}

export async function fetchSupabaseWorkspaces() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("workspaces")
    .select(workspaceColumns)
    .order("floor_id", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as SupabaseWorkspaceRow[];
}

export async function createSupabaseWorkspaces(workspaces: any[]) {
  if (!workspaces.length) return [] as SupabaseWorkspaceRow[];
  return secureOsMutation<SupabaseWorkspaceRow[]>("workspace.create", {
    workspaces: workspaces.map(toSupabaseWorkspaceInput),
  });
}

export async function updateSupabaseWorkspace(id: string, workspace: any) {
  return secureOsMutation<SupabaseWorkspaceRow>("workspace.update", {
    id,
    input: toSupabaseWorkspaceInput({ ...workspace, id, areaId: id }),
  });
}

export async function assignSupabaseMemberToWorkspace(memberId: string, workspaceId: string | null) {
  await secureOsMutation<{ assigned: boolean }>("workspace.assign", { memberId, workspaceId });
}
