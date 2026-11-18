import type {
  MaintenanceCategory,
  MaintenanceEvent,
  MaintenanceRecord,
} from "@/lib/maintenance";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import {
  fetchSupabaseMaintenanceCategories,
  mapSupabaseMaintenanceCategoryToOsCategory,
} from "@/lib/supabase/maintenance-categories";
import {
  fetchSupabaseMaintenanceEvents,
  fetchSupabaseMaintenanceRecords,
  mapSupabaseMaintenanceEventToOsEvent,
  mapSupabaseMaintenanceRecordToOsRecord,
} from "@/lib/supabase/maintenance";

type MaintenanceDataSource = "supabase" | "error";

export type MaintenanceCategoriesQuerySnapshot = {
  categories: MaintenanceCategory[];
  dataSource: MaintenanceDataSource;
  errorMessage: string;
};

export type MaintenanceRecordsQuerySnapshot = {
  records: MaintenanceRecord[];
  dataSource: MaintenanceDataSource;
  errorMessage: string;
};

export type MaintenanceEventsQuerySnapshot = {
  events: MaintenanceEvent[];
  dataSource: MaintenanceDataSource;
  errorMessage: string;
};

function errorMessage(error: unknown, resource: string) {
  const message = error instanceof Error ? error.message : "The saved data could not be loaded.";
  return `Could not load ${resource}: ${message}`;
}

export async function fetchMaintenanceCategoriesSnapshot(): Promise<MaintenanceCategoriesQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { categories: [], dataSource: "error", errorMessage: "Supabase is required for maintenance categories." };
  }

  try {
    const rows = await fetchSupabaseMaintenanceCategories();
    const categories = rows.map(mapSupabaseMaintenanceCategoryToOsCategory);
    return { categories, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      categories: [],
      dataSource: "error",
      errorMessage: errorMessage(error, "maintenance categories"),
    };
  }
}

export async function fetchMaintenanceRecordsSnapshot(): Promise<MaintenanceRecordsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { records: [], dataSource: "error", errorMessage: "Supabase is required for maintenance records." };
  }

  try {
    const rows = await fetchSupabaseMaintenanceRecords();
    const records = rows.map(mapSupabaseMaintenanceRecordToOsRecord);
    return { records, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      records: [],
      dataSource: "error",
      errorMessage: errorMessage(error, "maintenance records"),
    };
  }
}

export async function fetchMaintenanceEventsSnapshot(): Promise<MaintenanceEventsQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { events: [], dataSource: "error", errorMessage: "Supabase is required for maintenance events." };
  }

  try {
    const rows = await fetchSupabaseMaintenanceEvents();
    const events = rows.map(mapSupabaseMaintenanceEventToOsEvent);
    return { events, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      events: [],
      dataSource: "error",
      errorMessage: errorMessage(error, "maintenance events"),
    };
  }
}
