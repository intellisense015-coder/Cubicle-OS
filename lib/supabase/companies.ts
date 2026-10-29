import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SupabaseCompanyRow = {
  id: string;
  name: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

const companyColumns = "id,name,status,created_at,updated_at";

export function mapSupabaseCompanyToOsCompany(row: SupabaseCompanyRow) {
  return {
    id: row.id,
    backend: "supabase",
    name: row.name,
    status: row.status === "inactive" ? "Inactive" : "Active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSupabaseCompanies() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("companies")
    .select(companyColumns)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as SupabaseCompanyRow[];
}

export async function createSupabaseCompany(name: string) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) throw new Error("Company name is required.");

  const { data, error } = await getSupabaseBrowserClient()
    .from("companies")
    .insert({ name: normalizedName, status: "active" })
    .select(companyColumns)
    .single();

  if (!error) return data as unknown as SupabaseCompanyRow;

  if (error.code === "23505") {
    const companies = await fetchSupabaseCompanies();
    const existing = companies.find((company) => company.name.trim().toLowerCase() === normalizedName.toLowerCase());
    if (existing) return existing;
  }

  throw error;
}

export async function updateSupabaseCompanyStatus(id: string, status: "active" | "inactive") {
  const { data, error } = await getSupabaseBrowserClient()
    .from("companies")
    .update({ status })
    .eq("id", id)
    .select(companyColumns)
    .single();

  if (error) throw error;
  return data as unknown as SupabaseCompanyRow;
}
