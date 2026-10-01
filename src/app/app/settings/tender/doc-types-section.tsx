"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import {
  addDocType,
  setDocTypeActive,
  type TenderSettingsState,
} from "./actions";
import type { SupplierDocType } from "@/lib/tender-types";

const initial: TenderSettingsState = { error: null, ok: null };

/**
 * The documents a tenant can require of a bidder.
 *
 * The shared library — CR12, KRA PIN, Tax Compliance and the rest — is shown
 * but not editable: it belongs to every workspace, so one tenant withdrawing
 * a row would withdraw it for all of them. A tenant adds its own instead, and
 * simply does not tick the ones it has no use for.
 */
export function DocTypesSection({
  docTypes,
  canEdit,
}: {
  docTypes: SupplierDocType[];
  tenantId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addDocType, initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggle(doc: SupplierDocType) {
    setBusyId(doc.id);
    start(async () => {
      await setDocTypeActive(doc.id, !doc.is_active);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
            <th className="pb-2 pr-4 font-medium">Document</th>
            <th className="pb-2 pr-4 font-medium">Pre-ticked</th>
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {docTypes.map((doc) => (
            <tr key={doc.id} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-4">
                <p
                  className={
                    doc.is_active ? "text-ink" : "text-ink-faint line-through"
                  }
                >
                  {doc.name}
                </p>
                {doc.description && (
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {doc.description}
                  </p>
                )}
              </td>
              <td className="py-2 pr-4">
                {doc.default_required ? (
                  <Badge tone="brand">by default</Badge>
                ) : (
                  <span className="text-xs text-ink-faint">on request</span>
                )}
              </td>
              <td className="py-2 pr-4 text-xs text-ink-faint">
                {doc.tenant_id === null ? "standard" : "yours"}
              </td>
              <td className="py-2 text-right">
                {doc.tenant_id !== null && canEdit && (
                  <button
                    type="button"
                    onClick={() => toggle(doc)}
                    disabled={busyId === doc.id}
                    className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                  >
                    {busyId === doc.id
                      ? "Saving…"
                      : doc.is_active
                        ? "Withdraw"
                        : "Restore"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <form
          action={action}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunk p-3"
        >
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <TextInput
                label="Document name"
                name="name"
                required
                placeholder="e.g. NEMA licence"
              />
            </div>
            <div className="sm:col-span-6">
              <TextInput
                label="What it is"
                name="description"
                placeholder="Shown to the bidder, so they send the right thing"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-xs text-ink-soft sm:col-span-2">
              <input
                type="checkbox"
                name="default_required"
                className="h-4 w-4"
              />
              Pre-tick it
            </label>
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-critical">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" className="text-sm text-good">
              {state.ok}
            </p>
          )}

          <div>
            <Button type="submit" busy={pending}>
              <Plus className="mr-1.5 h-4 w-4" />
              {pending ? "Saving" : "Add document type"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
