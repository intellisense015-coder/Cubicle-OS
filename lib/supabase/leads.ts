import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
};

const leadColumns = "id,person_name,contact_number,email,team_size,shift,visit_date,visit_time,message,created_at,visited,workspace_option";

function timeValue(value: string | null) {
  return value ? String(value).slice(0, 5) : "";
}

export function mapSupabaseLeadToOsLead(row: SupabaseLeadRow) {
  const teamSize = Number(row.team_size) || 0;
  const visitDate = row.visit_date || "";
  const visitTime = timeValue(row.visit_time);

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
    stage: row.visited ? "Visited" : visitDate ? "Visit scheduled" : "New lead",
    nextFollowUp: visitDate ? `${visitDate}${visitTime ? ` · ${visitTime}` : ""}` : "Not scheduled",
    assignedTo: "Unassigned",
    lostReason: "",
    workspace: row.workspace_option || "",
    visitDate,
    visitTime,
    message: row.message || "",
    createdAt: row.created_at ? row.created_at.slice(0, 10) : "",
    visited: Boolean(row.visited),
    journey: [],
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
}) {
  const teamSize = parseTeamSize(input.team);
  if (!teamSize) throw new Error("Team size must include a positive number, for example 6 people.");

  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .insert({
      person_name: input.name.trim(),
      contact_number: input.phone.trim(),
      email: input.email.trim().toLowerCase(),
      team_size: teamSize,
      shift: input.shift.trim() || "Flexible",
      workspace_option: input.workspace || null,
    })
    .select(leadColumns)
    .single();

  if (error) throw error;
  return data as SupabaseLeadRow;
}

export async function updateSupabaseLead(id: string, input: { workspace?: string; visited?: boolean }) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .update({
      workspace_option: input.workspace || null,
      visited: Boolean(input.visited),
    })
    .eq("id", id)
    .select(leadColumns)
    .single();

  if (error) throw error;
  return data as SupabaseLeadRow;
}
