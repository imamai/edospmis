"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClientRecord, type ClientFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: ClientFormState = { error: null, ok: null };

export function ClientForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createClientRecord, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextInput label="Name" name="name" required className="flex-1" />
      <TextInput label="Email" name="email" type="email" hint="Optional" className="flex-1" />
      <TextInput label="Phone" name="phone" hint="Optional" className="flex-1" />
      <Button type="submit" busy={pending}>
        <Plus className="h-4 w-4" />
        Add client
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
    </form>
  );
}
