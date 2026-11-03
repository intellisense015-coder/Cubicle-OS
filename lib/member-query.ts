import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseMembers, mapSupabaseMemberToOsMember } from "@/lib/supabase/members";

export type MembersQuerySnapshot = {
  members: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedMembers() {
  const cached = getDemoValue("members");
  return Array.isArray(cached) ? cached : [];
}

export async function fetchMembersSnapshot(): Promise<MembersQuerySnapshot> {
  const cachedMembers = readCachedMembers();

  if (!isSupabaseLeadsEnabled()) {
    return { members: cachedMembers, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseMembers();
    const members = rows.map(mapSupabaseMemberToOsMember);
    saveDemoValue("members", members, { notify: false });
    return { members, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load members.";
    return {
      members: cachedMembers,
      dataSource: "demo",
      errorMessage: `Could not load members: ${message}`,
    };
  }
}
