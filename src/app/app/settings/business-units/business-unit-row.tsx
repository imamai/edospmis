"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBusinessUnitActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { BusinessUnit } from "@/lib/database.types";

export function BusinessUnitRow({ businessUnit }: { businessUnit: BusinessUnit }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await setBusinessUnitActive(businessUnit.id, !businessUnit.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{businessUnit.name}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{businessUnit.code ?? "—"}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={businessUnit.is_active ? "good" : "neutral"}>
          {businessUnit.is_active ? "active" : "archived"}
        </Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {businessUnit.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
