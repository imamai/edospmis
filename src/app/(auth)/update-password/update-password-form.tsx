"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { updatePassword, type UpdatePasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: UpdatePasswordState = { error: null };

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  // The reset link carries this; an invitation link does not.
  const resetting = useSearchParams().get("type") === "recovery";

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        {resetting ? "Choose a new password" : "Set your password"}
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        {resetting
          ? "Then you will be signed straight in."
          : "One password, and you are in — your workspace is already waiting."}
      </p>

      <form action={action} className="mt-7 flex flex-col gap-4">
        <TextInput
          label={resetting ? "New password" : "Password"}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
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
          {pending ? "Saving" : "Save and continue"}
        </Button>
      </form>
    </div>
  );
}
