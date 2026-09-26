"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDepartmentActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { Department, Branch, BusinessUnit } from "@/lib/database.types";

export function DepartmentRow({
  department,
  branches,
  businessUnits,
}: {
  department: Department;
  branches: Branch[];
  businessUnits: BusinessUnit[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const branchName = branches.find((b) => b.id === department.branch_id)?.name ?? "—";
  const businessUnitName = businessUnits.find((b) => b.id === department.business_unit_id)?.name ?? "—";

  function toggle() {
    start(async () => {
      await setDepartmentActive(department.id, !department.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{department.name}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{department.code ?? "—"}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{branchName}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{businessUnitName}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={department.is_active ? "good" : "neutral"}>
          {department.is_active ? "active" : "archived"}
        </Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {department.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
