"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { inviteUser, type UserFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput, SelectInput } from "@/components/ui/field";
import type { RoleWithPermissions } from "@/lib/database.types";

const initial: UserFormState = { error: null, ok: null };

export function InviteForm({ roles }: { roles: RoleWithPermissions[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(inviteUser, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextInput label="Email to invite" name="email" type="email" required className="flex-1" />
      <SelectInput label="Role" name="role_id" required className="sm:w-56">
        <option value="">Choose a role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </SelectInput>
      <Button type="submit" busy={pending} className="sm:mb-0">
        <UserPlus className="h-4 w-4" />
        Invite
      </Button>
      {state.error && <p className="text-xs text-critical sm:w-full">{state.error}</p>}
      {state.ok && <p className="text-xs text-good sm:w-full">{state.ok}</p>}
    </form>
  );
}
