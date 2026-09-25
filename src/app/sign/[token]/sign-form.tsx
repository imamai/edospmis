"use client";

import { useActionState, useState } from "react";
import { submitSignature, declineSignature, type SignFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { CheckboxRow, TextInput } from "@/components/ui/field";

const initial: SignFormState = { error: null };

export function SignForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action, pending] = useActionState(submitSignature.bind(null, token), initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextInput label="Your full name" name="signed_name" defaultValue={defaultName} required autoFocus />
      <TextInput label="Title / position" name="signed_title" hint="Optional — e.g. Managing Director" />
      <CheckboxRow
        name="consented"
        label="I agree to sign this document electronically"
        description="This constitutes your legal signature on this contract, recorded with your name, the time, and your IP address."
      />
      {state.error && (
        <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Signing" : "Sign & submit"}
        </Button>
      </div>
    </form>
  );
}

export function DeclineControl({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(declineSignature.bind(null, token), initial);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-ink-faint hover:text-critical">
        I can&rsquo;t sign this
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <TextInput label="Reason (optional)" name="reason" placeholder="Let them know why" />
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="danger" size="sm" busy={pending}>
          Decline to sign
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
