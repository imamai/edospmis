import { Gavel } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getApprovalRules } from "@/lib/data/cases";
import { getRoles } from "@/lib/data/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RuleForm } from "./rule-form";
import { RuleRow } from "./rule-row";

export default async function ApprovalRulesPage() {
  const session = await requireSession();
  if (!can(session, "admin.approvals.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage approval rules in this workspace.
      </div>
    );
  }

  const [rules, roles] = await Promise.all([getApprovalRules(session.tenant.id), getRoles(session.tenant.id)]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 lg:max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Approval rules</h1>
        <p className="mt-1 text-sm text-ink-faint">
          The chain a request travels through is picked by amount — the narrowest matching rule wins.
        </p>
      </div>

      <Card>
        <CardHeader title="New rule" icon={<Gavel className="h-4 w-4" />} />
        <CardBody>
          <RuleForm roles={roles} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Rules (${rules.length})`} />
        <CardBody>
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
