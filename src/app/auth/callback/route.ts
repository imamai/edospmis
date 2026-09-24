import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase's invite/password-recovery links, which arrive
 * as `?code=...&next=/somewhere` (PKCE flow). Exchanging the code establishes
 * a real session before handing off — the invited teammate lands on
 * /update-password already signed in, not just "confirmed".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
