import { requireSession, can } from "@/lib/data/session";
import { getClients } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ContractForm } from "./contract-form";

export default async function NewContractPage() {
  const session = await requireSession();
  if (!can(session, "legal.contract.create")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to draft contracts in this workspace.
      </div>
    );
  }

  const clients = await getClients(session.tenant.id);

  return (
    <div className="mx-auto max-w-2xl lg:max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">New contract</h1>
        <p className="mt-1 text-sm text-ink-faint">Add signing parties and send it once the draft is ready.</p>
      </div>
      <Card>
        <CardHeader title="Draft" />
        <CardBody>
          <ContractForm clients={clients} />
        </CardBody>
      </Card>
    </div>
  );
}
