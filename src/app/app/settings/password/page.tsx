import { KeyRound } from "lucide-react";
import { requireSession } from "@/lib/data/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Your password</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Signed in as {session.user.email}.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Change your password"
          icon={<KeyRound className="h-4 w-4" />}
          subtitle="You will stay signed in here. Other devices will need the new password."
        />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
