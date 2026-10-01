import { Boxes, Upload } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { listCatalogue } from "@/lib/data/catalogue";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CatalogueImport } from "./catalogue-import";
import { CatalogueItemForm } from "./catalogue-item-form";
import { CatalogueTable } from "./catalogue-table";

export default async function CataloguePage() {
  const session = await requireSession();
  if (!can(session, "procurement.catalogue.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to maintain the item catalogue in this
        workspace.
      </div>
    );
  }

  const items = await listCatalogue(session.tenant.id);
  const active = items.filter((i) => i.is_active).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Item catalogue</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What this organisation buys, named once. Requesters pick from this
          list instead of typing a description, so the same item is called the
          same thing on every request — which is what makes spend by item, and
          duplicate requests, visible at all.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Import from a spreadsheet"
          icon={<Upload className="h-4 w-4" />}
          subtitle="The price list or stock list you already keep. Excel or CSV."
        />
        <CardBody>
          <CatalogueImport />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Add a single item"
          icon={<Boxes className="h-4 w-4" />}
        />
        <CardBody className="max-w-3xl">
          <CatalogueItemForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Catalogue (${active} available${items.length > active ? `, ${items.length - active} withdrawn` : ""})`}
        />
        <CardBody className="overflow-x-auto">
          {items.length === 0 ? (
            <p className="text-sm text-ink-faint">
              Nothing in the catalogue yet. Import a spreadsheet above, or add a
              first item by hand — requesters can still type their own
              descriptions in the meantime.
            </p>
          ) : (
            <CatalogueTable
              items={items}
              currency={items[0]?.currency ?? "KES"}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
