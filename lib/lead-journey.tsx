// TITLE: LEAD JOURNEY OPTIONS
export const leadSources = ["Google Ads", "Referral", "Walk-in", "Website", "Instagram", "Facebook", "WhatsApp", "Other"];
export const communicationModes = ["WhatsApp", "Phone call", "Email", "SMS", "In-person", "Video call", "Other"];
export const followUpOutcomes = ["Interested", "Needs more information", "Awaiting response", "Schedule a visit", "Requested quotation", "Proposal Sent", "Proposal Approved", "Quotation Approved", "Agreement shared", "Not interested"];
export const moodOptions = ["Enthusiastic", "Interested", "Neutral", "Skeptical", "Hurried", "Frustrated"];
export const certaintyOptions = ["Sure", "Unsure", "Hesitant"];
export const probabilityOptions = ["High", "Medium", "Low"];

// TITLE: DEFAULT JOURNEY ENTRY
export function getInitialLeadJourney(lead, index = 0) {
  const dates = ["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-03"];
  return {
    id: `journey-${lead.id || lead.name}-${index + 1}`,
    visitorIdentity: lead.name,
    occurredDate: dates[index % dates.length],
    occurredTime: index % 2 === 0 ? "10:00" : "14:30",
    purpose: "Workspace enquiry and space requirements",
    companions: index % 2 === 0 ? "None reported" : "Business partner",
    source: lead.source || "Website",
    mood: index % 3 === 0 ? "Interested" : "Enthusiastic",
    certainty: "Unsure",
    objections: "Comparing available spaces and move-in timing",
    nextFollowUpDate: "2026-10-04",
    nextFollowUpTime: "15:00",
    communicationMode: "WhatsApp",
    conversionProbability: index % 3 === 0 ? "Medium" : "High",
    conversionReason: "Good fit, but the lead is still comparing options.",
    notes: "Initial demo journey entry. Add the next interaction after every contact or visit."
  };
}

// TITLE: LEAD JOURNEY NORMALIZER
export function normalizeLeadJourney(lead, index = 0) {
  const journey = Array.isArray(lead.journey) ? lead.journey : [];
  return journey;
}
