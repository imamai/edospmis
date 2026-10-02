import { Truck } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getSuppliers } from "@/lib/data/procurement";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SupplierForm } from "./supplier-form";
import { SupplierRow } from "./supplier-row";

export default async function SuppliersPage() {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage suppliers in this workspace.
      </div>
    );
  }

  const suppliers = await getSuppliers(session.tenant.id, true);
  const pendingApproval = suppliers.filter((s) => !s.is_active).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Who gets invited to quote on an RFQ.
        </p>
        {/* Said here because it is not guessable, and the question it answers
            gets asked: "why are these suppliers inactive?" A supplier who
            quotes through their tender link is created for you, switched off,
            and nothing has ever pointed that out — so suppliers you have since
            issued purchase orders to can still be sitting here unapproved. */}
        {pendingApproval > 0 && (
          <p className="mt-2 rounded-lg border border-attention/25 bg-attention-soft px-3 py-2 text-xs text-attention">
            {pendingApproval === 1
              ? "1 supplier is inactive."
              : `${pendingApproval} suppliers are inactive.`}{" "}
            A supplier who submits a quotation through their own tender link is
            added here automatically and left inactive for you to check first.
            Inactive suppliers don&rsquo;t appear in the list of who to invite
            next, so reactivate the ones you intend to keep buying from.
          </p>
        )}
      </div>

      <Card>
        <CardHeader
          title="Add a supplier"
          icon={<Truck className="h-4 w-4" />}
        />
        <CardBody className="max-w-2xl">
          <SupplierForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Suppliers (${suppliers.length})`} />
        <CardBody className="overflow-x-auto">
          {suppliers.length === 0 ? (
            <p className="text-sm text-ink-faint">No suppliers yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Supplier</th>
                  <th className="pb-2 pr-4 font-medium">Phone</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <SupplierRow key={s.id} supplier={s} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
