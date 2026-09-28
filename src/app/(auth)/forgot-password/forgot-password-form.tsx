"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestPasswordReset, type ResetState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: ResetState = { error: null };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft p-7 text-center">
        <MailCheck className="h-8 w-8 text-brand" />
        <h2 className="font-display text-lg font-bold text-ink">Check your email</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          If that address has an EDOSPMIS account, a link to choose a new password
          is on its way. It works once, and expires shortly.
        </p>
        <Link href="/login" className="mt-1 text-sm font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextInput label="Email" name="email" type="email" autoComplete="email" required autoFocus />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" busy={pending} className="w-full">
        {pending ? "Sending" : "Email me a link"}
      </Button>

      <Link
        href="/login"
        className="text-center text-sm text-ink-soft hover:text-brand hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
