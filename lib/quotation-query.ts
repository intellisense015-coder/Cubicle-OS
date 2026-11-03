import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseQuotations } from "@/lib/supabase/quotations";

export type QuotationsQuerySnapshot = {
  quotations: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedQuotations() {
  const cached = getDemoValue("quotations");
  return Array.isArray(cached) ? cached : [];
}

export async function fetchQuotationsSnapshot(): Promise<QuotationsQuerySnapshot> {
  const cachedQuotations = readCachedQuotations();
  if (!isSupabaseLeadsEnabled()) {
    return { quotations: cachedQuotations, dataSource: "demo", errorMessage: "" };
  }

  try {
    const quotations = await fetchSupabaseQuotations();
    saveDemoValue("quotations", quotations, { notify: false });
    return { quotations, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    return {
      quotations: cachedQuotations,
      dataSource: "demo",
      errorMessage: `Supabase could not load quotations: ${error?.message || "Unable to load quotations."}`,
    };
  }
}
