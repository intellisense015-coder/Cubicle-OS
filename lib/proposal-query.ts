import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseProposals } from "@/lib/supabase/proposals";

export type ProposalsQuerySnapshot = {
  proposals: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchProposalsSnapshot(): Promise<ProposalsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { proposals: [], dataSource: "error", errorMessage: "Supabase is required for proposal records." };
  }

  try {
    const proposals = await fetchSupabaseProposals();
    return { proposals, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    return {
      proposals: [],
      dataSource: "error",
      errorMessage: `Could not load proposals: ${error?.message || "Unable to load proposals."}`,
    };
  }
}
