import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureOsMutation } from "@/lib/supabase/secure-mutations";

export type SupabaseCompanyProfile = {
  id: number;
  company_name: string;
  contact_email: string;
  owner_name: string;
  updated_by: string;
  updated_at: string;
};

const companyProfileColumns = "id,company_name,contact_email,owner_name,updated_by,updated_at";

export async function fetchSupabaseCompanyProfile() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("os_company_profile")
    .select(companyProfileColumns)
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data as SupabaseCompanyProfile | null;
}

export async function saveSupabaseCompanyProfile(input: { name: string; email: string; ownerName: string }) {
  const normalized = {
    company_name: input.name.trim(),
    contact_email: input.email.trim().toLowerCase(),
    owner_name: input.ownerName.trim(),
  };
  if (!normalized.company_name || !normalized.contact_email || !normalized.owner_name) {
    throw new Error("Company name, contact email and owner name are required.");
  }

  return secureOsMutation<SupabaseCompanyProfile>("companyProfile.save", {
    name: normalized.company_name,
    email: normalized.contact_email,
    ownerName: normalized.owner_name,
  });
}
