"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteQueue } from "./actions";
import type { Queue } from "@/lib/database.types";

export function QueueRow({ queue }: { queue: Queue }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(`Delete the "${queue.name}" queue? This can't be undone.`)) return;
    start(async () => {
      await deleteQueue(queue.id);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 text-sm font-medium text-ink">{queue.name}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{queue.stage_key}</td>
      <td className="py-2.5 pr-4 text-sm text-ink-faint">{queue.assignment_strategy}</td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-critical disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
