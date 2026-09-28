"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSendEmail, sendEmail } from "@/lib/notify/email";
import { signupConfirmEmail } from "@/lib/notify/auth-email";
import { ensureWorkspace } from "@/lib/provision";

export interface SignUpState {
  error: string | null;
  /** Set once the confirmation email is on its way, so the form can say so. */
  checkEmail?: boolean;
  email?: string;
}

/** The address this request arrived on, so the link comes back to the same place. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Creates the account, and emails the confirmation as EDOSPMIS.
 *
 * `admin.generateLink` creates the user and hands back the confirmation token
 * without sending anything, which leaves the message to us — see
 * lib/notify/auth-email.ts for why that is worth the extra step.
 *
 * Where this deployment has no mail configured, it falls back to
 * `supabase.auth.signUp()` so sign-up still works; the person then gets
 * Supabase's own stock email, or lands straight in the app if the project
 * does not require confirmation at all.
 */
export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const tenantName = String(form.get("tenant_name") ?? "").trim();

  if (!fullName || !email || !password || !tenantName) {
    return { error: "Please fill in every field." };
  }
  if (!email.includes("@")) return { error: "Please enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const base = await origin();

  // pending_tenant_name survives to the first moment a session exists, which
  // is where the workspace actually gets created — see lib/provision.ts.
  const metadata = { full_name: fullName, pending_tenant_name: tenantName };

  if (canSendEmail()) {
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return { error: "Sign-up isn't set up yet on this deployment. Please contact support." };
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: metadata, redirectTo: `${base}/auth/callback?next=/welcome` },
    });

    if (error) {
      const message = error.message.toLowerCase();
      // Unlike a password reset, this one has to say so: the person is trying
      // to create an account and needs to know it already exists. Signing in
      // reveals the same thing anyway.
      if (message.includes("already") || message.includes("registered")) {
        return { error: "There is already an account with that email. Try signing in instead." };
      }
      return { error: "We couldn't create your account. Please try again." };
    }

    const tokenHash = data?.properties?.hashed_token;
    if (!tokenHash) return { error: "We couldn't create your account. Please try again." };

    const link = `${base}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=signup&next=/welcome`;
    const sent = await sendEmail({
      to: email,
      ...signupConfirmEmail({ link, name: fullName || null }),
    });

    if (!sent.ok) {
      console.error("EDOSPMIS signup confirmation email failed:", sent.error);
      return {
        error:
          "Your account was created but we couldn't send the confirmation email. Use “Forgot your password?” on the sign-in page to get in.",
      };
    }

    return { error: null, checkEmail: true, email };
  }

  // ---- no mail configured: Supabase sends whatever it is set up to send ----
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) return { error: error.message };

  if (!data.session || !data.user) return { error: null, checkEmail: true, email };

  await ensureWorkspace(supabase, data.user);
  redirect("/app");
}
