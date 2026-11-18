import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import {
  fetchSupabaseWorkspaces,
  mapSupabaseWorkspaceToOsWorkspace,
} from "@/lib/supabase/workspaces";
import { mergeWorkspaceRecords } from "@/lib/workspace-records";

export type WorkspacesQuerySnapshot = {
  workspaces: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchWorkspacesSnapshot(): Promise<WorkspacesQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { workspaces: [], dataSource: "error", errorMessage: "Supabase is required for workspace records." };
  }

  try {
    const rows = await fetchSupabaseWorkspaces();
    const workspaces = mergeWorkspaceRecords(rows.map(mapSupabaseWorkspaceToOsWorkspace));
    return { workspaces, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load workspaces.";
    return {
      workspaces: [],
      dataSource: "error",
      errorMessage: `Could not load workspaces: ${message}`,
    };
  }
}
