"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createRole, type RoleFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: RoleFormState = { error: null, ok: null };

export function CreateRoleForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createRole, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextInput label="Role name" name="name" required className="flex-1" placeholder="e.g. Warehouse Supervisor" />
      <TextInput label="Description" name="description" className="flex-1" hint="Optional" />
      <Button type="submit" busy={pending}>
        <Plus className="h-4 w-4" />
        Create role
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
    </form>
  );
}
