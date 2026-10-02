"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { updateSupplier, type SupplierFormState } from "./actions";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { TextInput } from "@/components/ui/field";
import type { Supplier } from "@/lib/database.types";

const initial: SupplierFormState = { error: null, ok: null };

/**
 * Correcting a supplier's details in place.
 *
 * Fields are uncontrolled with `defaultValue`, and the dialog is mounted only
 * while open, so reopening it re-reads the current row rather than showing
 * whatever was typed and abandoned last time.
 *
 * No router.refresh() here: `updateSupplier` revalidates both the list and the
 * supplier's own page, which is what re-renders the row behind this dialog.
 */
export function EditSupplierButton({ supplier }: { supplier: Supplier }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateSupplier, initial);

  // A saved edit closes the dialog — derived rather than stored, so the
  // success needs no second render to take effect. Same shape the procurement
  // panel's quotation dialog uses.
  const open = editing && !state.ok;

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>

      {open && (
        <Modal
          open={open}
          onClose={() => setEditing(false)}
          title={`Edit ${supplier.name}`}
          description="Their email address is where tender invitations are sent."
          dismissible={!pending}
        >
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={supplier.id} />
            <TextInput
              label="Name"
              name="name"
              defaultValue={supplier.name}
              required
            />
            <TextInput
              label="Email"
              name="email"
              type="email"
              defaultValue={supplier.email ?? ""}
              hint="Where quotation invitations go. Leave blank if they have none."
            />
            <TextInput
              label="Phone"
              name="phone"
              defaultValue={supplier.phone ?? ""}
              hint="Used for the WhatsApp invite option."
            />
            {state.error && (
              <p className="text-xs text-critical">{state.error}</p>
            )}
            <ModalFormActions
              onCancel={() => setEditing(false)}
              submitLabel="Save changes"
              busy={pending}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
