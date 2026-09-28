"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { createWorkspace, type WorkspaceState } from "./actions";

const initial: WorkspaceState = { error: null };

export function WorkspaceForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createWorkspace, initial);

  // The action cannot redirect for us: the tenant only becomes visible to
  // `getSession` after the router re-reads it, so the refresh has to happen
  // on this side.
  useEffect(() => {
    if (state !== initial && !state.error && !pending) {
      router.replace("/app");
      router.refresh();
    }
  }, [state, pending, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextInput
        label="Organisation name"
        name="tenant_name"
        required
        autoFocus
        autoComplete="organization"
        placeholder="e.g. EDOS Centre"
        hint="This names your workspace — you can change it later"
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
    </form>
  );
}
