import { createAdminClient } from "@/lib/supabase/admin";
import { SignForm, DeclineControl } from "./sign-form";

const PARTY_ROLE_LABEL: Record<string, string> = {
  client_signer: "signer",
  tenant_signer: "countersigner",
  witness: "witness",
};

interface TokenRow {
  contract_id: string;
  tenant_name: string;
  contract_title: string;
  contract_type: string;
  contract_status: string;
  body: string;
  requires_witness: boolean;
  party_id: string;
  party_role: string;
  party_name: string;
  party_status: "pending" | "viewed" | "signed" | "declined";
  party_signing_order: number;
  can_sign_now: boolean;
  token_expired: boolean;
  signed_at: string | null;
  other_parties: { role: string; name: string; status: string; signed_at: string | null }[] | null;
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("edospmis_get_contract_by_token", { p_token: token });
  const row = (Array.isArray(data) ? data[0] : data) as TokenRow | undefined;

  if (error || !row) {
    return (
      <Shell>
        <p className="text-sm text-ink-soft">This link is invalid or has expired. Ask the sender for a new one.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{row.contract_type.replace(/_/g, " ")}</p>
        <h1 className="text-xl font-semibold text-ink">{row.contract_title}</h1>
        <p className="text-sm text-ink-faint">
          Sent by {row.tenant_name} — you are the {PARTY_ROLE_LABEL[row.party_role] ?? row.party_role}, {row.party_name}.
        </p>
      </div>

      {row.other_parties && row.other_parties.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-sunk px-3 py-2.5 text-xs">
          {row.other_parties.map((p, i) => (
            <p key={i} className="text-ink-faint">
              <span className="font-medium text-ink-soft">{p.name}</span> ({PARTY_ROLE_LABEL[p.role] ?? p.role}) —{" "}
              <span className={p.status === "signed" ? "text-good" : p.status === "declined" ? "text-critical" : ""}>{p.status}</span>
            </p>
          ))}
        </div>
      )}

      <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-4 py-4 text-sm text-ink-soft">{row.body}</div>

      {row.party_status === "signed" ? (
        <p className="rounded-lg border border-good/25 bg-good-soft px-3 py-2.5 text-sm text-good">
          You signed this on {row.signed_at ? new Date(row.signed_at).toLocaleString() : "file"}. Thank you.
        </p>
      ) : row.party_status === "declined" ? (
        <p className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical">
          You declined to sign this contract. Contact {row.tenant_name} if that was a mistake.
        </p>
      ) : row.token_expired ? (
        <p className="rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5 text-sm text-attention">
          This link has expired. Ask {row.tenant_name} to resend it.
        </p>
      ) : !row.can_sign_now ? (
        <p className="rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5 text-sm text-attention">
          Waiting for an earlier signer to complete their signature first — check back soon.
        </p>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-line p-4">
          <SignForm token={token} defaultName={row.party_name} />
          <DeclineControl token={token} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-surface-sunk px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">EDOSPMIS</p>
        <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6 shadow-card">{children}</div>
      </div>
    </div>
  );
}
