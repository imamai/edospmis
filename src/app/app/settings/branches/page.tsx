import { Network } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getBranches, getBusinessUnits } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BranchForm } from "./branch-form";
import { BranchRow } from "./branch-row";

export default async function BranchesPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage branches in this workspace.
      </div>
    );
  }

  const [branches, businessUnits] = await Promise.all([
    getBranches(session.tenant.id, true),
    getBusinessUnits(session.tenant.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Branches</h1>
        <p className="mt-1 text-sm text-ink-faint">Physical or regional sites, optionally grouped under a business unit.</p>
      </div>

      <Card>
        <CardHeader title="Add a branch" icon={<Network className="h-4 w-4" />} />
        <CardBody className="max-w-3xl">
          <BranchForm businessUnits={businessUnits} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Branches (${branches.length})`} />
        <CardBody className="overflow-x-auto">
          {branches.length === 0 ? (
            <p className="text-sm text-ink-faint">No branches yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Business unit</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <BranchRow key={b.id} branch={b} businessUnits={businessUnits} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
