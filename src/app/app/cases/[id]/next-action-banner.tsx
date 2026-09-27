import { Info, AlertTriangle, AlertOctagon } from "lucide-react";
import { type SessionContext } from "@/lib/data/session";
import { slaStatus } from "@/lib/utils";
import { computeNextAction, type Tone, type NextActionInput as DomainInput } from "@/lib/next-action";

const TONE_CLASS: Record<Tone, string> = {
  info: "border-info/30 bg-info-soft text-info",
  attention: "border-attention/30 bg-attention-soft text-attention",
  critical: "border-critical/30 bg-critical-soft text-critical",
};

const TONE_ICON: Record<Tone, typeof Info> = {
  info: Info,
  attention: AlertTriangle,
  critical: AlertOctagon,
};

/** The page passes its session; the rule itself takes only a permission set, so it can be tested. */
export type NextActionInput = Omit<DomainInput, "permissions" | "slaStatus"> & { session: SessionContext };

export function NextActionBanner({ session, ...rest }: NextActionInput) {
  const result = computeNextAction({ ...rest, permissions: session.permissions, slaStatus });
  if (!result) return null;
  const Icon = TONE_ICON[result.tone];

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${TONE_CLASS[result.tone]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {result.message}
    </div>
  );
}
