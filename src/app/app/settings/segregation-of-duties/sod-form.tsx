"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setSodSettings, type FinanceState } from "../../finance/actions";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/field";
import type { SodSettings } from "@/lib/database.types";

const initial: FinanceState = { error: null, ok: null };

export function SodForm({ settings }: { settings: SodSettings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setSodSettings, initial);
  const [prRule, setPrRule] = useState(settings.pr_requester_not_approver);
  const [receiverRule, setReceiverRule] = useState(settings.receiver_not_payment_approver);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <CheckboxRow
        label="A PR's requester cannot approve their own request"
        description="Blocks the decision at the point of action, even if they happen to hold an approving role too."
        name="pr_requester_not_approver"
        checked={prRule}
        onChange={(e) => setPrRule(e.target.checked)}
      />
      <CheckboxRow
        label="Whoever received the goods cannot approve payment for them"
        description="Blocks approving an invoice for payment if you also recorded the goods-received note for that case."
        name="receiver_not_payment_approver"
        checked={receiverRule}
        onChange={(e) => setReceiverRule(e.target.checked)}
      />
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      <div>
        <Button type="submit" size="sm" busy={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
