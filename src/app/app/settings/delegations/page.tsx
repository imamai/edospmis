import { requireSession, can } from "@/lib/data/session";
import { getDelegations } from "@/lib/data/delegations";
import { getRoles, getMembers } from "@/lib/data/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DelegationForm } from "./delegation-form";
import { DelegationRow } from "./delegation-row";

export default async function DelegationsPage() {
  const session = await requireSession();
  if (!can(session, "admin.approvals.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage delegations in this workspace.
      </div>
    );
  }

  const [delegations, roles, members] = await Promise.all([
    getDelegations(session.tenant.id),
    getRoles(session.tenant.id),
    getMembers(session.tenant.id),
  ]);

  const myRoleIds = new Set(session.roles.map((r) => r.id));
  const myRoles = roles.filter((r) => myRoleIds.has(r.id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 lg:max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Delegations</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Temporarily hand a role you hold to a teammate — they can act on approvals routed to it for the dates you choose.
        </p>
      </div>

      <Card>
        <CardHeader title="New delegation" />
        <CardBody>
          <DelegationForm myRoles={myRoles} members={members.filter((m) => m.user_id !== session.user.id)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`All delegations (${delegations.length})`} />
        <CardBody className="flex flex-col divide-y divide-line">
          {delegations.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-faint">No delegations yet.</p>
          ) : (
            delegations.map((d) => (
              <DelegationRow key={d.id} delegation={d} canRevoke={d.from_user_id === session.user.id || can(session, "admin.roles.manage")} />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
