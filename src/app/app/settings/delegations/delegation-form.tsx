"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createDelegation } from "../../finance/actions";
import type { FinanceState } from "../../finance/actions";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";
import type { RoleWithPermissions, MemberRow } from "@/lib/database.types";

const initial: FinanceState = { error: null, ok: null };

export function DelegationForm({ myRoles, members }: { myRoles: RoleWithPermissions[]; members: MemberRow[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createDelegation, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  if (myRoles.length === 0) {
    return <p className="text-sm text-ink-faint">You don&rsquo;t hold a role that can be delegated.</p>;
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
      <SelectInput label="Role to delegate" name="role_id" required className="sm:flex-1">
        <option value="">Choose a role you hold</option>
        {myRoles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </SelectInput>
      <SelectInput label="Delegate to" name="to_user_id" required className="sm:flex-1">
        <option value="">Choose a teammate</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.full_name ?? m.email}
          </option>
        ))}
      </SelectInput>
      <TextInput label="From" name="starts_at" type="datetime-local" required />
      <TextInput label="Until" name="ends_at" type="datetime-local" required />
      <Button type="submit" size="sm" busy={pending}>
        Delegate
      </Button>
      {state.error && <p className="w-full text-xs text-critical">{state.error}</p>}
    </form>
  );
}
