import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Evidence } from "@/lib/ai/llm";

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
  evidence: Evidence[];
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_ai_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_ai_messages")
    .select("id, role, body, evidence, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    body: m.body,
    createdAt: m.created_at,
    evidence: (m.evidence as { evidence?: Evidence[] } | null)?.evidence ?? [],
  }));
}

function titleFor(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed || "New conversation";
}

/** Keeps one exchange, starting a new conversation if none was given. */
export async function saveExchange(input: {
  tenantId: string;
  userId: string;
  conversationId: string | null;
  question: string;
  answer: { body: string; evidence: Evidence[] };
}): Promise<string | null> {
  const supabase = await createClient();
  let id = input.conversationId;

  if (id) {
    const { data: owner } = await supabase.from("edospmis_ai_conversations").select("id").eq("id", id).eq("user_id", input.userId).maybeSingle();
    if (!owner) id = null;
  }

  if (!id) {
    const { data, error } = await supabase
      .from("edospmis_ai_conversations")
      .insert({ tenant_id: input.tenantId, user_id: input.userId, title: titleFor(input.question) })
      .select("id")
      .single();
    if (error || !data) {
      console.error("edospmis: could not start a conversation", error);
      return null;
    }
    id = data.id;
  }

  const { error } = await supabase.from("edospmis_ai_messages").insert([
    { conversation_id: id, tenant_id: input.tenantId, role: "user", body: input.question, evidence: {} },
    { conversation_id: id, tenant_id: input.tenantId, role: "assistant", body: input.answer.body, evidence: { evidence: input.answer.evidence } },
  ]);
  if (error) {
    console.error("edospmis: could not save an assistant exchange", error);
    return null;
  }

  await supabase.from("edospmis_ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return id;
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("edospmis_ai_conversations").delete().eq("id", id).eq("user_id", userId);
}
