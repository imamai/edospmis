import { FileCheck2, FileSignature } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { listDocTypes, listTemplates } from "@/lib/data/tender";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DocTypesSection } from "./doc-types-section";
import { TemplatesSection } from "./templates-section";

export default async function TenderSettingsPage() {
  const session = await requireSession();
  const canDocs = can(session, "procurement.supplier.manage");
  const canTemplates = can(session, "procurement.rfq.create");

  if (!canDocs && !canTemplates) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to change tender requirements in this
        workspace.
      </div>
    );
  }

  const [docTypes, templates] = await Promise.all([
    listDocTypes(session.tenant.id),
    listTemplates(session.tenant.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Tender requirements</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What a bidder must return before they can be awarded. Set up here
          once, then tick what applies to each tender when you invite suppliers
          — a works tender and a stationery order rarely need the same
          paperwork.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Documents you can ask for"
          icon={<FileCheck2 className="h-4 w-4" />}
          subtitle="The standard Kenyan set is here already. Add whatever your sector needs."
        />
        <CardBody>
          <DocTypesSection
            docTypes={docTypes}
            tenantId={session.tenant.id}
            canEdit={canDocs}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Templates a bidder completes and signs"
          icon={<FileSignature className="h-4 w-4" />}
          subtitle="Upload the tender document you already use, or build a form whose answers can be compared side by side."
        />
        <CardBody>
          <TemplatesSection
            templates={templates}
            tenantId={session.tenant.id}
            canEdit={canTemplates}
          />
        </CardBody>
      </Card>
    </div>
  );
}
