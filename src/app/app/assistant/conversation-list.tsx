"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { removeConversation } from "./actions";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/data/assistant";

export function ConversationList({ conversations, activeId }: { conversations: Conversation[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove(id: string) {
    start(async () => {
      await removeConversation(id);
      if (id === activeId) router.push("/app/assistant");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/app/assistant"
        className="mb-1 flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
      >
        <Plus className="h-3.5 w-3.5" />
        New conversation
      </Link>
      {conversations.map((c) => (
        <div
          key={c.id}
          className={cn(
            "group flex items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm",
            c.id === activeId ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-surface-sunk hover:text-ink",
          )}
        >
          <Link href={`/app/assistant?c=${c.id}`} className="min-w-0 flex-1 truncate">
            {c.title}
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => remove(c.id)}
            aria-label="Delete conversation"
            className="shrink-0 rounded p-1 text-ink-faint opacity-0 group-hover:opacity-100 hover:text-critical disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
