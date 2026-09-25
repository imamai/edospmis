import { Tags } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getCategories } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CategoryForm } from "./category-form";
import { CategoryRow } from "./category-row";

export default async function CategoriesPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage categories in this workspace.
      </div>
    );
  }

  const categories = await getCategories(session.tenant.id, true);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Categories</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What a request gets filed under — replace the starter set with whatever your own teams actually call their requests.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a category" icon={<Tags className="h-4 w-4" />} />
        <CardBody className="max-w-2xl">
          <CategoryForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Categories (${categories.length})`} />
        <CardBody className="overflow-x-auto">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-faint">No categories yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <CategoryRow key={c.id} category={c} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
