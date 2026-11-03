import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import {
  createSupabaseWorkspaces,
  fetchSupabaseWorkspaces,
  mapSupabaseWorkspaceToOsWorkspace,
} from "@/lib/supabase/workspaces";
import { getWorkspaceRecords, mergeWorkspaceRecords } from "@/lib/workspace-records";

export type WorkspacesQuerySnapshot = {
  workspaces: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedWorkspaces() {
  const cached = getDemoValue("workspaces");
  return Array.isArray(cached) && cached.length ? cached : getWorkspaceRecords();
}

/**
 * Loads the canonical workspace read model once for the OS query cache.
 * Existing local records are still seeded into Supabase when the app is
 * connected, preserving the current demo-to-backend migration behavior.
 */
export async function fetchWorkspacesSnapshot(): Promise<WorkspacesQuerySnapshot> {
  const cachedWorkspaces = readCachedWorkspaces();

  if (!isSupabaseLeadsEnabled()) {
    return { workspaces: cachedWorkspaces, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseWorkspaces();
    const existingIds = new Set(rows.map((row) => row.id));
    const missingRecords = cachedWorkspaces.filter((record) => !existingIds.has(String(record.areaId || record.id)));
    const seededRows = await createSupabaseWorkspaces(missingRecords);
    const remoteRecords = [...rows, ...seededRows].map(mapSupabaseWorkspaceToOsWorkspace);
    const workspaces = mergeWorkspaceRecords(remoteRecords);
    saveDemoValue("workspaces", workspaces, { notify: false });
    return { workspaces, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load workspaces from Supabase.";
    return {
      workspaces: cachedWorkspaces,
      dataSource: "demo",
      errorMessage: `Supabase could not load workspaces: ${message}`,
    };
  }
}
