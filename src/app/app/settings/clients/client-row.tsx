"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import type { Client } from "@/lib/database.types";

export function ClientRow({ client }: { client: Client }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await setClientActive(client.id, !client.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4">
        <p className="text-sm font-medium text-ink">{client.name}</p>
        {client.email && <p className="text-xs text-ink-faint">{client.email}</p>}
      </td>
      <td className="py-2.5 pr-4 text-sm text-ink-soft">{client.phone ?? "—"}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={client.is_active ? "good" : "neutral"}>{client.is_active ? "active" : "archived"}</Badge>
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
        >
          {client.is_active ? "Archive" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
