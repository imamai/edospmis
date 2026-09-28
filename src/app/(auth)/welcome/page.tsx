import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/provision";

/**
 * Where a confirmed sign-up link lands.
 *
 * /auth/callback has just turned the emailed token into a session, so this is
 * the first moment `edospmis_provision_tenant` can run as the person who
 * signed up. It creates their workspace and hands them straight on — there is
 * nothing here to read, which is the point: confirming an email should not
 * end on a page asking you to do something else.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Where there was no organisation name to work from — an invitation, or a
  // sign-up that predates this — /new-workspace asks for one rather than
  // dropping them at a page that will bounce them back to /login.
  const ready = await ensureWorkspace(supabase, user);
  redirect(ready ? "/app" : "/new-workspace");
}
