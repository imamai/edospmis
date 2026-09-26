"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createBranch, type BranchFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput, SelectInput } from "@/components/ui/field";
import type { BusinessUnit } from "@/lib/database.types";

const initial: BranchFormState = { error: null, ok: null };

export function BranchForm({ businessUnits }: { businessUnits: BusinessUnit[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createBranch, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <TextInput label="Name" name="name" required placeholder="e.g. Mombasa Branch" className="flex-1" />
      <TextInput label="Code" name="code" placeholder="Optional" className="sm:w-32" />
      <SelectInput label="Business unit" name="business_unit_id" className="sm:min-w-[12rem]">
        <option value="">None</option>
        {businessUnits.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectInput>
      <Button type="submit" busy={pending}>
        <Plus className="h-4 w-4" />
        Add branch
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
    </form>
  );
}
