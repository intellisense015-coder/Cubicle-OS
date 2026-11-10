import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";
import { normalizeLeadStage } from "@/lib/lead-stages";

export type SupabaseLeadRow = {
  id: string;
  person_name: string;
  contact_number: string;
  email: string;
  team_size: number;
  shift: string;
  visit_date: string | null;
  visit_time: string | null;
  message: string | null;
  created_at: string;
  visited: boolean;
  workspace_option: string | null;
  os_stage: string | null;
};

export type SupabaseLeadOpportunityLossRow = {
  lead_id: string;
  monthly_loss: number | string;
  lost_reason: string;
  lost_at: string;
};

export type SupabaseLeadAssignmentRow = {
  lead_id: string;
  assigned_to: string | null;
};

export type SupabaseLeadJourneyRow = {
  id: string;
  lead_id: string;
  client_entry_id: string | null;
  entry_type: string;
  occurred_date: string;
  occurred_time: string | null;
  entry_data: Record<string, unknown>;
};

const leadColumns = "id,person_name,contact_number,email,team_size,shift,visit_date,visit_time,message,created_at,visited,workspace_option,os_stage";

const workspaceOptionByLabel: Record<string, string> = {
  "private office": "private-office",
  "dedicated desk": "dedicated-desk",
  "enterprise solutions": "enterprise-solutions",
  "meeting room": "meeting-room",
  "event space": "event-space",
};

const workspaceLabelByOption: Record<string, string> = {
  "private-office": "Private office",
  "dedicated-desk": "Dedicated desk",
  "enterprise-solutions": "Enterprise solutions",
  "meeting-room": "Meeting room",
  "event-space": "Event space",
};

function normalizeWorkspaceOption(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return workspaceOptionByLabel[normalized.toLowerCase()] || (Object.values(workspaceOptionByLabel).includes(normalized) ? normalized : null);
}

function timeValue(value: string | null) {
  return value ? String(value).slice(0, 5) : "";
}

function mapSupabaseLeadJourneyRow(row: SupabaseLeadJourneyRow) {
  return {
    ...(row.entry_data || {}),
    id: row.client_entry_id || row.id,
    entryType: row.entry_type,
    occurredDate: row.occurred_date,
    occurredTime: timeValue(row.occurred_time),
  };
}

export function mapSupabaseLeadToOsLead(
  row: SupabaseLeadRow,
  assignedTo: string | null = null,
  assignmentLoaded = false,
  journeyRows: SupabaseLeadJourneyRow[] | null = null,
) {
  const teamSize = Number(row.team_size) || 0;
  const visitDate = row.visit_date || "";
  const visitTime = timeValue(row.visit_time);
  const fallbackStage = row.visited ? "Visited" : visitDate ? "Visit scheduled" : "New lead";
  const stage = row.os_stage ? normalizeLeadStage(row.os_stage) : fallbackStage;

  return {
    id: row.id,
    backend: "supabase",
    name: row.person_name,
    phone: row.contact_number,
    email: row.email,
    company: "",
    team: `${teamSize} ${teamSize === 1 ? "person" : "people"}`,
    teamSize,
    shift: row.shift,
    source: "Website",
    stage,
    osStage: row.os_stage || null,
    nextFollowUp: visitDate ? `${visitDate}${visitTime ? ` · ${visitTime}` : ""}` : "Not scheduled",
    assignedTo: assignmentLoaded ? assignedTo || "Unassigned" : "Unassigned",
    assignmentLoaded,
    lostReason: "",
    workspace: workspaceLabelByOption[row.workspace_option || ""] || row.workspace_option || "",
    visitDate,
    visitTime,
    message: row.message || "",
    createdAt: row.created_at || "",
    visited: Boolean(row.visited),
    lostMonthlyValue: null,
    lostAt: "",
    journey: journeyRows === null ? [] : journeyRows.map(mapSupabaseLeadJourneyRow),
    journeyLoaded: journeyRows !== null,
  };
}

export function parseTeamSize(value: unknown) {
  const match = String(value || "").match(/\d+/);
  if (!match) return null;
  const teamSize = Number(match[0]);
  return Number.isInteger(teamSize) && teamSize > 0 ? teamSize : null;
}

export async function fetchSupabaseLeads() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .select(leadColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SupabaseLeadRow[];
}

export async function fetchSupabaseLeadOpportunityLosses() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("os_lead_opportunity_losses")
    .select("lead_id,monthly_loss,lost_reason,lost_at");

  // This keeps the existing leads view readable while the OS-only migration
  // is being applied. Writes still fail safely until the migration exists.
  if (error?.code === "PGRST205") return [] as SupabaseLeadOpportunityLossRow[];
  if (error) throw error;
  return (data || []) as SupabaseLeadOpportunityLossRow[];
}

export async function fetchSupabaseLeadAssignments() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("os_lead_assignments")
    .select("lead_id,assigned_to");

  // Keep the existing leads screen usable until the OS assignment migration
  // has been applied. Once the table exists, its value is authoritative.
  if (error?.code === "PGRST205") return { rows: [] as SupabaseLeadAssignmentRow[], available: false };
  if (error) throw error;
  return { rows: (data || []) as SupabaseLeadAssignmentRow[], available: true };
}

export async function fetchSupabaseLeadJourneys() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("os_lead_journey")
    .select("id,lead_id,client_entry_id,entry_type,occurred_date,occurred_time,entry_data")
    .order("occurred_date", { ascending: false })
    .order("occurred_time", { ascending: false });

  // Keep the leads page usable until the durable journey migration is applied.
  if (error?.code === "PGRST205") return { rows: [] as SupabaseLeadJourneyRow[], available: false };
  if (error) throw error;
  return { rows: (data || []) as SupabaseLeadJourneyRow[], available: true };
}

export async function fetchSupabaseLead(id: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .select(leadColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as SupabaseLeadRow | null;
}

export async function createSupabaseLead(input: {
  name: string;
  phone: string;
  email: string;
  team: string;
  shift: string;
  workspace?: string;
  assignedTo?: string;
}) {
  const teamSize = parseTeamSize(input.team);
  if (!teamSize) throw new Error("Team size must include a positive number, for example 6 people.");

  return secureOsMutation<SupabaseLeadRow>("lead.create", {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    team: input.team.trim(),
    shift: input.shift.trim() || "Flexible",
    workspace: input.workspace,
    assignedTo: input.assignedTo,
  });
}

export async function updateSupabaseLead(id: string, input: {
  email?: string;
  phone?: string;
  workspace?: string;
  visited?: boolean;
  visitDate?: string | null;
  visitTime?: string | null;
  stage?: string;
  assignedTo?: string | null;
  lostReason?: string;
  lostMonthlyValue?: number | string | null;
  journeyEntry?: Record<string, unknown>;
}, action: "lead.update" | "lead.followup.update" | "lead.journey.update" = "lead.update") {
  return secureOsMutation<SupabaseLeadRow | null>(action, { id, ...input });
}
