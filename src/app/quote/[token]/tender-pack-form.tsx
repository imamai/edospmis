"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/field";
import {
  saveBidTemplate,
  uploadBidDocument,
  uploadBidTemplateFile,
} from "./tender-actions";
import type { BidPack, RfqRequirement } from "@/lib/tender-types";

/**
 * What the bidder has to return, on the page they already have a link to.
 *
 * Deliberately one page. A bidder sent three links misses one, and the one
 * they miss is always discovered after the closing date — so the documents,
 * the form of tender and the prices are all here, under one signature.
 *
 * Uploads here save as they go, into a draft the bidder can leave and come
 * back to. Nothing reaches the buyer until the single submit at the foot of
 * the page, which lives with the prices in `QuoteForm` — it used to live here
 * as a second button, and a page with two submits had no safe order to press
 * them in: one way locked the bidder out of their own documents, the other
 * signed a price that was not yet there.
 */
export function TenderPackForm({
  token,
  pack,
}: {
  token: string;
  pack: BidPack;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const documents = pack.requirements.filter((r) => r.kind === "document");
  const templates = pack.requirements.filter((r) => r.kind === "template");

  function run(fn: () => Promise<{ error: string | null; ok: string | null }>) {
    setNotice(null);
    start(async () => {
      const result = await fn();
      setNotice(
        result.error
          ? { tone: "error", text: result.error }
          : { tone: "ok", text: result.ok ?? "Saved." },
      );
      if (!result.error) router.refresh();
    });
  }

  if (pack.requirements.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">
          What you need to return
        </h2>
        <p className="mt-0.5 text-xs text-ink-faint">
          These save as you go. Nothing is sent until you sign and submit at the
          foot of this page, so you can come back to this link and finish later.
        </p>
      </div>

      {documents.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Documents
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {documents.map((req) => (
              <DocumentRow
                key={req.requirement_id}
                req={req}
                supplied={
                  pack.documents.find(
                    (d) => d.doc_type_id === req.doc_type_id,
                  ) ?? null
                }
                token={token}
                disabled={pending}
                onRun={run}
              />
            ))}
          </ul>
        </section>
      )}

      {templates.map((req) => (
        <TemplateSection
          key={req.requirement_id}
          req={req}
          token={token}
          answered={
            pack.template_responses.find(
              (t) => t.template_id === req.template_id,
            ) ?? null
          }
          disabled={pending}
          onRun={run}
        />
      ))}

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good"
              : "rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
          }
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

function DocumentRow({
  req,
  supplied,
  token,
  disabled,
  onRun,
}: {
  req: RfqRequirement;
  supplied: BidPack["documents"][number] | null;
  token: string;
  disabled: boolean;
  onRun: (
    fn: () => Promise<{ error: string | null; ok: string | null }>,
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-ink">
          {supplied && (
            <Check
              className="h-3.5 w-3.5 shrink-0 text-good"
              aria-hidden="true"
            />
          )}
          {req.name}
          {!req.is_mandatory && (
            <span className="text-xs text-ink-faint">(optional)</span>
          )}
        </p>
        {req.description && (
          <p className="text-xs text-ink-faint">{req.description}</p>
        )}
        {supplied && (
          <p className="mt-0.5 text-xs text-good">{supplied.filename}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        id={`doc-${req.requirement_id}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          form.set("doc_type_id", req.doc_type_id ?? "");
          onRun(() => uploadBidDocument(token, form));
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {supplied ? "Replace" : "Upload"}
      </Button>
    </li>
  );
}

function TemplateSection({
  req,
  token,
  answered,
  disabled,
  onRun,
}: {
  req: RfqRequirement;
  token: string;
  answered: BidPack["template_responses"][number] | null;
  disabled: boolean;
  onRun: (
    fn: () => Promise<{ error: string | null; ok: string | null }>,
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(
    answered?.answers ?? {},
  );

  const fields = req.template_fields ?? [];

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {answered && (
            <Check className="h-3.5 w-3.5 text-good" aria-hidden="true" />
          )}
          {req.name}
          {!req.is_mandatory && (
            <span className="text-xs font-normal text-ink-faint">
              (optional)
            </span>
          )}
        </p>
        {req.template_instructions && (
          <p className="mt-0.5 text-xs text-ink-faint">
            {req.template_instructions}
          </p>
        )}
      </div>

      {req.template_kind === "form" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) =>
              field.type === "textarea" ? (
                <div key={field.key} className="sm:col-span-2">
                  <TextArea
                    label={field.label}
                    name={field.key}
                    rows={2}
                    hint={field.help}
                    value={answers[field.key] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [field.key]: e.target.value }))
                    }
                  />
                </div>
              ) : (
                <TextInput
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  type={
                    field.type === "number"
                      ? "number"
                      : field.type === "date"
                        ? "date"
                        : "text"
                  }
                  hint={field.help}
                  value={answers[field.key] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [field.key]: e.target.value }))
                  }
                />
              ),
            )}
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onRun(() => saveBidTemplate(token, req.template_id!, answers))
              }
            >
              {answered ? "Save changes" : "Save answers"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* The issued file is downloaded from the buyer's own page — a bidder
              only ever returns the completed copy here. */}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            id={`tpl-${req.requirement_id}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set("file", file);
              form.set("template_id", req.template_id ?? "");
              onRun(() => uploadBidTemplateFile(token, form));
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {answered
              ? "Replace the completed copy"
              : "Upload the completed, signed copy"}
          </Button>
          {answered?.filename && (
            <span className="text-xs text-good">{answered.filename}</span>
          )}
        </div>
      )}
    </section>
  );
}
