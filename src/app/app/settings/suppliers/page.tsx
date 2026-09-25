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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
        <p className="mt-1 text-sm text-ink-faint">Who gets invited to quote on an RFQ.</p>
      </div>

      <Card>
        <CardHeader title="Add a supplier" icon={<Truck className="h-4 w-4" />} />
        <CardBody>
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
