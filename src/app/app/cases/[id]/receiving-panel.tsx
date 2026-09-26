"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PackageCheck } from "lucide-react";
import { recordGrn, recordInspection, type FulfilmentState } from "../../fulfilment/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { formatDate } from "@/lib/utils";
import type { FulfilmentDetail } from "@/lib/data/fulfilment";
import type { PRItem } from "@/lib/database.types";

const initial: FulfilmentState = { error: null, ok: null };
const CONDITION_TONE = {
  accepted: "good",
  over: "good",
  short: "attention",
  damaged: "critical",
  rejected: "critical",
} as const;

interface ItemRow {
  id: number;
  description: string;
  unit: string;
  ordered_qty: number;
}

export function ReceivingPanel({
  caseId,
  poItems,
  detail,
  canRecord,
  canInspect,
  emphasize,
}: {
  caseId: string;
  poItems: PRItem[];
  detail: FulfilmentDetail;
  canRecord: boolean;
  canInspect: boolean;
  emphasize?: boolean;
}) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [inspectingGrn, setInspectingGrn] = useState<string | null>(null);
  const [rows, setRows] = useState<ItemRow[]>(
    poItems.length > 0
      ? poItems.map((i, idx) => ({ id: idx + 1, description: i.description, unit: i.unit, ordered_qty: i.qty }))
      : [{ id: 1, description: "", unit: "", ordered_qty: 0 }],
  );
  let nextId = rows.length + 1;

  const [grnState, setGrnState] = useState<FulfilmentState>(initial);
  const [grnPending, startGrn] = useTransition();
  const [inspectState, setInspectState] = useState<FulfilmentState>(initial);
  const [inspectPending, startInspect] = useTransition();

  function submitGrn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startGrn(async () => {
      const result = await recordGrn(initial, form);
      setGrnState(result);
      if (result.ok) {
        setRecording(false);
        router.refresh();
      }
    });
  }

  function submitInspection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startInspect(async () => {
      const result = await recordInspection(initial, form);
      setInspectState(result);
      if (result.ok) {
        setInspectingGrn(null);
        router.refresh();
      }
    });
  }

  const inspectingGrnRow = detail.grns.find((g) => g.id === inspectingGrn);

  return (
    <Card raised={emphasize}>
      <CardHeader
        title="Receiving"
        subtitle="Goods received against the awarded purchase order"
        icon={emphasize ? <PackageCheck className="h-4 w-4" /> : undefined}
        action={emphasize ? <Badge tone="brand">Current stage</Badge> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {detail.grns.map((grn) => (
          <div key={grn.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{grn.grn_number}</p>
                <p className="text-xs text-ink-faint">Received {formatDate(grn.received_at)}</p>
              </div>
              {grn.inspection ? (
                <Badge
                  tone={grn.inspection.result === "pass" ? "good" : grn.inspection.result === "fail" ? "critical" : "attention"}
                >
                  {grn.inspection.result}
                </Badge>
              ) : (
                <Badge tone="neutral">not inspected</Badge>
              )}
            </div>

            <div className="mt-2 flex flex-col divide-y divide-line">
              {grn.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="text-ink">{item.description}</span>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-xs text-ink-faint">
                      {item.received_qty}/{item.ordered_qty} {item.unit}
                    </span>
                    <Badge tone={CONDITION_TONE[item.condition]}>{item.condition}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {grn.inspection?.comments && (
              <p className="mt-2 text-xs text-ink-soft">&ldquo;{grn.inspection.comments}&rdquo;</p>
            )}

            {canInspect && !grn.inspection && (
              <div className="mt-3 border-t border-line pt-3">
                <Button size="sm" variant="secondary" onClick={() => setInspectingGrn(grn.id)}>
                  Record inspection
                </Button>
              </div>
            )}
          </div>
        ))}

        <Modal
          open={inspectingGrn !== null}
          onClose={() => setInspectingGrn(null)}
          title={`Record inspection${inspectingGrnRow ? ` — ${inspectingGrnRow.grn_number}` : ""}`}
          dismissible={!inspectPending}
        >
          <form onSubmit={submitInspection} className="flex flex-col gap-3">
            <input type="hidden" name="grn_id" value={inspectingGrn ?? ""} />
            <input type="hidden" name="case_id" value={caseId} />
            <SelectInput label="Result" name="result" required>
              <option value="">Choose</option>
              <option value="pass">Pass</option>
              <option value="conditional">Conditional</option>
              <option value="fail">Fail</option>
            </SelectInput>
            <TextArea label="Comments" name="comments" rows={2} hint="Optional" />
            <TextInput label="Evidence reference" name="evidence_ref" hint="Optional — a report number or photo filename" />
            {inspectState.error && <p className="text-xs text-critical">{inspectState.error}</p>}
            <ModalFormActions onCancel={() => setInspectingGrn(null)} submitLabel="Save inspection" busy={inspectPending} />
          </form>
        </Modal>

        {canRecord && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
              Record goods received
            </Button>
            <Modal open={recording} onClose={() => setRecording(false)} title="Record goods received" dismissible={!grnPending} size="lg">
              <form onSubmit={submitGrn} className="flex flex-col gap-3">
                <input type="hidden" name="case_id" value={caseId} />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setRows((r) => [...r, { id: nextId++, description: "", unit: "", ordered_qty: 0 }])}
                    className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </button>
                </div>
                {rows.map((row, i) => (
                  <div key={row.id} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-12 sm:col-span-4">
                      <TextInput label={i === 0 ? "Item" : ""} name="item_description" defaultValue={row.description} placeholder="e.g. Laptop, 14-inch" />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <TextInput label={i === 0 ? "Unit" : ""} name="item_unit" defaultValue={row.unit} placeholder="pcs" />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <NumberInput label={i === 0 ? "Ordered" : ""} name="item_ordered_qty" min={0} decimals defaultValue={row.ordered_qty} />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <NumberInput label={i === 0 ? "Received" : ""} name="item_received_qty" min={0} decimals defaultValue={row.ordered_qty} />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <SelectInput label={i === 0 ? "Condition" : ""} name="item_condition" defaultValue="accepted">
                        <option value="accepted">Accepted</option>
                        <option value="short">Short</option>
                        <option value="over">Over</option>
                        <option value="damaged">Damaged</option>
                        <option value="rejected">Rejected</option>
                      </SelectInput>
                    </div>
                    {rows.length > 1 && (
                      <div className="col-span-12 flex justify-end sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                          aria-label="Remove item"
                          className="rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <TextArea label="Notes" name="notes" rows={2} hint="Optional" />
                {grnState.error && <p className="text-xs text-critical">{grnState.error}</p>}
                <ModalFormActions onCancel={() => setRecording(false)} submitLabel="Save receipt" busy={grnPending} />
              </form>
            </Modal>
          </>
        )}
      </CardBody>
    </Card>
  );
}
