import { NextResponse } from "next/server";
import { z } from "zod";
import { getOsAuthContext, ensureOsAuthState } from "@/lib/server-os-auth";

export const runtime = "nodejs";

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(1).max(30),
}).strict();

export async function POST(request: Request) {
  const context = await getOsAuthContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "MFA verification is required." }, { status: 403 });
  if (context.role.trim().toLowerCase() !== "owner") return NextResponse.json({ error: "Only the workspace owner can complete onboarding." }, { status: 403 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid first name, last name, email and phone number." }, { status: 400 });

  await ensureOsAuthState(context);
  const profile = {
    user_id: context.user.id,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    updated_at: new Date().toISOString(),
  };
  const { error } = await context.serviceClient
    .from("os_user_profiles")
    .upsert(profile, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "The owner profile could not be saved." }, { status: 500 });

  const { data: existingCompanyProfile, error: companyProfileReadError } = await context.serviceClient
    .from("os_company_profile")
    .select("company_name")
    .eq("id", 1)
    .maybeSingle();
  if (companyProfileReadError) return NextResponse.json({ error: "The company profile could not be loaded." }, { status: 500 });

  const { error: companyProfileError } = await context.serviceClient
    .from("os_company_profile")
    .upsert({
      id: 1,
      company_name: existingCompanyProfile?.company_name || "The Cubicle",
      contact_email: profile.email,
      owner_name: `${profile.first_name} ${profile.last_name}`.trim(),
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (companyProfileError) return NextResponse.json({ error: "The company profile could not be synchronized." }, { status: 500 });

  return NextResponse.json({ saved: true });
}
