import { Webhook as WebhookIcon } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getWebhooks } from "@/lib/data/webhooks";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WebhookForm } from "./webhook-form";
import { WebhookRow } from "./webhook-row";

export default async function WebhooksPage() {
  const session = await requireSession();
  if (!can(session, "admin.webhooks.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage webhooks in this workspace.
      </div>
    );
  }

  const webhooks = await getWebhooks(session.tenant.id);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Webhooks</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Get a signed HTTPS request whenever something happens in this workspace — a request submitted, a PO issued, an
          invoice paid, and everything else this workspace&rsquo;s own audit log records.
        </p>
      </div>

      <Card>
        <CardHeader title="Add an endpoint" icon={<WebhookIcon className="h-4 w-4" />} />
        <CardBody className="max-w-3xl">
          <WebhookForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Endpoints (${webhooks.length})`} />
        <CardBody className="flex flex-col gap-2">
          {webhooks.length === 0 ? (
            <p className="text-sm text-ink-faint">No webhooks yet.</p>
          ) : (
            webhooks.map((w) => <WebhookRow key={w.id} webhook={w} />)
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Verifying a delivery" />
        <CardBody className="flex flex-col gap-2 text-sm text-ink-soft">
          <p>
            Every request carries an <code className="rounded bg-surface-sunk px-1.5 py-0.5 text-xs">X-EDOSPMIS-Event</code> header naming what happened, and an{" "}
            <code className="rounded bg-surface-sunk px-1.5 py-0.5 text-xs">X-EDOSPMIS-Signature</code> header of the form{" "}
            <code className="rounded bg-surface-sunk px-1.5 py-0.5 text-xs">sha256=&lt;hex&gt;</code>.
          </p>
          <p>
            To verify it, compute an HMAC-SHA256 of the <strong>raw request body</strong> (before parsing it as JSON) using
            your endpoint&rsquo;s signing secret, and compare the hex digest to what follows{" "}
            <code className="rounded bg-surface-sunk px-1.5 py-0.5 text-xs">sha256=</code>. Reparsing and re-serializing the
            JSON first will not match — hash the bytes exactly as received.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
