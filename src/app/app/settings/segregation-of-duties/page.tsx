import { requireSession, can } from "@/lib/data/session";
import { getSodSettings } from "@/lib/data/finance";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SodForm } from "./sod-form";

export default async function SegregationOfDutiesPage() {
  const session = await requireSession();
  if (!can(session, "admin.approvals.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage these settings in this workspace.
      </div>
    );
  }

  const settings = await getSodSettings(session.tenant.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 lg:max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Segregation of duties</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Off by default. Turn a rule on once your team is big enough that the same person shouldn&rsquo;t play both roles.
        </p>
      </div>

      <Card>
        <CardHeader title="Conflict rules" />
        <CardBody>
          <SodForm settings={settings} />
        </CardBody>
      </Card>
    </div>
  );
}
