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
  dataSource: "supabase" | "error";
  errorMessage: string;
};

function normalizeLeads(leads: any[]) {
  return leads.map((lead, index) => ({
    ...lead,
    stage: normalizeLeadStage(lead.stage, lead),
    journey: normalizeLeadJourney(lead, index),
  }));
}

async function fetchLeadsSnapshotInternal(): Promise<LeadsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { leads: [], dataSource: "error", errorMessage: "Supabase is required for lead records." };
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
      const merged = mapSupabaseLeadToOsLead(
        row,
        assignments.get(row.id) || null,
        assignmentResult.available,
        journeyResult.available ? journeys.get(row.id) || [] : null,
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
    return { leads, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load leads.";
    return {
      leads: [],
      dataSource: "error",
      errorMessage: `Could not load leads: ${message}`,
    };
  }
}

export async function fetchLeadsSnapshot(): Promise<LeadsQuerySnapshot> {
  return fetchLeadsSnapshotInternal();
}

export async function fetchBackendLeadsSnapshot(): Promise<LeadsQuerySnapshot> {
  return fetchLeadsSnapshotInternal();
}
