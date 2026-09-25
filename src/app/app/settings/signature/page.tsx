import { PenTool } from "lucide-react";
import { requireSession } from "@/lib/data/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SignatureForm } from "./signature-form";

export default async function MySignaturePage() {
  const session = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">My signature</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Draw or upload your signature once — it&rsquo;s applied automatically every time you countersign a contract, so you never have to redraw it.
        </p>
      </div>

      <Card>
        <CardHeader title="Signature" icon={<PenTool className="h-4 w-4" />} />
        <CardBody>
          <SignatureForm savedSignature={session.user.signature_image} />
        </CardBody>
      </Card>
    </div>
  );
}
