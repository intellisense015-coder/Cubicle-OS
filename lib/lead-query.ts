import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { mergeLeadJourneyEntries, normalizeLeadJourney } from "@/lib/lead-journey";
import { normalizeLeadStage } from "@/lib/lead-stages";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseLeadAssignments, fetchSupabaseLeadJourneys, fetchSupabaseLeadOpportunityLosses, fetchSupabaseLeads, mapSupabaseLeadToOsLead } from "@/lib/supabase/leads";

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
  "lostMonthlyValue",
  "lostAt",
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
    // The OS stage is now persisted on the Supabase lead row. Do not let an
    // older browser cache overwrite a newer server-side workflow stage.
    if (key === "stage" && remoteLead.backend === "supabase" && remoteLead.osStage) return lead;
    if (key === "assignedTo" && remoteLead.backend === "supabase" && remoteLead.assignmentLoaded) return lead;
    if (key === "journey" && remoteLead.backend === "supabase" && remoteLead.journeyLoaded) {
      const remoteJourney = Array.isArray(lead[key]) ? lead[key] : [];
      const cachedJourney = Array.isArray(cached[key]) ? cached[key] : [];
      lead[key] = mergeLeadJourneyEntries(remoteJourney, cachedJourney);
      return lead;
    }
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
    const [rows, lossRows, assignmentResult, journeyResult] = await Promise.all([
      fetchSupabaseLeads(),
      fetchSupabaseLeadOpportunityLosses(),
      fetchSupabaseLeadAssignments(),
      fetchSupabaseLeadJourneys(),
    ]);
    const losses = new Map(lossRows.map((loss) => [loss.lead_id, loss]));
    const assignments = new Map(assignmentResult.rows.map((assignment) => [assignment.lead_id, assignment.assigned_to]));
    const journeys = new Map<string, typeof journeyResult.rows>();
    journeyResult.rows.forEach((journey) => {
      const current = journeys.get(journey.lead_id) || [];
      current.push(journey);
      journeys.set(journey.lead_id, current);
    });
    const leads = normalizeLeads(rows.map((row) => {
      const merged = mergeLeadWorkflowMetadata(
        mapSupabaseLeadToOsLead(
          row,
          assignments.get(row.id) || null,
          assignmentResult.available,
          journeyResult.available ? journeys.get(row.id) || [] : null,
        ),
        cachedLeads,
      );
      const loss = losses.get(row.id);
      if (!loss) return merged;
      return {
        ...merged,
        stage: "Not interested",
        lostReason: loss.lost_reason,
        lostMonthlyValue: Number(loss.monthly_loss) || 0,
        lostAt: loss.lost_at || "",
      };
    }));
    saveDemoValue("leads", leads);
    return { leads, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load leads.";
    return {
      leads: cachedLeads,
      dataSource: "demo",
      errorMessage: `Could not load leads: ${message}`,
    };
  }
}
