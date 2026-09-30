"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Signing in with an account you already have elsewhere.
 *
 * Worth being exact about what this does: it proves an email address, and
 * that is all. Where that address already belongs to a member of a workspace,
 * they land in it. Where it belongs to nobody, they are a new account with no
 * workspace yet, and /new-workspace is where the app already sends those —
 * so the organisation name is asked for there, once, rather than on a sign-up
 * form they never filled in.
 *
 * Each provider must also be switched on in the Supabase project, with its own
 * app id and secret. Until one is, its button returns a plain "not switched on
 * yet" message rather than failing silently — a dead button on a sign-in
 * screen reads as the whole product being broken.
 *
 * The marks are drawn inline rather than fetched: a sign-in screen should not
 * make a request to Google, Meta or Apple before the person has chosen to.
 */

import type { ProviderId } from "@/lib/auth/providers";

const PROVIDERS: { id: ProviderId; label: string; icon: React.ReactNode }[] = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.65Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.28a7.17 7.17 0 0 1 0-4.56V6.61H1.26a12 12 0 0 0 0 10.78l4.01-3.11Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
    ),
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        <path
          fill="#1877F2"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z"
        />
      </svg>
    ),
  },
  {
    id: "apple",
    label: "Apple",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M17.05 12.77c.02-2.03 1.66-3.01 1.73-3.06-.94-1.38-2.41-1.57-2.93-1.59-1.25-.13-2.44.73-3.07.73-.63 0-1.61-.71-2.65-.69-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1 1.02 8.1.67.98 1.48 2.08 2.53 2.04 1.02-.04 1.4-.66 2.63-.66s1.58.66 2.66.64c1.1-.02 1.79-1 2.46-1.98.78-1.13 1.1-2.23 1.11-2.29-.02-.01-2.14-.82-2.16-3.25ZM15.02 6.4c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.39-1.13Z"
        />
      </svg>
    ),
  },
  {
    id: "azure",
    label: "Microsoft",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10.2v10.2H1z" />
        <path fill="#7FBA00" d="M12.8 1H23v10.2H12.8z" />
        <path fill="#00A4EF" d="M1 12.8h10.2V23H1z" />
        <path fill="#FFB900" d="M12.8 12.8H23V23H12.8z" />
      </svg>
    ),
  },
];

export function SocialSignIn({
  next,
  label,
  divider = "above",
  enabled,
  intent = "signin",
}: {
  next?: string;
  label: string;
  /**
   * On the sign-up screen a Google account with no business behind it is
   * someone opening one, not a stranger at the door — the callback sends them
   * to finish their business details instead of signing them out.
   */
  intent?: "signin" | "signup";
  /** Only the providers switched on in Supabase — see lib/auth/providers.ts. */
  enabled: ProviderId[];
  /** Where the "or" rule goes. Below, when these buttons lead the screen. */
  divider?: "above" | "below";
}) {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: ProviderId, name: string) {
    setBusy(provider);
    setError(null);
    const supabase = createClient();

    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}${intent === "signup" ? "&intent=signup" : ""}`,
      },
    });

    if (failure) {
      setBusy(null);
      setError(
        /not enabled|unsupported|provider/i.test(failure.message)
          ? `${name} sign-in is not switched on yet. Use your username and password for now.`
          : failure.message,
      );
    }
  }

  const rule = (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-faint">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );

  const shown = PROVIDERS.filter((p) => enabled.includes(p.id));
  // None switched on: no buttons, no "or" rule, nothing that leads nowhere.
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {divider === "above" && rule}

      <div
        className={cn(
          "grid gap-2",
          shown.length === 1 ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void start(p.id, p.label)}
            disabled={busy !== null}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-medium text-ink transition-colors",
              "hover:border-brand disabled:opacity-60",
            )}
          >
            {p.icon}
            {busy === p.id ? "Opening…" : p.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs text-critical">
          {error}
        </p>
      )}

      {divider === "below" && rule}
    </div>
  );
}
