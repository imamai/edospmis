"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createQueue, type QueueFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput, SelectInput } from "@/components/ui/field";

const initial: QueueFormState = { error: null, ok: null };

const STAGES = [
  "draft",
  "approval",
  "approved",
  "procurement",
  "awarded",
  "receiving",
  "finance",
  "delivery",
  "closed",
];

// workload_balanced/skill_department aren't wired to a routing engine yet
// (see ARCHITECTURE.md §4.5) — the hint on the form says so, so setting one
// doesn't imply behavior that isn't built.
const STRATEGIES = ["role", "manual", "fifo", "round_robin", "workload_balanced", "skill_department"];

export function QueueForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createQueue, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <TextInput label="Name" name="name" required placeholder="e.g. Finance Approvals" hint=" " className="flex-1" />
      <SelectInput label="Stage" name="stage_key" required hint=" " className="sm:min-w-[10rem]">
        <option value="">Choose a stage</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectInput>
      <SelectInput
        label="Assignment strategy"
        name="assignment_strategy"
        defaultValue="role"
        hint="Not wired to a routing engine yet."
        className="sm:min-w-[12rem]"
      >
        {STRATEGIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectInput>
      <Button type="submit" busy={pending}>
        <Plus className="h-4 w-4" />
        Add queue
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
    </form>
  );
}
