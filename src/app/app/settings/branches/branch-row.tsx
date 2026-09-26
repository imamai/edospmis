"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { Branch, BusinessUnit } from "@/lib/database.types";

export function BranchRow({ branch, businessUnits }: { branch: Branch; businessUnits: BusinessUnit[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const businessUnitName = businessUnits.find((b) => b.id === branch.business_unit_id)?.name ?? "—";

  function toggle() {
    start(async () => {
      await setBranchActive(branch.id, !branch.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{branch.name}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{branch.code ?? "—"}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{businessUnitName}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={branch.is_active ? "good" : "neutral"}>{branch.is_active ? "active" : "archived"}</Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {branch.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
