"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/provision";

export interface SignInState {
  error: string | null;
}

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase answers the same for a wrong password and an unknown address,
    // which is correct — confirming which one exists would leak it.
    return { error: "That email and password don't match." };
  }

  // Signing in may be the first moment a session has existed for this
  // account, which is when the workspace they signed up for gets created.
  await ensureWorkspace(supabase, data.user);

  // Never redirect anywhere but a path on this origin: `next` arrives from
  // the query string, and an open redirect here would bounce a freshly
  // signed-in user offsite with their session already established.
  const requested = String(form.get("next") ?? "");
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app";

  redirect(next);
}
