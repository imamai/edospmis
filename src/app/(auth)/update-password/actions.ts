"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface UpdatePasswordState {
  error: string | null;
}

export async function updatePassword(_prev: UpdatePasswordState, form: FormData): Promise<UpdatePasswordState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/app");
}
