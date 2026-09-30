import "server-only";

/**
 * Which "sign in with…" providers are actually switched on in Supabase.
 *
 * A button for a provider that is not enabled does not fail politely: it
 * sends the browser to Supabase, which answers with a bare JSON error —
 * `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider:
 * provider is not enabled"}` — on a white page. The app never gets the
 * chance to say anything. So the sign-in screens ask first and show only what
 * will work; switching a provider on in the Supabase dashboard makes its
 * button appear within a few minutes, with no deployment.
 */

export type ProviderId = "google" | "facebook" | "apple" | "azure";

const OFFERED: ProviderId[] = ["google", "facebook", "apple", "azure"];

export async function enabledProviders(): Promise<ProviderId[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      // Settings change rarely; five minutes keeps the screen fast and still
      // picks up a provider switched on this afternoon.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return OFFERED.filter((id) => body.external?.[id] === true);
  } catch {
    // Unknown means none: a missing button is better than one that strands
    // someone on an error page.
    return [];
  }
}
