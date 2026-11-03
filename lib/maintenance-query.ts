import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import {
  getMaintenanceCategories,
  getMaintenanceEvents,
  getMaintenanceRecords,
  type MaintenanceCategory,
  type MaintenanceEvent,
  type MaintenanceRecord,
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

type MaintenanceDataSource = "supabase" | "demo";

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
  return `Supabase could not load ${resource}: ${message}`;
}

export async function fetchMaintenanceCategoriesSnapshot(): Promise<MaintenanceCategoriesQuerySnapshot> {
  const cachedCategories = getMaintenanceCategories();
  if (!isSupabaseLeadsEnabled()) {
    return { categories: cachedCategories, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseMaintenanceCategories();
    const categories = rows.map(mapSupabaseMaintenanceCategoryToOsCategory);
    saveDemoValue("maintenanceCategories", categories, { notify: false });
    return { categories, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      categories: cachedCategories,
      dataSource: "demo",
      errorMessage: errorMessage(error, "maintenance categories"),
    };
  }
}

export async function fetchMaintenanceRecordsSnapshot(): Promise<MaintenanceRecordsQuerySnapshot> {
  const cachedRecords = getMaintenanceRecords();
  if (!isSupabaseLeadsEnabled()) {
    return { records: cachedRecords, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseMaintenanceRecords();
    const records = rows.map(mapSupabaseMaintenanceRecordToOsRecord);
    saveDemoValue("maintenanceRecords", records, { notify: false });
    return { records, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      records: cachedRecords,
      dataSource: "demo",
      errorMessage: errorMessage(error, "maintenance records"),
    };
  }
}

export async function fetchMaintenanceEventsSnapshot(): Promise<MaintenanceEventsQuerySnapshot> {
  const cachedEvents = getMaintenanceEvents();
  if (!isSupabaseLeadsEnabled()) {
    return { events: cachedEvents, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseMaintenanceEvents();
    const events = rows.map(mapSupabaseMaintenanceEventToOsEvent);
    saveDemoValue("maintenanceEvents", events, { notify: false });
    return { events, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      events: cachedEvents,
      dataSource: "demo",
      errorMessage: errorMessage(error, "maintenance events"),
    };
  }
}
