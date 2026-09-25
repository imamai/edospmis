"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeDelegation } from "../../finance/actions";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { DelegationRow as DelegationRowData } from "@/lib/data/delegations";

export function DelegationRow({ delegation, canRevoke }: { delegation: DelegationRowData; canRevoke: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const status = delegation.revoked_at
    ? "revoked"
    : new Date(delegation.ends_at).getTime() < now
      ? "expired"
      : new Date(delegation.starts_at).getTime() > now
        ? "upcoming"
        : "active";

  function revoke() {
    start(async () => {
      const result = await revokeDelegation(delegation.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-ink">
          {delegation.role_name}: {delegation.from_name} → {delegation.to_name}
        </p>
        <p className="text-xs text-ink-faint">
          {formatDate(delegation.starts_at)} – {formatDate(delegation.ends_at)}
        </p>
        {error && <p className="text-xs text-critical">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status === "active" ? "good" : status === "upcoming" ? "info" : "neutral"}>{status}</Badge>
        {canRevoke && status !== "revoked" && status !== "expired" && (
          <button
            type="button"
            disabled={pending}
            onClick={revoke}
            className="text-xs font-semibold text-critical hover:underline disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
