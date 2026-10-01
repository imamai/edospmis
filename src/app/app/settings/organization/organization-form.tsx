"use client";

import { useActionState, useState } from "react";
import { updateOrganization, type OrganizationFormState } from "./actions";
import { LogoUpload } from "./logo-upload";
import { Button } from "@/components/ui/button";
import {
  TextInput,
  TextArea,
  CheckboxRow,
  NumberInput,
} from "@/components/ui/field";
import type { Tenant } from "@/lib/database.types";

const initial: OrganizationFormState = { error: null, ok: null };

export function OrganizationForm({ tenant }: { tenant: Tenant }) {
  const [state, action, pending] = useActionState(updateOrganization, initial);
  const [accentColor, setAccentColor] = useState(
    tenant.branding.accent_color ?? "#1d3557",
  );
  // Only so the rate field can appear and disappear with the tick. The value
  // that gets saved is still read from the form, not from here.
  const [vatEnabled, setVatEnabled] = useState(tenant.vat_enabled);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Workspace name"
          name="name"
          required
          defaultValue={tenant.name}
        />
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

      <CheckboxRow
        label="Charge VAT on invoices"
        description="Turn off if this organisation is below the VAT registration threshold — a tax box pre-filled with a rate would then be wrong, not just unhelpful."
        name="vat_enabled"
        defaultChecked={tenant.vat_enabled}
        onChange={(e) => setVatEnabled(e.target.checked)}
      />

      {vatEnabled && (
        <div className="max-w-xs">
          <NumberInput
            label="VAT rate"
            name="vat_rate"
            min={0}
            max={100}
            decimals
            defaultValue={tenant.vat_rate}
            unit="%"
            hint="Pre-fills the tax on a new invoice. It never changes one already submitted."
          />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink">Branding</h3>
        <p className="mt-0.5 text-xs text-ink-faint">
          Printed on generated POs, invoices and contracts.
        </p>
      </div>

      <LogoUpload
        tenantId={tenant.id}
        currentUrl={tenant.branding.logo_url ?? null}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="accent_color" className="text-sm font-medium text-ink">
          Accent color
        </label>
        <div className="flex items-center gap-2">
          <input
            id="accent_color"
            type="color"
            name="accent_color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-md border border-line bg-surface p-1"
          />
          <span className="tnum text-sm text-ink-faint">{accentColor}</span>
        </div>
        <p className="text-xs text-ink-faint">
          Tints buttons and links across the app. The sidebar stays
          EDOSPMIS&rsquo;s navy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Registration number"
          name="registration_number"
          defaultValue={tenant.branding.registration_number ?? ""}
        />
        <TextInput
          label="Phone"
          name="phone"
          defaultValue={tenant.branding.phone ?? ""}
        />
        <TextInput
          label="Email"
          name="email"
          type="email"
          defaultValue={tenant.branding.email ?? ""}
        />
      </div>
      <TextArea
        label="Address"
        name="address"
        rows={2}
        defaultValue={tenant.branding.address ?? ""}
      />

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
