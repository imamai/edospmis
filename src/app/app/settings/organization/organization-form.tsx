"use client";

import { useActionState } from "react";
import { updateOrganization, type OrganizationFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput, TextArea, CheckboxRow } from "@/components/ui/field";
import type { Tenant } from "@/lib/database.types";

const initial: OrganizationFormState = { error: null, ok: null };

export function OrganizationForm({ tenant }: { tenant: Tenant }) {
  const [state, action, pending] = useActionState(updateOrganization, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Workspace name" name="name" required defaultValue={tenant.name} />
        <TextInput
          label="PR numbering format"
          name="numbering_format"
          required
          defaultValue={tenant.numbering_format}
          hint="Tokens: {year} and {seq}"
        />
      </div>

      <CheckboxRow
        label="Purchase orders require approval before they're issued"
        description="When off, a PO is issued immediately once a supplier is awarded."
        name="requires_po_approval"
        defaultChecked={tenant.requires_po_approval}
      />

      <div>
        <h3 className="text-sm font-semibold text-ink">Branding</h3>
        <p className="mt-0.5 text-xs text-ink-faint">Printed on generated POs, invoices and contracts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Logo URL" name="logo_url" defaultValue={tenant.branding.logo_url ?? ""} placeholder="https://…" />
        <TextInput label="Registration number" name="registration_number" defaultValue={tenant.branding.registration_number ?? ""} />
        <TextInput label="Phone" name="phone" defaultValue={tenant.branding.phone ?? ""} />
        <TextInput label="Email" name="email" type="email" defaultValue={tenant.branding.email ?? ""} />
      </div>
      <TextArea label="Address" name="address" rows={2} defaultValue={tenant.branding.address ?? ""} />

      <div className="flex items-center gap-3">
        <Button type="submit" busy={pending}>
          Save changes
        </Button>
        {state.error && <p className="text-xs text-critical">{state.error}</p>}
        {state.ok && <p className="text-xs text-good">{state.ok}</p>}
      </div>
    </form>
  );
}
