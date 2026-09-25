import { Users as UsersIcon } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getMembers, getRoles } from "@/lib/data/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { MemberRowItem } from "./member-row";

export default async function UsersPage() {
  const session = await requireSession();
  if (!can(session, "admin.users.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage users in this workspace.
      </div>
    );
  }

  const [members, roles] = await Promise.all([getMembers(session.tenant.id), getRoles(session.tenant.id)]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Users</h1>
        <p className="mt-1 text-sm text-ink-faint">Invite teammates and manage their role in {session.tenant.name}.</p>
      </div>

      <Card>
        <CardHeader title="Invite someone" icon={<UsersIcon className="h-4 w-4" />} />
        <CardBody className="max-w-2xl">
          <InviteForm roles={roles} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Member</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRowItem key={m.membership_id} member={m} roles={roles} isSelf={m.user_id === session.user.id} />
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
