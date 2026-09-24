import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely, so it is restricted to code
 * paths with no user session to act on behalf of, or that need to write a
 * row for someone who is not the caller:
 *   - tenant provisioning (creating the first tenant + admin membership
 *     before that user has any row-level grants yet)
 *   - inviting a teammate (auth.admin.inviteUserByEmail needs the service
 *     role outright, and the profile/membership/role rows created right
 *     after it are for the invitee, not the inviting admin — the caller's
 *     own `admin.users.manage` permission is checked in application code
 *     before any of this runs, same as every other server action)
 *   - inbound webhook callbacks authenticated by the sender rather than by
 *     a signed-in user
 *
 * Never import this from a page, layout, or client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — this code path needs it to bypass RLS.",
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
