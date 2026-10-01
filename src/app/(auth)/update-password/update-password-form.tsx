"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { updatePassword, type UpdatePasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";

const initial: UpdatePasswordState = { error: null };

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Only once they have typed something in the second box. Telling somebody
  // the passwords do not match while they are still on the first character of
  // the confirmation is just noise.
  const mismatch = confirm.length > 0 && confirm !== password;
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
        <PasswordField
          label={resetting ? "New password" : "Password"}
          name="password"
          required
          autoFocus
          minLength={8}
          hint="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <PasswordField
          label={resetting ? "Confirm the new password" : "Type it again"}
          name="password_confirm"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "These don't match yet." : null}
        />

        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          busy={pending}
          disabled={password.length < 8 || confirm !== password}
          className="w-full"
        >
          {pending ? "Saving" : "Save and continue"}
        </Button>
      </form>
    </div>
  );
}
