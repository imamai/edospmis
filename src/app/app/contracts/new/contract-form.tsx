"use client";

import { useActionState } from "react";
import { createContract, type ContractFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { CheckboxRow, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import type { Client } from "@/lib/database.types";

const initial: ContractFormState = { error: null, ok: null };

const CONTRACT_TYPES = [
  { value: "service_agreement", label: "Service agreement" },
  { value: "retainer", label: "Retainer" },
  { value: "nda", label: "Non-disclosure agreement" },
  { value: "framework_agreement", label: "Framework agreement" },
  { value: "other", label: "Other" },
];

export function ContractForm({ clients }: { clients: Client[] }) {
  const [state, action, pending] = useActionState(createContract, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextInput label="Title" name="title" required placeholder="e.g. Service Agreement — Acme Ltd" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Type" name="contract_type" defaultValue="service_agreement">
          {CONTRACT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Client" name="client_id" hint="Optional">
          <option value="">Not set</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </div>

      <CheckboxRow
        name="requires_witness"
        label="Requires a witness"
        description="A witness will need to be added and marked as signed before this contract counts as executed."
      />

      <TextArea label="Contract text" name="body" rows={10} hint="Draft it here — you can keep editing while it's still a draft" />

      {state.error && (
        <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Creating" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
