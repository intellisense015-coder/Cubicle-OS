import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseCompanies, mapSupabaseCompanyToOsCompany } from "@/lib/supabase/companies";

export type CompaniesQuerySnapshot = {
  companies: any[];
  dataSource: "supabase" | "error";
  errorMessage: string;
};

export async function fetchCompaniesSnapshot(): Promise<CompaniesQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { companies: [], dataSource: "error", errorMessage: "Supabase is required for company records." };
  }

  try {
    const rows = await fetchSupabaseCompanies();
    const companies = rows.map(mapSupabaseCompanyToOsCompany);
    return { companies, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load companies.";
    return {
      companies: [],
      dataSource: "error",
      errorMessage: `Could not load companies: ${message}`,
    };
  }
}
