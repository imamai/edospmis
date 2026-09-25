"use server";

import { revalidatePath } from "next/cache";
import { can, requireSession } from "@/lib/data/session";
import { deleteConversation, saveExchange } from "@/lib/data/assistant";
import { createToolContext } from "@/lib/ai/tools";
import { answerWithModel, modelAvailable, type Answer } from "@/lib/ai/llm";

export type AskResult = { ok: true; answer: Answer; conversationId: string | null } | { ok: false; error: string };

export async function askAssistant(
  question: string,
  conversationId: string | null,
  history: { role: "user" | "assistant"; body: string }[] = [],
): Promise<AskResult> {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return { ok: false, error: "Your account cannot use edos.ai here. Ask a workspace admin to grant the Reports permission." };
  }

  const q = question.trim();
  if (!q) return { ok: false, error: "Type a question first." };
  if (q.length > 500) return { ok: false, error: "That question is too long — keep it under 500 characters." };

  if (!modelAvailable()) {
    return {
      ok: false,
      error: "edos.ai needs an ANTHROPIC_API_KEY configured for this workspace to answer questions. In the meantime, the Reports screen covers the same data.",
    };
  }

  const earlier = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.body === "string")
    .slice(-8)
    .map((m) => ({ role: m.role, body: m.body.slice(0, 2000) }));

  const ctx = createToolContext(
    session.tenant.id,
    session.user.id,
    session.roles.map((r) => r.id),
  );

  let answer: Answer;
  try {
    answer = await answerWithModel(q, earlier, ctx, session.tenant.name);
  } catch (cause) {
    console.error("edospmis: edos.ai request failed", cause);
    return { ok: false, error: "edos.ai couldn't answer that just now — try again in a moment." };
  }

  const id = await saveExchange({
    tenantId: session.tenant.id,
    userId: session.user.id,
    conversationId,
    question: q,
    answer,
  });

  if (id) revalidatePath("/app/assistant");
  return { ok: true, answer, conversationId: id };
}

export async function removeConversation(id: string): Promise<void> {
  const session = await requireSession();
  await deleteConversation(session.user.id, id);
  revalidatePath("/app/assistant");
}
