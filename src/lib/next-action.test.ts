import { describe, it, expect } from "vitest";
import { computeNextAction, type NextActionInput } from "./next-action";

/**
 * The chain these cover is PO -> receipt -> invoice -> payment. The two new
 * rules are the joins that were missing: nothing ever said an invoice was
 * due once goods were in, and nothing said an invoice had arrived before
 * anything was received.
 */
const noSla = () => null;

function po(overrides: Record<string, unknown> = {}) {
  return {
    po: {
      po_number: "PO-2026-000008",
      status: "issued",
      items: [{ qty: 10 }],
      ...overrides,
    },
  } as unknown as NextActionInput["procurementDetail"];
}

function grns(received: number[]) {
  return {
    grns: received.map((qty, i) => ({ grn_number: `GRN-0${i + 1}`, items: [{ received_qty: qty }] })),
    delivery: null,
  } as unknown as NextActionInput["fulfilmentDetail"];
}

function invoice(status: string) {
  return {
    invoice: { invoice_number: "SUP-INV-2208", status, exceptions: [] },
  } as unknown as NextActionInput["financeDetail"];
}

function input(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    permissions: new Set<string>(),
    canDecide: false,
    canSubmit: false,
    caseStatus: "receiving",
    pendingApprovalRoleName: null,
    pendingApprovalDueAt: null,
    procurementDetail: po(),
    fulfilmentDetail: grns([10]),
    financeDetail: null,
    slaStatus: noSla,
    ...over,
  };
}

describe("what a case is waiting for", () => {
  it("asks for the invoice once everything on the order has been received", () => {
    const result = computeNextAction(input({ permissions: new Set(["finance.invoice.create"]) }));
    expect(result?.message).toContain("Everything on PO-2026-000008 has been received");
    expect(result?.tone).toBe("info");
  });

  it("asks for the goods first while the order is short", () => {
    const result = computeNextAction(
      input({ fulfilmentDetail: grns([4]), permissions: new Set(["receiving.grn.create", "finance.invoice.create"]) }),
    );
    expect(result?.message).toBe("Items pending receipt against PO-2026-000008");
  });

  it("says nothing about invoicing to someone who cannot raise one", () => {
    expect(computeNextAction(input())).toBeNull();
  });

  it("does not ask a closed case for an invoice", () => {
    const result = computeNextAction(input({ caseStatus: "closed", permissions: new Set(["finance.invoice.create"]) }));
    expect(result).toBeNull();
  });

  it("flags an invoice raised before anything was received", () => {
    const result = computeNextAction(
      input({ caseStatus: "finance", fulfilmentDetail: grns([]), financeDetail: invoice("exception") }),
    );
    expect(result?.message).toContain("was raised before anything was received");
    expect(result?.tone).toBe("attention");
  });

  it("stops flagging that once the invoice is paid", () => {
    const result = computeNextAction(
      input({ caseStatus: "finance", fulfilmentDetail: grns([]), financeDetail: invoice("paid") }),
    );
    expect(result).toBeNull();
  });

  it("leaves an approved, unpaid invoice as a resting state", () => {
    const result = computeNextAction(
      input({
        caseStatus: "finance",
        financeDetail: invoice("approved"),
        permissions: new Set(["finance.invoice.approve"]),
      }),
    );
    expect(result?.message).toContain("awaiting payment — the case can move on meanwhile");
  });
});
