"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TextInput } from "@/components/ui/field";

const initial: UpdatePasswordState = { error: null };

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-brand">EDOSPMIS</h1>
          <p className="mt-1 text-sm text-ink-faint">Set your password to finish joining</p>
        </div>
        <Card>
          <CardBody>
            <form action={action} className="flex flex-col gap-4">
              <TextInput
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                hint="At least 8 characters"
              />
              {state.error && (
                <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
                  {state.error}
                </p>
              )}
              <Button type="submit" busy={pending} className="w-full">
                {pending ? "Saving" : "Set password and continue"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
