import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
}).strict();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse("Supabase authentication is not configured.", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid session payload.", 400);
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid session payload.", 400);

  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const accessToken = parsed.data.access_token;
  const refreshToken = parsed.data.refresh_token;
  if (!accessToken || !refreshToken) return errorResponse("Invalid session payload.", 400);

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) return errorResponse("Unable to persist the sign-in session.", 401);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return errorResponse("Unable to validate the sign-in session.", 401);

  return response;
}
