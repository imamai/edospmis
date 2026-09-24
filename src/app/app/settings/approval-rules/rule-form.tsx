"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createApprovalRule, type RuleFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { NumberInput, SelectInput, TextInput } from "@/components/ui/field";
import type { Role } from "@/lib/database.types";

const initial: RuleFormState = { error: null, ok: null };

export function RuleForm({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createApprovalRule, initial);
  const [steps, setSteps] = useState<number[]>([1]);
  const formRef = useRef<HTMLFormElement>(null);
  let nextId = steps.length + 1;

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Rule name" name="name" required placeholder="e.g. High-value purchases" className="sm:col-span-1" />
        <NumberInput label="Min amount" name="min_amount" unit="KES" decimals hint="Optional — no lower bound" />
        <NumberInput label="Max amount" name="max_amount" unit="KES" decimals hint="Optional — no upper bound" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Approval steps, in order</p>
          <button
            type="button"
            onClick={() => setSteps((s) => [...s, nextId++])}
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </button>
        </div>
        {steps.map((id, i) => (
          <div key={id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs font-semibold text-ink-faint">{i + 1}.</span>
            <SelectInput label="" name="role_id" required className="flex-1">
              <option value="">Choose a role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectInput>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => setSteps((s) => s.filter((x) => x !== id))}
                aria-label="Remove step"
                className="shrink-0 rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {state.error && <p className="text-xs text-critical">{state.error}</p>}

      <div>
        <Button type="submit" busy={pending} size="sm">
          Create rule
        </Button>
      </div>
    </form>
  );
}
