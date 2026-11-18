import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseVisits, mapSupabaseVisitToOsVisit } from "@/lib/supabase/visits";

export type VisitsQuerySnapshot = {
  visits: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchVisitsSnapshot(): Promise<VisitsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { visits: [], dataSource: "error", errorMessage: "Supabase is required for visit records." };
  }

  try {
    const rows = await fetchSupabaseVisits();
    const visits = rows.map(mapSupabaseVisitToOsVisit);
    return { visits, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load visits.";
    return {
      visits: [],
      dataSource: "error",
      errorMessage: `Could not load visits: ${message}`,
    };
  }
}
