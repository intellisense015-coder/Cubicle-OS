import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseMembers, mapSupabaseMemberToOsMember } from "@/lib/supabase/members";

export type MembersQuerySnapshot = {
  members: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchMembersSnapshot(): Promise<MembersQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { members: [], dataSource: "error", errorMessage: "Supabase is required for member records." };
  }

  try {
    const rows = await fetchSupabaseMembers();
    const members = rows.map(mapSupabaseMemberToOsMember);
    return { members, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load members.";
    return {
      members: [],
      dataSource: "error",
      errorMessage: `Could not load members: ${message}`,
    };
  }
}
