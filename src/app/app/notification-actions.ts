"use server";

import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Marking your own notifications read.
 *
 * Scoped to the signed-in user as well as being behind a policy that says the
 * same. Belt and braces, because the ids come from the browser and a list of
 * uuids is the easiest thing in the world to edit.
 */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const session = await requireSession();
  const supabase = await createClient();
  await supabase
    .from("edospmis_notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", session.user.id)
    .is("read_at", null);
}
