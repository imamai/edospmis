"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRole, setMembershipStatus, type UserFormState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { SelectInput } from "@/components/ui/field";
import type { MemberRow, RoleWithPermissions } from "@/lib/database.types";

const initial: UserFormState = { error: null, ok: null };

export function MemberRowItem({
  member,
  roles,
  isSelf,
}: {
  member: MemberRow;
  roles: RoleWithPermissions[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateMemberRole, initial);
  const [statusPending, startStatus] = useTransition();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const currentRoleId = member.roles[0]?.id ?? "";

  function toggleStatus() {
    startStatus(async () => {
      const next = member.status === "suspended" ? "active" : "suspended";
      await setMembershipStatus(member.membership_id, member.user_id, next);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-3 pr-4">
        <p className="text-sm font-medium text-ink">{member.full_name ?? member.email}</p>
        <p className="text-xs text-ink-faint">{member.email}</p>
      </td>
      <td className="py-3 pr-4">
        <Badge tone={member.status === "active" ? "good" : member.status === "invited" ? "info" : "critical"}>
          {member.status}
        </Badge>
      </td>
      <td className="py-3 pr-4">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="user_id" value={member.user_id} />
          <SelectInput
            label=""
            aria-label={`Role for ${member.full_name ?? member.email}`}
            name="role_id"
            defaultValue={currentRoleId}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            disabled={pending}
            className="w-48"
          >
            <option value="" disabled>
              No role
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectInput>
        </form>
        {state.error && <p className="mt-1 text-xs text-critical">{state.error}</p>}
      </td>
      <td className="py-3 text-right">
        {!isSelf && (
          <button
            type="button"
            onClick={toggleStatus}
            disabled={statusPending}
            className="text-xs font-semibold text-ink-faint hover:text-critical disabled:opacity-50"
          >
            {member.status === "suspended" ? "Reactivate" : "Suspend"}
          </button>
        )}
      </td>
    </tr>
  );
}
