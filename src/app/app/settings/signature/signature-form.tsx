"use client";

import { useState, useTransition } from "react";
import { updateMySignature } from "./actions";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/ui/signature-pad";

export function SignatureForm({ savedSignature }: { savedSignature: string | null }) {
  const [current, setCurrent] = useState(savedSignature);
  const [pending, saved] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(!savedSignature);

  function save() {
    saved(async () => {
      const result = await updateMySignature(draft);
      setMsg(result.error ?? result.ok);
      if (!result.error) {
        setCurrent(draft);
        setEditing(false);
      }
    });
  }

  function remove() {
    saved(async () => {
      const result = await updateMySignature(null);
      setMsg(result.error ?? result.ok);
      if (!result.error) {
        setCurrent(null);
        setDraft(null);
        setEditing(true);
      }
    });
  }

  if (!editing && current) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex h-[110px] w-full max-w-md items-center rounded-lg border border-line bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Change signature
          </Button>
          <button type="button" onClick={remove} className="text-sm font-semibold text-ink-faint hover:text-critical">
            Remove
          </button>
        </div>
        {msg && <p className="text-xs text-ink-faint">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <SignaturePad onChange={setDraft} />
      <div className="flex items-center gap-2">
        <Button size="sm" busy={pending} disabled={!draft} onClick={save}>
          Save signature
        </Button>
        {current && (
          <button type="button" onClick={() => setEditing(false)} className="text-sm font-semibold text-ink-faint hover:text-ink">
            Cancel
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-ink-faint">{msg}</p>}
    </div>
  );
}
