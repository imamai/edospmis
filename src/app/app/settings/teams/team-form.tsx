"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTeam, type TeamFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput, SelectInput } from "@/components/ui/field";
import type { Department } from "@/lib/database.types";

const initial: TeamFormState = { error: null, ok: null };

export function TeamForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTeam, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextInput label="Name" name="name" required placeholder="e.g. Sourcing Team" className="flex-1" />
      <SelectInput label="Department" name="department_id" className="sm:min-w-[12rem]">
        <option value="">None</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </SelectInput>
      <Button type="submit" busy={pending}>
        <Plus className="h-4 w-4" />
        Add team
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
    </form>
  );
}
