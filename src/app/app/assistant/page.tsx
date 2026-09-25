import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { listConversations, loadMessages } from "@/lib/data/assistant";
import { modelAvailable } from "@/lib/ai/llm";
import { AssistantChat } from "./assistant-chat";
import { ConversationList } from "./conversation-list";

export const metadata: Metadata = { title: "edos.ai" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        edos.ai is not switched on for your account. Ask a workspace admin to grant the Reports permission.
      </div>
    );
  }

  const { c: askedId } = await searchParams;
  const conversations = await listConversations(session.user.id);
  const activeId = askedId && conversations.some((c) => c.id === askedId) ? askedId : null;
  const initial = activeId ? await loadMessages(activeId) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:flex-row">
      <div className="lg:w-56 lg:shrink-0">
        <ConversationList conversations={conversations} activeId={activeId} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="mb-3 flex items-center gap-2 text-xl font-semibold text-ink">
          <Sparkles className="h-5 w-5 text-brand" />
          edos.ai
        </h1>
        {!modelAvailable() && (
          <p className="mb-3 rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5 text-sm text-attention">
            No model is configured for this workspace yet, so edos.ai can&rsquo;t answer questions right now — the{" "}
            <Link href="/app/reports" className="underline">
              Reports
            </Link>{" "}
            screen covers the same data in the meantime.
          </p>
        )}
        <AssistantChat key={activeId ?? "new"} conversationId={activeId} initial={initial} tenantName={session.tenant.name} />
      </div>
    </div>
  );
}
