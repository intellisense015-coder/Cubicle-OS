import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseQuotations } from "@/lib/supabase/quotations";

export type QuotationsQuerySnapshot = {
  quotations: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchQuotationsSnapshot(): Promise<QuotationsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { quotations: [], dataSource: "error", errorMessage: "Supabase is required for quotation records." };
  }

  try {
    const quotations = await fetchSupabaseQuotations();
    return { quotations, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    return {
      quotations: [],
      dataSource: "error",
      errorMessage: `Could not load quotations: ${error?.message || "Unable to load quotations."}`,
    };
  }
}
