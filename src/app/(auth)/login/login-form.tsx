"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type SignInState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: SignInState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const params = useSearchParams();

  // Where to land after signing in. Only ever a path on this origin — the
  // action re-checks, but keeping a crafted absolute URL out of the form in
  // the first place is cheaper than relying on one guard.
  const requested = params.get("next") ?? "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "";

  // /auth/callback sends people back here when a link has been used already
  // or has expired. Without this it looked like nothing had happened at all.
  const linkExpired = params.get("error") === "link_expired";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <TextInput label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {linkExpired && !state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          That link has expired or has already been used. Ask for a new one below.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" busy={pending} className="w-full">
        {pending ? "Signing in" : "Sign in"}
      </Button>

      <Link
        href="/forgot-password"
        className="text-center text-sm text-ink-soft hover:text-brand hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
