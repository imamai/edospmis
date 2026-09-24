import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase client carrying the signed-in user's session, so
 * every query runs under that user's RLS policies. Nothing in this app ever
 * queries with the service role from a page, server action or component.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by middleware instead, so this is
            // safe to ignore.
          }
        },
      },
    },
  );
}
