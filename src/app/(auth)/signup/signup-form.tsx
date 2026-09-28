"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { signUp, type SignUpState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ONBOARDING_NOTE } from "@/lib/plans";

const initial: SignUpState = { error: null };

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);

  if (state.checkEmail) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft p-7 text-center">
        <MailCheck className="h-8 w-8 text-brand" />
        <h2 className="font-display text-lg font-bold text-ink">Check your email</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          We sent a confirmation link to{" "}
          <strong className="text-ink">{state.email ?? "your address"}</strong>. Open it
          and you will land straight in your new workspace.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextInput
        label="Organisation name"
        name="tenant_name"
        required
        autoFocus
        placeholder="e.g. EDOS Centre"
        hint="This names your workspace — you can change it later"
      />
      <TextInput label="Your full name" name="full_name" required autoComplete="name" />
      <TextInput label="Email" name="email" type="email" autoComplete="email" required />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters"
      />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" busy={pending} className="w-full">
        {pending ? "Creating your workspace" : "Create my workspace"}
      </Button>

      <p className="text-xs leading-relaxed text-ink-faint">
        {ONBOARDING_NOTE} Nothing is charged while you are trialling, and your
        records stay yours — isolated from every other organisation, and exportable
        at any time.
      </p>
    </form>
  );
}
