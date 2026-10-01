import { ListOrdered } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getQueues } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { QueueForm } from "./queue-form";
import { QueueRow } from "./queue-row";

export default async function QueuesPage() {
  const session = await requireSession();
  if (!can(session, "admin.workflows.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage queues in this workspace.
      </div>
    );
  }

  const queues = await getQueues(session.tenant.id);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Queues</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Where work waits for a given workflow stage.
        </p>
        {/* Said plainly because it was not: queues are configurable for every
            stage and only the approval stage has ever written a task into
            one, so somebody could set up a Finance queue and reasonably wait
            for work that was never going to arrive. */}
        <p className="mt-2 rounded-lg border border-attention/25 bg-attention-soft px-3 py-2 text-xs text-attention">
          Today only the approval stage files work here. Every other stage
          routes through <span className="font-semibold">My Work</span> and the
          notification bell instead, which send a case to whoever holds the job
          and clear it once anybody does it.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Add a queue"
          icon={<ListOrdered className="h-4 w-4" />}
        />
        <CardBody className="max-w-3xl">
          <QueueForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Queues (${queues.length})`} />
        <CardBody className="overflow-x-auto">
          {queues.length === 0 ? (
            <p className="text-sm text-ink-faint">No queues yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Stage</th>
                  <th className="pb-2 pr-4 font-medium">Assignment strategy</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <QueueRow key={q.id} queue={q} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
