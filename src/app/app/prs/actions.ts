"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { modelAvailable, suggestPRDetails, type PRSuggestion } from "@/lib/ai/suggest";
import type { PRItem, Priority } from "@/lib/database.types";

export interface PRFormState {
  error: string | null;
  ok: string | null;
}

export interface SimilarPR {
  pr_id: string;
  case_id: string;
  case_number: string;
  title: string;
  status: string;
  similarity: number;
  created_at: string;
}

export interface DuplicateCheckState {
  error: string | null;
  matches: SimilarPR[] | null;
}

export interface SuggestState {
  error: string | null;
  suggestion: PRSuggestion | null;
}

function parseItems(form: FormData): PRItem[] {
  const descriptions = form.getAll("item_description") as string[];
  const qtys = form.getAll("item_qty") as string[];
  const units = form.getAll("item_unit") as string[];
  const costs = form.getAll("item_cost") as string[];
  const items: PRItem[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = (descriptions[i] ?? "").trim();
    const qty = Number(qtys[i] ?? 0);
    if (!description || !Number.isFinite(qty) || qty <= 0) continue;
    items.push({
      description,
      qty,
      unit: (units[i] ?? "").trim() || "unit",
      estimated_unit_cost_cents: Math.round(Math.max(0, Number(costs[i] ?? 0)) * 100),
    });
  }
  return items;
}

export async function createPR(_prev: PRFormState, form: FormData): Promise<PRFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return { error: "You don't have permission to create requests.", ok: null };
  }

  const title = String(form.get("title") ?? "").trim();
  const justification = String(form.get("justification") ?? "").trim() || null;
  const categoryId = String(form.get("category_id") ?? "") || null;
  const clientId = String(form.get("client_id") ?? "") || null;
  const requiredBy = String(form.get("required_by") ?? "") || null;
  const priority = (String(form.get("priority") ?? "normal") as Priority) || "normal";
  const items = parseItems(form);
  if (!title) return { error: "Give the request a title.", ok: null };

  const estimatedCostCents = items.reduce((sum, i) => sum + i.qty * i.estimated_unit_cost_cents, 0);

  const supabase = await createClient();
  const { data: caseNumber, error: numberError } = await supabase.rpc("edospmis_next_case_number", {
    p_tenant_id: session.tenant.id,
  });
  if (numberError || !caseNumber) {
    return { error: "Couldn't generate a case number. Try again.", ok: null };
  }

  const { data: newCase, error: caseError } = await supabase
    .from("edospmis_cases")
    .insert({
      tenant_id: session.tenant.id,
      case_number: caseNumber,
      client_id: clientId,
      priority,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (caseError || !newCase) {
    return { error: "Couldn't open a case for this request. Try again.", ok: null };
  }

  const { error: prError } = await supabase.from("edospmis_prs").insert({
    tenant_id: session.tenant.id,
    case_id: newCase.id,
    requester_id: session.user.id,
    category_id: categoryId,
    client_id: clientId,
    title,
    justification,
    items,
    estimated_cost_cents: estimatedCostCents,
    required_by: requiredBy,
    priority,
  });
  if (prError) {
    return { error: "Couldn't save the request. Try again.", ok: null };
  }

  redirect(`/app/cases/${newCase.id}`);
}

export async function findSimilarPRs(_prev: DuplicateCheckState, form: FormData): Promise<DuplicateCheckState> {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return { error: "You don't have permission to create requests.", matches: null };
  }
  const title = String(form.get("title") ?? "").trim();
  if (title.length < 3) return { error: "Type a few more characters of the title first.", matches: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edospmis_find_similar_prs", {
    p_tenant_id: session.tenant.id,
    p_title: title,
    p_exclude_pr_id: null,
  });
  if (error) return { error: "Couldn't check for similar requests right now.", matches: null };
  return { error: null, matches: (data as SimilarPR[]) ?? [] };
}

export async function suggestPRFromText(_prev: SuggestState, form: FormData): Promise<SuggestState> {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return { error: "You don't have permission to create requests.", suggestion: null };
  }
  if (!modelAvailable()) {
    return { error: "AI suggestions aren't configured for this workspace yet.", suggestion: null };
  }
  const text = String(form.get("free_text") ?? "").trim();
  if (!text) return { error: "Describe what you need first.", suggestion: null };

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("edospmis_categories")
    .select("name")
    .eq("tenant_id", session.tenant.id)
    .eq("is_active", true);

  try {
    const suggestion = await suggestPRDetails(text, (categories ?? []).map((c) => c.name));
    return { error: null, suggestion };
  } catch {
    return { error: "Couldn't get a suggestion right now — fill it in yourself.", suggestion: null };
  }
}

export async function submitPR(caseId: string, prId: string): Promise<PRFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_submit_pr", { p_pr_id: prId });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  revalidatePath("/app/prs");
  revalidatePath("/app/home");
  return { error: null, ok: "Request submitted." };
}
