"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRole, setMembershipStatus, setMemberPlacement, type UserFormState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { SelectInput } from "@/components/ui/field";
import { PlacementPicker } from "@/components/app/placement-picker";
import { placementLabel } from "@/lib/placement";
import { Button } from "@/components/ui/button";
import type { MemberRow, PlacementOptions, RoleWithPermissions } from "@/lib/database.types";

const initial: UserFormState = { error: null, ok: null };

export function MemberRowItem({
  member,
  roles,
  placementOptions,
  isSelf,
}: {
  member: MemberRow;
  roles: RoleWithPermissions[];
  placementOptions: PlacementOptions;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateMemberRole, initial);
  const [statusPending, startStatus] = useTransition();
  const [editingPlace, setEditingPlace] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placePending, startPlace] = useTransition();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  /**
   * Deliberately a transition rather than `useActionState`: the editor should
   * close only once the save has actually succeeded, and closing it from an
   * effect that watches the result is both a lint error and a race — the
   * panel would shut on a stale success the next time it was opened.
   */
  function savePlacement(formData: FormData) {
    startPlace(async () => {
      const result = await setMemberPlacement(initial, formData);
      if (result.error) {
        setPlaceError(result.error);
        return;
      }
      setPlaceError(null);
      setEditingPlace(false);
      router.refresh();
    });
  }

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
      <td className="py-3 pr-4 align-top">
        {editingPlace ? (
          <form action={savePlacement} className="flex w-64 flex-col gap-2.5">
            <input type="hidden" name="membership_id" value={member.membership_id} />
            <PlacementPicker options={placementOptions} value={member.placement} disabled={placePending} compact />
            {placeError && <p className="text-xs text-critical">{placeError}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" busy={placePending}>
                {placePending ? "Saving" : "Save"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPlaceError(null);
                  setEditingPlace(false);
                }}
                className="text-xs font-semibold text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditingPlace(true)}
            className="text-left text-sm text-ink-soft hover:text-brand hover:underline"
          >
            {placementLabel(member.placement, placementOptions)}
          </button>
        )}
      </td>
      <td className="py-3 text-right align-top">
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
