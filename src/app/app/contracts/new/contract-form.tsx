"use client";

import { useActionState, useState } from "react";
import { createContract, type ContractFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { CheckboxRow, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import type { Client, ContractTemplate } from "@/lib/database.types";

const initial: ContractFormState = { error: null, ok: null };

const CONTRACT_TYPES = [
  { value: "service_agreement", label: "Service agreement" },
  { value: "retainer", label: "Retainer" },
  { value: "nda", label: "Non-disclosure agreement" },
  { value: "framework_agreement", label: "Framework agreement" },
  { value: "other", label: "Other" },
];

export function ContractForm({ clients, templates, companyName }: { clients: Client[]; templates: ContractTemplate[]; companyName: string }) {
  const [state, action, pending] = useActionState(createContract, initial);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState("service_agreement");
  const [body, setBody] = useState("");

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const resolved = template.body_template
      .replaceAll("{{company.name}}", companyName)
      .replaceAll("{{year}}", String(new Date().getFullYear()));
    setBody(resolved);
    setContractType(template.contract_type);
    if (!title) setTitle(template.name);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {templates.length > 0 && (
        <SelectInput label="Start from a template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} hint="Optional — fills in the fields below, which you can still edit">
          <option value="">Blank draft</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
      )}
      <input type="hidden" name="template_id" value={templateId} />

      <TextInput
        label="Title"
        name="title"
        required
        placeholder="e.g. Service Agreement — Acme Ltd"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Type" name="contract_type" value={contractType} onChange={(e) => setContractType(e.target.value)}>
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

      <TextArea
        label="Contract text"
        name="body"
        rows={14}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        hint="Fill in any blanks left by the template — you can keep editing while it's still a draft"
      />

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
