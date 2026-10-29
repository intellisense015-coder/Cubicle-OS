import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseMaintenanceCategoryRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const categoryColumns = "id,name,active,created_at,updated_at";

export function mapSupabaseMaintenanceCategoryToOsCategory(row: SupabaseMaintenanceCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
  };
}

export async function fetchSupabaseMaintenanceCategories() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_categories")
    .select(categoryColumns)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as SupabaseMaintenanceCategoryRow[];
}

export async function createSupabaseMaintenanceCategory(name: string) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) throw new Error("Maintenance category name is required.");

  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_categories")
    .insert({ name: normalizedName, active: true })
    .select(categoryColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseMaintenanceCategoryRow;
}

export async function updateSupabaseMaintenanceCategory(id: string, input: { name: string; active: boolean }) {
  const normalizedName = String(input.name || "").trim();
  if (!normalizedName) throw new Error("Maintenance category name is required.");

  const { data, error } = await getSupabaseBrowserClient()
    .from("maintenance_categories")
    .update({ name: normalizedName, active: input.active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(categoryColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseMaintenanceCategoryRow;
}
