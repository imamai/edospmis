import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { QuoteForm, DeclineInviteControl } from "./quote-form";
import type { PRItem } from "@/lib/database.types";

interface TokenRow {
  rfq_id: string;
  tenant_name: string;
  rfq_title: string;
  items: PRItem[];
  closing_date: string | null;
  rfq_status: string;
  invite_id: string;
  supplier_display_name: string | null;
  invite_status: "invited" | "viewed" | "submitted" | "declined";
  token_expired: boolean;
}

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("edospmis_get_rfq_by_token", { p_token: token });
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
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Request for quotation</p>
        <h1 className="text-xl font-semibold text-ink">{row.rfq_title}</h1>
        <p className="text-sm text-ink-faint">
          From {row.tenant_name}
          {row.closing_date ? ` — please respond by ${formatDate(row.closing_date)}` : ""}.
        </p>
      </div>

      {row.invite_status === "submitted" ? (
        <p className="rounded-lg border border-good/25 bg-good-soft px-3 py-2.5 text-sm text-good">
          Thank you — your quotation has been submitted to {row.tenant_name}.
        </p>
      ) : row.invite_status === "declined" ? (
        <p className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical">
          You declined this request. Contact {row.tenant_name} if that was a mistake.
        </p>
      ) : row.token_expired ? (
        <p className="rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5 text-sm text-attention">
          This link has expired. Ask {row.tenant_name} to resend it.
        </p>
      ) : row.rfq_status !== "open" ? (
        <p className="rounded-lg border border-attention/25 bg-attention-soft px-3 py-2.5 text-sm text-attention">
          This request is no longer open for quotes.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <QuoteForm token={token} items={row.items} defaultName={row.supplier_display_name ?? ""} />
          <DeclineInviteControl token={token} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-surface-sunk px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">EDOSPMIS</p>
        <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6 shadow-card">{children}</div>
      </div>
    </div>
  );
}
