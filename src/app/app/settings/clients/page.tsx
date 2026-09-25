import { Building2 } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getClients } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientForm } from "./client-form";
import { ClientRow } from "./client-row";

export default async function ClientsPage() {
  const session = await requireSession();
  if (!can(session, "crm.client.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage clients in this workspace.
      </div>
    );
  }

  const clients = await getClients(session.tenant.id, true);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Clients</h1>
        <p className="mt-1 text-sm text-ink-faint">Who requests get raised for.</p>
      </div>

      <Card>
        <CardHeader title="Add a client" icon={<Building2 className="h-4 w-4" />} />
        <CardBody>
          <ClientForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Clients (${clients.length})`} />
        <CardBody className="overflow-x-auto">
          {clients.length === 0 ? (
            <p className="text-sm text-ink-faint">No clients yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Client</th>
                  <th className="pb-2 pr-4 font-medium">Phone</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <ClientRow key={c.id} client={c} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
