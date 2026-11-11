import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { createSupabaseVisit, mapSupabaseVisitToOsVisit } from "@/lib/supabase/visits";

function getVisitTimeMinutes(value: unknown) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "am" && hours === 12) hours = 0;
  if (meridiem === "pm" && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function visitSortValue(visit: { date: string; time: string }) {
  const dateValue = new Date(`${visit.date}T00:00:00`).getTime();
  return (Number.isNaN(dateValue) ? Number.MAX_SAFE_INTEGER : dateValue) + getVisitTimeMinutes(visit.time) * 60 * 1000;
}

function isPastVisitTime(visit: { date: string; time: string }) {
  const now = new Date();
  now.setSeconds(0, 0);
  return visitSortValue(visit) < now.getTime();
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function sameScheduledSlot(first: any, second: any) {
  return first.status === "Scheduled"
    && second.status === "Scheduled"
    && first.date === second.date
    && first.host === second.host
    && getVisitTimeMinutes(first.time) === getVisitTimeMinutes(second.time);
}

export async function scheduleLeadVisit({ lead, date, time, host }: { lead: any; date: string; time: string; host: string }) {
  const visit = {
    id: `visit-${Date.now()}`,
    leadId: String(lead?.id || ""),
    visitor: `${String(lead?.name || "").trim()} - ${String(lead?.company || "No company").trim() || "No company"}`,
    company: String(lead?.company || "").trim(),
    date: String(date || ""),
    time: String(time || ""),
    host: String(host || "").trim(),
    purpose: "Workspace tour",
    status: "Scheduled" as const,
  };

  if (!visit.leadId || !visit.date || !visit.time || !visit.host) throw new Error("Visit details are incomplete.");
  if (isPastVisitTime(visit)) throw new Error("Choose a current or future time.");

  const cachedVisits = getDemoValue("visits");
  const visits = Array.isArray(cachedVisits) ? cachedVisits : [];
  if (visits.some((existingVisit) => sameScheduledSlot(existingVisit, visit))) {
    throw new Error(`${visit.host} is already booked at that time.`);
  }

  let savedVisit: any = visit;
  if (isSupabaseLeadsEnabled()) {
    if (!isUuid(visit.leadId)) throw new Error("The selected lead is not ready for visit scheduling.");
    try {
      const row = await createSupabaseVisit(visit);
      savedVisit = mapSupabaseVisitToOsVisit(row);
    } catch (error: any) {
      if (error?.code === "23505") throw new Error(`${visit.host} is already booked at that time.`);
      throw error;
    }
  }

  saveDemoValue("visits", [savedVisit, ...visits]);
  return savedVisit;
}
