import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { normalizeLeadJourney } from "@/lib/lead-journey";
import { normalizeLeadStage } from "@/lib/lead-stages";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseLeads, mapSupabaseLeadToOsLead } from "@/lib/supabase/leads";

const workflowMetadataKeys = [
  "company",
  "source",
  "stage",
  "nextFollowUp",
  "assignedTo",
  "lostReason",
  "journey",
  "pendingVisit",
  "stageBeforeVisit",
  "workspace",
];

export type LeadsQuerySnapshot = {
  leads: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function normalizeLeads(leads: any[]) {
  return leads.map((lead, index) => ({
    ...lead,
    stage: normalizeLeadStage(lead.stage, lead),
    journey: normalizeLeadJourney(lead, index),
  }));
}

function mergeLeadWorkflowMetadata(remoteLead: any, cachedLeads: any[]) {
  const cached = cachedLeads.find((item) => item.id === remoteLead.id);
  if (!cached) return remoteLead;

  return workflowMetadataKeys.reduce((lead, key) => {
    if (cached[key] !== undefined) lead[key] = cached[key];
    return lead;
  }, { ...remoteLead });
}

function readCachedLeads() {
  const cached = getDemoValue("leads");
  return Array.isArray(cached) ? normalizeLeads(cached) : [];
}

export async function fetchLeadsSnapshot(): Promise<LeadsQuerySnapshot> {
  const cachedLeads = readCachedLeads();

  if (!isSupabaseLeadsEnabled()) {
    return { leads: cachedLeads, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseLeads();
    const leads = normalizeLeads(rows.map((row) => mergeLeadWorkflowMetadata(mapSupabaseLeadToOsLead(row), cachedLeads)));
    saveDemoValue("leads", leads, { notify: false });
    return { leads, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load leads from Supabase.";
    return {
      leads: cachedLeads,
      dataSource: "demo",
      errorMessage: `Supabase could not load leads: ${message}`,
    };
  }
}
