import "server-only";

/**
 * PR classification + spec/document extraction (PRD FR-39, Phase 8).
 *
 * A single forced-tool-call to the same Anthropic Messages API edos.ai's
 * tool loop uses (see ./llm.ts) — but this is a one-shot structuring task,
 * not a multi-round query loop, so it skips TOOLS/runTool entirely. Forcing
 * `tool_choice` to this one tool is what makes the reply reliably parse as
 * JSON, instead of asking the model to emit JSON as prose and hoping.
 *
 * Recommend-only, same as everywhere else in this phase: the caller shows
 * this as a suggestion the requester applies field-by-field, never a write
 * of its own — nothing here touches the database.
 */

const API = () => `${(process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;
const MODEL = () => process.env.ASSISTANT_MODEL?.trim() || "claude-sonnet-5";

export function modelAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export interface PRSuggestion {
  category_name: string | null;
  priority: "low" | "normal" | "high" | "urgent" | null;
  items: { description: string; qty: number; unit: string }[];
  reasoning: string;
}

const EXTRACT_TOOL = {
  name: "extract_pr_details",
  description: "Return the structured request details found in the text, for a human to review before saving.",
  input_schema: {
    type: "object" as const,
    properties: {
      category_name: {
        type: ["string", "null"],
        description: "The single best-matching category name from the provided list, exactly as given — or null if none fits.",
      },
      priority: {
        type: ["string", "null"],
        enum: ["low", "normal", "high", "urgent", null],
        description: "Only 'high' or 'urgent' if the text itself signals urgency (a deadline, 'ASAP', a stated risk) — default to null otherwise.",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            qty: { type: "number" },
            unit: { type: "string" },
          },
          required: ["description"],
        },
        description: "Only line items actually stated or clearly implied by the text — never invent products, quantities or costs that aren't there.",
      },
      reasoning: {
        type: "string",
        description: "One short sentence explaining the category/priority choice, shown to the requester.",
      },
    },
    required: ["items", "reasoning"],
  },
};

export async function suggestPRDetails(freeText: string, categoryNames: string[]): Promise<PRSuggestion> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("No model configured.");

  const res = await fetch(API(), {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 800,
      system: [
        "You extract structured procurement-request details from free text a requester typed, for a human to review and edit before saving. You never decide anything yourself and never invent facts not present in the text.",
        `Available categories: ${categoryNames.length ? categoryNames.join(", ") : "(none configured for this workspace)"}. Only suggest one of these exact names, or null.`,
      ].join("\n"),
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_pr_details" },
      messages: [{ role: "user", content: freeText.slice(0, 4000) }],
    }),
  });
  if (!res.ok) throw new Error(`Model request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

  const body = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
  const call = body.content.find((b) => b.type === "tool_use");
  if (!call?.input) throw new Error("The model did not return structured details.");

  const input = call.input;
  const items = Array.isArray(input.items)
    ? (input.items as Record<string, unknown>[])
        .map((i) => ({
          description: String(i.description ?? "").trim(),
          qty: Number(i.qty ?? 1) || 1,
          unit: String(i.unit ?? "unit").trim() || "unit",
        }))
        .filter((i) => i.description)
    : [];

  return {
    category_name: typeof input.category_name === "string" ? input.category_name : null,
    priority: typeof input.priority === "string" ? (input.priority as PRSuggestion["priority"]) : null,
    items,
    reasoning: typeof input.reasoning === "string" ? input.reasoning : "",
  };
}
