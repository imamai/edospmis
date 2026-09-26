import { Globe } from "lucide-react";
import { requireSession } from "@/lib/data/session";
import { getAllTenants } from "@/lib/data/platform";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PlatformTenantsPage() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view this.
      </div>
    );
  }

  const tenants = await getAllTenants();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Tenants</h1>
        <p className="mt-1 text-sm text-ink-faint">Every workspace on EDOSPMIS — visible only to platform admins.</p>
      </div>

      <Card>
        <CardHeader title={`Tenants (${tenants.length})`} icon={<Globe className="h-4 w-4" />} />
        <CardBody className="overflow-x-auto">
          {tenants.length === 0 ? (
            <p className="text-sm text-ink-faint">No tenants yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Slug</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4 text-sm font-medium text-ink">{t.name}</td>
                    <td className="py-2.5 pr-4 text-sm text-ink-faint">{t.slug}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={t.status === "active" ? "good" : t.status === "suspended" ? "critical" : "neutral"}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-ink-faint">{t.plan}</td>
                    <td className="py-2.5 text-sm text-ink-faint">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
