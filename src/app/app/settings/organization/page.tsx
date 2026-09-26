import { Settings2 } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { OrganizationForm } from "./organization-form";

export default async function OrganizationPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage the organization profile.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Organization Profile</h1>
        <p className="mt-1 text-sm text-ink-faint">Your workspace&rsquo;s identity, numbering and PO approval rule.</p>
      </div>

      <Card>
        <CardHeader title="Profile" icon={<Settings2 className="h-4 w-4" />} />
        <CardBody>
          <OrganizationForm tenant={session.tenant} />
        </CardBody>
      </Card>
    </div>
  );
}
