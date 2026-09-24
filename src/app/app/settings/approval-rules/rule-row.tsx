"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApprovalRuleActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import type { ApprovalRule } from "@/lib/database.types";

export function RuleRow({
  rule,
}: {
  rule: ApprovalRule & { steps: { step_order: number; role_id: string; role_name: string }[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    start(async () => {
      const result = await setApprovalRuleActive(rule.id, !rule.is_active);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const range =
    rule.min_amount_cents === null && rule.max_amount_cents === null
      ? "Any amount"
      : `${rule.min_amount_cents !== null ? formatMoney(rule.min_amount_cents) : "0"} – ${
          rule.max_amount_cents !== null ? formatMoney(rule.max_amount_cents) : "no limit"
        }`;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">{rule.name}</p>
          <Badge tone={rule.is_active ? "good" : "neutral"}>{rule.is_active ? "active" : "inactive"}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">{range}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {rule.steps.sort((a, b) => a.step_order - b.step_order).map((s) => s.role_name).join(" → ")}
        </p>
        {error && <p className="mt-1 text-xs text-critical">{error}</p>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="shrink-0 text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
      >
        {rule.is_active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}
