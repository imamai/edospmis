import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/session";
import { ensureWorkspace } from "@/lib/provision";
import { WorkspaceForm } from "./workspace-form";

export const metadata: Metadata = {
  title: "Create your workspace",
  robots: { index: false, follow: false },
};

/**
 * The one screen that can put a signed-in account into a workspace.
 *
 * Almost nobody should see the form. Sign-up parks the organisation name in
 * auth metadata and /welcome turns it into a tenant the moment the emailed
 * link is confirmed, so this page normally provisions and moves on without
 * being read.
 *
 * It exists for the cases that leave somebody signed in with nowhere to be —
 * an invitation that was never activated, or provisioning that failed the
 * first time. Without it, `requireSession` sends those accounts to /login,
 * where signing in succeeds and sends them straight back: a loop with no way
 * out but support.
 */
export default async function NewWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureWorkspace(supabase, user);
  if (await getSession()) redirect("/app");

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Name your workspace
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        One workspace per organisation — you can invite the rest of your team to
        it once it exists.
      </p>

      <div className="mt-7">
        <WorkspaceForm />
      </div>
    </div>
  );
}
