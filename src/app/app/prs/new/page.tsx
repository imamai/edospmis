import { requireSession, can } from "@/lib/data/session";
import { getCategories, getClients } from "@/lib/data/reference";
import { modelAvailable } from "@/lib/ai/suggest";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PRForm } from "./pr-form";

export default async function NewPRPage() {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to create requests in this workspace.
      </div>
    );
  }

  const [categories, clients] = await Promise.all([
    getCategories(session.tenant.id),
    getClients(session.tenant.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl lg:max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">New request</h1>
        <p className="mt-1 text-sm text-ink-faint">This opens a new case, tracked from here through approval.</p>
      </div>
      <Card>
        <CardHeader title="Purchase requisition" />
        <CardBody>
          <PRForm categories={categories} clients={clients} aiAvailable={modelAvailable()} />
        </CardBody>
      </Card>
    </div>
  );
}
