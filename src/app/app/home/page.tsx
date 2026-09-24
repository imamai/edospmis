import { ClipboardList } from "lucide-react";
import { requireSession } from "@/lib/data/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function HomePage() {
  const session = await requireSession();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session.user.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-faint">
          {session.roles.length > 0
            ? `You hold ${session.roles.map((r) => r.name).join(", ")} in ${session.tenant.name}.`
            : `You're signed in to ${session.tenant.name}.`}
        </p>
      </div>

      <Card>
        <CardHeader title="My Work" subtitle="Requests and approvals assigned to you" icon={<ClipboardList className="h-4 w-4" />} />
        <CardBody>
          <div className="empty-frame flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">Nothing waiting on you yet</p>
            <p className="max-w-sm text-xs text-ink-faint">
              Cases, purchase requisitions and approvals will show up here the moment the
              procurement workflow module ships (Phase 2) — this workspace, your role and your
              permissions are already fully wired up to carry it.
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        {session.roles.map((r) => (
          <Badge key={r.id} tone="brand">
            {r.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
