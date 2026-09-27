/**
 * Is this URL safe for the server to fetch?
 *
 * The tenant logo is stored as a URL and then fetched server-side to embed in
 * PO and invoice PDFs. Without this check, anyone who could set the logo could
 * choose what the server requests — a server-side request forgery. The obvious
 * targets are cloud metadata endpoints (169.254.169.254) and services bound to
 * localhost that are unreachable from outside but perfectly reachable from the
 * server making the request.
 *
 * The guard is an allowlist, not a blocklist: a logo is always something this
 * application uploaded to its own Supabase Storage bucket, so anything else is
 * refused. Blocklists of private ranges are worth having as a second layer,
 * but on their own they lose to DNS names that resolve to internal addresses.
 *
 * No "server-only" here: the upload component uses the same check before it
 * saves, so the browser and the server agree on what a valid logo URL is.
 */

/** Hosts the server is willing to fetch a logo from. */
function allowedHosts(): string[] {
  const hosts: string[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.push(new URL(supabaseUrl).host);
    } catch {
      // A malformed env var shouldn't widen the allowlist — just skip it.
    }
  }
  return hosts;
}

/**
 * Returns the URL when it is safe to fetch, or null.
 *
 * Deliberately returns null rather than throwing: a bad logo should degrade to
 * the text-only letterhead, never break a purchase order someone is trying to
 * send.
 */
export function safeLogoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // https only. http would also expose the request to interception on the way
  // out, and every URL this app produces is https.
  if (url.protocol !== "https:") return null;

  // Credentials in a URL are never legitimate here and are a known way to
  // confuse host parsing.
  if (url.username || url.password) return null;

  const hosts = allowedHosts();
  if (hosts.length === 0) return null;
  if (!hosts.includes(url.host)) return null;

  return url.toString();
}

/** Whether a URL would be accepted — for validating before saving. */
export function isSafeLogoUrl(raw: string | null | undefined): boolean {
  return raw === null || raw === undefined || raw === "" || safeLogoUrl(raw) !== null;
}
