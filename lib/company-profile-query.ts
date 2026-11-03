import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseCompanyProfile } from "@/lib/supabase/company-profile";

export type CompanyProfileQueryValue = {
  name: string;
  email: string;
  ownerName: string;
};

export type CompanyProfileQuerySnapshot = {
  profile: CompanyProfileQueryValue;
  dataSource: "supabase" | "demo";
  errorMessage: string;
};

function readCachedProfile(): CompanyProfileQueryValue {
  return {
    name: String(getDemoValue("companyName") || "The Cubicle"),
    email: String(getDemoValue("companyEmail") || "info@thecubicle.pk"),
    ownerName: String(getDemoValue("profileName") || ""),
  };
}

export async function fetchCompanyProfileSnapshot(): Promise<CompanyProfileQuerySnapshot> {
  const cachedProfile = readCachedProfile();
  if (!isSupabaseLeadsEnabled()) {
    return { profile: cachedProfile, dataSource: "demo", errorMessage: "" };
  }

  try {
    const profile = await fetchSupabaseCompanyProfile();
    if (!profile) return { profile: cachedProfile, dataSource: "demo", errorMessage: "" };
    const nextProfile = { name: profile.company_name, email: profile.contact_email, ownerName: profile.owner_name };
    saveDemoValue("companyName", nextProfile.name, { notify: false });
    saveDemoValue("companyEmail", nextProfile.email, { notify: false });
    saveDemoValue("profileName", nextProfile.ownerName, { notify: false });
    return { profile: nextProfile, dataSource: "supabase", errorMessage: "" };
  } catch (error: any) {
    return {
      profile: cachedProfile,
      dataSource: "demo",
      errorMessage: `Could not load company settings: ${error?.message || "Unable to load company settings."}`,
    };
  }
}
