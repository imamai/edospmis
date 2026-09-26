import { Landmark } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getBusinessUnits } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BusinessUnitForm } from "./business-unit-form";
import { BusinessUnitRow } from "./business-unit-row";

export default async function BusinessUnitsPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage business units in this workspace.
      </div>
    );
  }

  const businessUnits = await getBusinessUnits(session.tenant.id, true);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Business Units</h1>
        <p className="mt-1 text-sm text-ink-faint">
          The top level of your organization&rsquo;s structure — branches, departments and teams can all be
          filed under one.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a business unit" icon={<Landmark className="h-4 w-4" />} />
        <CardBody className="max-w-2xl">
          <BusinessUnitForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Business units (${businessUnits.length})`} />
        <CardBody className="overflow-x-auto">
          {businessUnits.length === 0 ? (
            <p className="text-sm text-ink-faint">No business units yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {businessUnits.map((b) => (
                  <BusinessUnitRow key={b.id} businessUnit={b} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
