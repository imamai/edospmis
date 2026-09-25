import { ShieldCheck } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getMembers, getPermissionCatalogue, getRoles } from "@/lib/data/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CreateRoleForm } from "./create-role-form";
import { RoleCard } from "./role-card";

export default async function RolesPage() {
  const session = await requireSession();
  if (!can(session, "admin.roles.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage roles in this workspace.
      </div>
    );
  }

  const [roles, permissions, members] = await Promise.all([
    getRoles(session.tenant.id),
    getPermissionCatalogue(),
    getMembers(session.tenant.id),
  ]);

  const memberCountByRole = new Map<string, number>();
  for (const m of members) {
    for (const r of m.roles) {
      memberCountByRole.set(r.id, (memberCountByRole.get(r.id) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Roles</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Every permission a role can hold, grouped by module — system roles are fixed; create a
          custom role for anything else.
        </p>
      </div>

      <Card>
        <CardHeader title="New custom role" icon={<ShieldCheck className="h-4 w-4" />} />
        <CardBody>
          <CreateRoleForm />
        </CardBody>
      </Card>

      {roles.map((role) => (
        <RoleCard key={role.id} role={role} permissions={permissions} memberCount={memberCountByRole.get(role.id) ?? 0} />
      ))}
    </div>
  );
}
