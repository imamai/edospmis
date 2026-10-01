"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface UpdatePasswordState {
  error: string | null;
}

export async function updatePassword(
  _prev: UpdatePasswordState,
  form: FormData,
): Promise<UpdatePasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("password_confirm") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  // Checked here as well as in the browser: the form is the convenience, this
  // is the guarantee. Somebody who gets past the first has still only set a
  // password they typed twice.
  if (confirm !== password)
    return { error: "Those two passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/app");
}
