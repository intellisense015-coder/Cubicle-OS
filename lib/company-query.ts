import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseCompanies, mapSupabaseCompanyToOsCompany } from "@/lib/supabase/companies";

export type CompaniesQuerySnapshot = {
  companies: any[];
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedCompanies() {
  const cached = getDemoValue("companies");
  return Array.isArray(cached) ? cached : [];
}

export async function fetchCompaniesSnapshot(): Promise<CompaniesQuerySnapshot> {
  const cachedCompanies = readCachedCompanies();

  if (!isSupabaseLeadsEnabled()) {
    return { companies: cachedCompanies, dataSource: "demo", errorMessage: "" };
  }

  try {
    const rows = await fetchSupabaseCompanies();
    const companies = rows.map(mapSupabaseCompanyToOsCompany);
    saveDemoValue("companies", companies, { notify: false });
    return { companies, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    const message = error?.message || "Unable to load companies from Supabase.";
    return {
      companies: cachedCompanies,
      dataSource: "demo",
      errorMessage: `Supabase could not load companies: ${message}`,
    };
  }
}
