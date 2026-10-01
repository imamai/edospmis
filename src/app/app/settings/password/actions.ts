"use server";

import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface ChangePasswordState {
  error: string | null;
  ok: string | null;
}

/**
 * Changing your own password from inside the app.
 *
 * There was no way to do this. `/update-password` exists, but it lives in the
 * auth area and is only ever reached from an invitation or a reset email — so
 * somebody already signed in had to sign out and send themselves a reset to
 * change it, which is the kind of thing people simply do not do.
 *
 * The current password is asked for and checked by signing in with it. That
 * matters: a session left open on a shared machine is otherwise enough to
 * change the password and lock the real owner out.
 */
export async function changeOwnPassword(
  _prev: ChangePasswordState,
  form: FormData,
): Promise<ChangePasswordState> {
  const session = await requireSession();

  const current = String(form.get("current_password") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("password_confirm") ?? "");

  if (!current) return { error: "Enter your current password.", ok: null };
  if (next.length < 8)
    return {
      error: "The new password must be at least 8 characters.",
      ok: null,
    };
  if (next !== confirm)
    return { error: "Those two passwords don't match.", ok: null };
  if (next === current) {
    return {
      error: "That is the password you already have. Choose a different one.",
      ok: null,
    };
  }

  const supabase = await createClient();

  // Proves the person at the keyboard is the account holder, not somebody who
  // sat down at an unlocked screen.
  const { error: wrongPassword } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: current,
  });
  if (wrongPassword) {
    return { error: "That current password isn't right.", ok: null };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message, ok: null };

  // Worth recording. Nothing about the password is stored — only that it
  // changed, and when, which is what somebody investigating an account would
  // need to know.
  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "user.password.changed",
    entityType: "user",
    entityId: session.user.id,
  });

  return {
    error: null,
    ok: "Password changed. It takes effect the next time you sign in.",
  };
}
