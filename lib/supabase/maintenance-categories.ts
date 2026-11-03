import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

export type SupabaseMaintenanceCategoryRow = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const categoryColumns = "id,name,description,active,created_at,updated_at";

export function mapSupabaseMaintenanceCategoryToOsCategory(row: SupabaseMaintenanceCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.description || (row.active ? "Available for maintenance requests" : "Deactivated for new requests"),
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

export async function createSupabaseMaintenanceCategory(name: string, description?: string) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) throw new Error("Maintenance category name is required.");
  const normalizedDescription = String(description || "").trim();

  return secureOsMutation<SupabaseMaintenanceCategoryRow>("maintenance.category.create", {
    name: normalizedName,
    description: normalizedDescription,
  });
}

export async function updateSupabaseMaintenanceCategory(id: string, input: { name: string; active: boolean; description?: string }) {
  const normalizedName = String(input.name || "").trim();
  if (!normalizedName) throw new Error("Maintenance category name is required.");
  const normalizedDescription = String(input.description || "").trim();

  return secureOsMutation<SupabaseMaintenanceCategoryRow>("maintenance.category.update", {
    id,
    name: normalizedName,
    ...(typeof input.description === "string" ? { description: normalizedDescription } : {}),
    active: input.active,
  });
}
