import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseProposals } from "@/lib/supabase/proposals";

export type ProposalsQuerySnapshot = {
  proposals: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedProposals() {
  const cached = getDemoValue("proposals");
  return Array.isArray(cached) ? cached : [];
}

export async function fetchProposalsSnapshot(): Promise<ProposalsQuerySnapshot> {
  const cachedProposals = readCachedProposals();
  if (!isSupabaseLeadsEnabled()) {
    return { proposals: cachedProposals, dataSource: "demo", errorMessage: "" };
  }

  try {
    const proposals = await fetchSupabaseProposals();
    saveDemoValue("proposals", proposals, { notify: false });
    return { proposals, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    return {
      proposals: cachedProposals,
      dataSource: "demo",
      errorMessage: `Supabase could not load proposals: ${error?.message || "Unable to load proposals."}`,
    };
  }
}
