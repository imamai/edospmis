"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { Team, Department } from "@/lib/database.types";

export function TeamRow({ team, departments }: { team: Team; departments: Department[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const departmentName = departments.find((d) => d.id === team.department_id)?.name ?? "—";

  function toggle() {
    start(async () => {
      await setTeamActive(team.id, !team.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{team.name}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{departmentName}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={team.is_active ? "good" : "neutral"}>{team.is_active ? "active" : "archived"}</Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {team.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
