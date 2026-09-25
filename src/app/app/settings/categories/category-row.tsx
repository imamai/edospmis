"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCategoryActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@/lib/database.types";

export function CategoryRow({ category }: { category: Category }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await setCategoryActive(category.id, !category.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{category.name}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={category.is_active ? "good" : "neutral"}>{category.is_active ? "active" : "archived"}</Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {category.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
