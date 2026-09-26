import { UsersRound } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getTeams, getDepartments } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TeamForm } from "./team-form";
import { TeamRow } from "./team-row";

export default async function TeamsPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage teams in this workspace.
      </div>
    );
  }

  const [teams, allDepartments, activeDepartments] = await Promise.all([
    getTeams(session.tenant.id, true),
    getDepartments(session.tenant.id, true),
    getDepartments(session.tenant.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Teams</h1>
        <p className="mt-1 text-sm text-ink-faint">Smaller working groups within a department.</p>
      </div>

      <Card>
        <CardHeader title="Add a team" icon={<UsersRound className="h-4 w-4" />} />
        <CardBody className="max-w-2xl">
          <TeamForm departments={activeDepartments} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Teams (${teams.length})`} />
        <CardBody className="overflow-x-auto">
          {teams.length === 0 ? (
            <p className="text-sm text-ink-faint">No teams yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Department</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <TeamRow key={t.id} team={t} departments={allDepartments} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
