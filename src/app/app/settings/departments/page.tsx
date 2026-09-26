import { Building } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getDepartments, getBranches, getBusinessUnits } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DepartmentForm } from "./department-form";
import { DepartmentRow } from "./department-row";

export default async function DepartmentsPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage departments in this workspace.
      </div>
    );
  }

  const [departments, branches, businessUnits] = await Promise.all([
    getDepartments(session.tenant.id, true),
    getBranches(session.tenant.id),
    getBusinessUnits(session.tenant.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Departments</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What a request or team gets filed under — optionally tied to a branch and/or a business unit.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a department" icon={<Building className="h-4 w-4" />} />
        <CardBody className="max-w-3xl">
          <DepartmentForm branches={branches} businessUnits={businessUnits} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Departments (${departments.length})`} />
        <CardBody className="overflow-x-auto">
          {departments.length === 0 ? (
            <p className="text-sm text-ink-faint">No departments yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Branch</th>
                  <th className="pb-2 pr-4 font-medium">Business unit</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <DepartmentRow key={d.id} department={d} branches={branches} businessUnits={businessUnits} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
