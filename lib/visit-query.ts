import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseVisits, mapSupabaseVisitToOsVisit } from "@/lib/supabase/visits";

export type VisitsQuerySnapshot = {
  visits: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedVisits() {
  const cached = getDemoValue("visits");
  return Array.isArray(cached) ? cached : [];
}

export async function fetchVisitsSnapshot(): Promise<VisitsQuerySnapshot> {
  const cachedVisits = readCachedVisits();

  if (!isSupabaseLeadsEnabled()) {
    return { visits: cachedVisits, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseVisits();
    const visits = rows.map(mapSupabaseVisitToOsVisit);
    saveDemoValue("visits", visits, { notify: false });
    return { visits, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load visits from Supabase.";
    return {
      visits: cachedVisits,
      dataSource: "demo",
      errorMessage: `Supabase could not load visits: ${message}`,
    };
  }
}
