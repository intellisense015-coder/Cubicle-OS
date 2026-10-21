export const leadStages = [
  "New lead",
  "Follow-up due",
  "Visit scheduled",
  "Visited",
  "Quotation requested",
  "Quote Sent",
  "Proposal Sent",
  "Proposal Approved",
  "Quotation Approved",
  "Agreement shared",
  "Converted",
  "Not interested"
] as const;

export type LeadStage = (typeof leadStages)[number];

const terminalStages = new Set<LeadStage>(["Converted", "Not interested"]);

export function normalizeLeadStage(stage: unknown, lead: any = {}): LeadStage {
  const value = String(stage || "").trim();
  if (leadStages.includes(value as LeadStage)) return value as LeadStage;

  const legacyStageMap: Record<string, LeadStage> = {
    "Visit booked": "Visit scheduled",
    "Quotation sent": "Quote Sent",
    "Quote sent": "Quote Sent",
    "Quotation approved": "Quotation Approved",
    "Quote approved": "Quotation Approved",
    "Proposal sent": "Proposal Sent",
    "Proposal approved": "Proposal Approved",
    "Agreement sent": "Agreement shared",
    "Agreement signed": "Agreement shared",
    "Closed lost": "Not interested"
  };
  if (legacyStageMap[value]) return legacyStageMap[value];

  if (value === "Awaiting response" && lead.nextFollowUp && lead.nextFollowUp !== "Not scheduled") {
    return "Follow-up due";
  }

  // Older demo records used "Followed up" for a completed interaction. Keep
  // them in the supported workflow without exposing the legacy stage.
  if (value === "Followed up" || value === "Awaiting response") return "Visited";
  return "New lead";
}

export type LeadStageEvent =
  | { type: "follow-up-scheduled"; nextFollowUp: string }
  | { type: "follow-up-logged"; outcome: string; lostReason?: string; nextFollowUp?: string; nextFollowUpDate?: string; nextFollowUpTime?: string }
  | { type: "visit-scheduled"; nextFollowUp: string }
  | { type: "visit-cancelled" }
  | { type: "visit-completed"; nextFollowUp?: string; nextFollowUpDate?: string; nextFollowUpTime?: string }
  | { type: "quotation-requested" }
  | { type: "quotation-created" }
  | { type: "quotation-sent" }
  | { type: "quotation-approved" }
  | { type: "agreement-shared" }
  | { type: "converted" }
  | { type: "not-interested"; lostReason?: string };

function nextFollowUpValue(date?: string, time?: string) {
  return date ? `${date}${time ? ` · ${time}` : ""}` : "Not scheduled";
}

function stableStage(lead: any): LeadStage {
  const stage = normalizeLeadStage(lead.stage, lead);
  return stage === "Follow-up due" || stage === "Visit scheduled" ? "Visited" : stage;
}

export function transitionLead(lead: any, event: LeadStageEvent) {
  const currentStage = normalizeLeadStage(lead.stage, lead);
  const base = { ...lead, stage: currentStage };

  if (terminalStages.has(currentStage) && !["converted", "not-interested"].includes(event.type)) {
    return { ...base, nextFollowUp: "Not scheduled" };
  }

  switch (event.type) {
    case "follow-up-scheduled":
      return { ...base, stage: "Follow-up due", nextFollowUp: event.nextFollowUp };
    case "follow-up-logged": {
      if (event.nextFollowUpDate) {
        return {
          ...base,
          stage: "Follow-up due",
          nextFollowUp: event.nextFollowUp || nextFollowUpValue(event.nextFollowUpDate, event.nextFollowUpTime)
        };
      }
      if (event.outcome === "Schedule a visit") return { ...base, stage: "Follow-up due", nextFollowUp: "Not scheduled", pendingVisit: true };
      if (event.outcome === "Requested quotation") return { ...base, stage: "Quotation requested", nextFollowUp: "Not scheduled", pendingVisit: false };
      if (event.outcome === "Proposal Sent") return { ...base, stage: "Proposal Sent", nextFollowUp: "Not scheduled", pendingVisit: false };
      if (event.outcome === "Proposal Approved") return { ...base, stage: "Proposal Approved", nextFollowUp: "Not scheduled", pendingVisit: false };
      if (event.outcome === "Quotation Approved") return { ...base, stage: "Quotation Approved", nextFollowUp: "Not scheduled", pendingVisit: false };
      if (event.outcome === "Agreement shared") return { ...base, stage: "Agreement shared", nextFollowUp: "Not scheduled", pendingVisit: false };
      if (event.outcome === "Not interested") return { ...base, stage: "Not interested", lostReason: event.lostReason || base.lostReason || "", nextFollowUp: "Not scheduled", pendingVisit: false };
      return { ...base, stage: stableStage(base), nextFollowUp: "Not scheduled", pendingVisit: false };
    }
    case "visit-scheduled":
      return { ...base, stage: "Visit scheduled", stageBeforeVisit: currentStage, nextFollowUp: event.nextFollowUp, pendingVisit: false };
    case "visit-cancelled":
      return { ...base, stage: base.stageBeforeVisit && leadStages.includes(base.stageBeforeVisit) ? base.stageBeforeVisit : "Visited", nextFollowUp: "Not scheduled", pendingVisit: false };
    case "visit-completed":
      return event.nextFollowUpDate
        ? { ...base, stage: "Follow-up due", nextFollowUp: event.nextFollowUp || nextFollowUpValue(event.nextFollowUpDate, event.nextFollowUpTime) }
        : { ...base, stage: "Visited", nextFollowUp: "Not scheduled" };
    case "quotation-requested":
      return { ...base, stage: "Quotation requested" };
    case "quotation-created":
      return base;
    case "quotation-sent":
      return { ...base, stage: "Quote Sent" };
    case "quotation-approved":
      return { ...base, stage: "Quotation Approved" };
    case "agreement-shared":
      return { ...base, stage: "Agreement shared" };
    case "converted":
      return { ...base, stage: "Converted", nextFollowUp: "Not scheduled" };
    case "not-interested":
      return { ...base, stage: "Not interested", lostReason: event.lostReason || base.lostReason || "", nextFollowUp: "Not scheduled" };
    default:
      return base;
  }
}

export function isTerminalLeadStage(stage: unknown) {
  return terminalStages.has(normalizeLeadStage(stage));
}
