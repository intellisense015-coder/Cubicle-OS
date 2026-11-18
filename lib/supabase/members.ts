import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

export type SupabaseMemberRow = {
  id: string;
  lead_id: string | null;
  member_name: string;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  gender: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_variant: string | null;
  vehicle_color: string | null;
  vehicle_license_plate: string | null;
  company_name: string | null;
  team: string | null;
  assigned_space: string | null;
  monthly_rent: number | string;
  security_deposit: number | string;
  wht_enabled: boolean;
  wht_rate: number | string;
  sales_tax_enabled: boolean;
  sales_tax_rate: number | string;
  billing_start_date: string;
  due_day: number;
  joined_date: string;
  status: "active" | "inactive";
  membership_status: "active" | "notice_period";
  notice_start_date: string | null;
  expected_leaving_date: string | null;
  notice_reason: string | null;
  notice_notes: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  deactivation_description: string | null;
  membership_periods: unknown;
  contact_history: unknown;
  created_at: string;
  updated_at: string;
};

const memberColumns = [
  "id",
  "lead_id",
  "member_name",
  "phone",
  "email",
  "cnic",
  "gender",
  "vehicle_make",
  "vehicle_model",
  "vehicle_variant",
  "vehicle_color",
  "vehicle_license_plate",
  "company_name",
  "team",
  "assigned_space",
  "monthly_rent",
  "security_deposit",
  "wht_enabled",
  "wht_rate",
  "sales_tax_enabled",
  "sales_tax_rate",
  "billing_start_date",
  "due_day",
  "joined_date",
  "status",
  "membership_status",
  "notice_start_date",
  "expected_leaving_date",
  "notice_reason",
  "notice_notes",
  "deactivated_at",
  "deactivation_reason",
  "deactivation_description",
  "membership_periods",
  "contact_history",
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

function asJsonObject(value: unknown, fallback: Record<string, unknown>) {
  return value && typeof value === "object" ? value : fallback;
}

function asJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function formatMoney(value: unknown) {
  return `PKR ${asMoney(value).toLocaleString("en-PK")}`;
}

export function mapSupabaseMemberToOsMember(row: SupabaseMemberRow) {
  const membershipPeriods = asJsonArray(row.membership_periods);
  const currentPeriod = [...membershipPeriods].reverse().find((period: any) => period?.status === "Active");
  const assignedSpace = row.assigned_space && row.assigned_space !== "Unassigned" ? row.assigned_space : "";

  return {
    id: row.id,
    backend: "supabase",
    leadId: row.lead_id || "",
    member: row.member_name,
    phone: row.phone || "",
    email: row.email || "",
    cnic: row.cnic || "",
    gender: row.gender || "",
    vehicleMake: row.vehicle_make || "",
    vehicleModel: row.vehicle_model || "",
    vehicleVariant: row.vehicle_variant || "",
    vehicleColor: row.vehicle_color || "",
    vehicleLicensePlate: row.vehicle_license_plate || "",
    company: row.company_name || "",
    team: row.team || "",
    spaceId: assignedSpace,
    space: assignedSpace || "Unassigned",
    rent: formatMoney(row.monthly_rent),
    deposit: formatMoney(row.security_deposit),
    whtEnabled: row.wht_enabled === true,
    whtRate: String(asMoney(row.wht_rate)),
    salesTaxEnabled: row.sales_tax_enabled === true,
    salesTaxRate: String(asMoney(row.sales_tax_rate)),
    billingStartDate: row.billing_start_date,
    dueDay: Number(row.due_day) || 5,
    joined: row.joined_date,
    firstJoined: row.joined_date,
    status: row.status === "inactive" ? "Inactive" : "Active",
    membershipStatus: row.membership_status === "notice_period" ? "Notice period" : "Active",
    noticeStartDate: row.notice_start_date || "",
    expectedLeavingDate: row.expected_leaving_date || "",
    noticeReason: row.notice_reason || "",
    noticeNotes: row.notice_notes || "",
    deactivatedAt: row.deactivated_at || "",
    deactivationReason: row.deactivation_reason || "",
    deactivationDescription: row.deactivation_description || "",
    membershipPeriods,
    currentMembershipId: currentPeriod?.id || null,
    contactHistory: asJsonObject(row.contact_history, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSupabaseMemberInput(member: any) {
  return {
    lead_id: asString(member?.leadId) || null,
    member_name: asString(member?.member),
    phone: asString(member?.phone) || null,
    email: asString(member?.email).toLowerCase() || null,
    cnic: asString(member?.cnic) || null,
    gender: asString(member?.gender) || null,
    vehicle_make: asString(member?.vehicleMake) || null,
    vehicle_model: asString(member?.vehicleModel) || null,
    vehicle_variant: asString(member?.vehicleVariant) || null,
    vehicle_color: asString(member?.vehicleColor) || null,
    vehicle_license_plate: asString(member?.vehicleLicensePlate) || null,
    company_name: asString(member?.company) || null,
    team: asString(member?.team) || null,
    assigned_space: asString(member?.spaceId || member?.space) || null,
    monthly_rent: asMoney(member?.rent),
    security_deposit: asMoney(member?.deposit),
    wht_enabled: member?.whtEnabled === true,
    wht_rate: asMoney(member?.whtRate),
    sales_tax_enabled: member?.salesTaxEnabled === true,
    sales_tax_rate: asMoney(member?.salesTaxRate),
    billing_start_date: asString(member?.billingStartDate || member?.joined),
    due_day: Number(member?.dueDay) || 5,
    joined_date: asString(member?.joined),
    status: String(member?.status || "Active").toLowerCase() === "inactive" ? "inactive" : "active",
    membership_status: String(member?.membershipStatus || "Active").toLowerCase().replace(/\s+/g, "_") === "notice_period" ? "notice_period" : "active",
    notice_start_date: asDate(member?.noticeStartDate),
    expected_leaving_date: asDate(member?.expectedLeavingDate),
    notice_reason: asString(member?.noticeReason) || null,
    notice_notes: asString(member?.noticeNotes) || null,
    deactivated_at: asString(member?.deactivatedAt) || null,
    deactivation_reason: asString(member?.deactivationReason) || null,
    deactivation_description: asString(member?.deactivationDescription) || null,
    membership_periods: asJsonArray(member?.membershipPeriods),
    contact_history: asJsonObject(member?.contactHistory, {}),
  };
}

export async function fetchSupabaseMembers() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("members")
    .select(memberColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as SupabaseMemberRow[];
}

export async function createSupabaseMember(member: any) {
  return secureOsMutation<SupabaseMemberRow>("member.create", { input: toSupabaseMemberInput(member) });
}

export async function updateSupabaseMember(id: string, member: any) {
  return secureOsMutation<SupabaseMemberRow>("member.update", { id, input: toSupabaseMemberInput(member) });
}

export type MemberLifecycleAction = "start_notice" | "cancel_notice" | "deactivate" | "reactivate";

export async function transitionSupabaseMemberLifecycle(id: string, action: MemberLifecycleAction, payload: Record<string, unknown> = {}) {
  return secureOsMutation<SupabaseMemberRow>("member.lifecycle", {
    memberId: id,
    action,
    ...payload,
  });
}
