import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify/email";
import { withPanelAnchor } from "@/lib/notify/panel-anchors";
import { shellEmail } from "@/lib/notify/auth-email";

/**
 * Telling people a case is waiting on them.
 *
 * Every call goes through here rather than being written at each call site,
 * so the two rules that make a bell worth reading are enforced once:
 *
 *   - email only when the work blocks (see migration 0055 for why),
 *   - a failure never breaks the thing being notified about.
 *
 * That second one matters more than it sounds. These are called after an
 * approval, an award, a payment — all of which have already happened and
 * cannot be undone by a mail server having a bad afternoon. A notification
 * that throws would turn a successful approval into a visible error, which is
 * both a lie and the kind of thing that gets notifications ripped out.
 */

export interface NotifyInput {
  tenantId: string;
  caseId: string;
  /** Stable key — 'pr.submitted', 'invoice.exception'. Used to resolve later. */
  kind: string;
  title: string;
  body?: string;
  /** Where the work is done. Always a path within the app. */
  href: string;
  /**
   * Whoever holds this permission in the tenant hears about it, minus the
   * person who caused it.
   */
  permission: string;
  /**
   * Nothing moves until somebody acts, so it also goes out by email. Left off
   * for anything informational — see the catalogue in migration 0055.
   */
  blocks?: boolean;
  /** For the email only; the bell says it in the title. */
  tenantName?: string;
  /**
   * Caused by a supplier, who has no session for the ordinary client to run
   * under. What changes is who is asking, not who is told: the fan-out still
   * only reaches members of the tenant holding the permission.
   */
  fromSupplier?: boolean;
}

interface Recipient {
  user_id: string;
  email: string;
  full_name: string | null;
}

export async function notifyRole(input: NotifyInput): Promise<void> {
  try {
    const supabase = input.fromSupplier
      ? createAdminClient()
      : await createClient();
    const { data, error } = await supabase.rpc("edospmis_notify", {
      p_tenant_id: input.tenantId,
      p_case_id: input.caseId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body ?? null,
      p_href: withPanelAnchor(input.href, input.kind),
      p_permission: input.permission,
    });
    if (error) throw new Error(error.message);

    if (!input.blocks) return;

    const recipients = (data ?? []) as Recipient[];
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

    // Sent one at a time rather than as a single message with everybody in
    // the To line: these are colleagues, not a mailing list, and a reply-all
    // about one requisition is its own small disaster.
    await Promise.all(
      recipients
        .filter((r) => r.email)
        .map((r) =>
          sendEmail({
            to: r.email,
            ...shellEmail({
              subject: input.title,
              heading: input.title,
              body: input.body ?? "This is waiting on you.",
              cta: "Open it",
              link: `${base}${withPanelAnchor(input.href, input.kind)}`,
              footer: input.tenantName,
            }),
          }),
        ),
    );
  } catch (cause) {
    // Logged, never thrown. The approval, award or payment this followed has
    // already happened.
    console.error(`EDOSPMIS notification (${input.kind}) failed:`, cause);
  }
}

/**
 * The same, for one named person — nearly always the requester, who holds no
 * permission that would catch them in the fan-out.
 */
export async function notifyUser(input: {
  tenantId: string;
  userId: string | null;
  caseId: string;
  kind: string;
  title: string;
  body?: string;
  href: string;
  fromSupplier?: boolean;
}): Promise<void> {
  if (!input.userId) return;
  try {
    const supabase = input.fromSupplier
      ? createAdminClient()
      : await createClient();
    const { error } = await supabase.rpc("edospmis_notify_user", {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_case_id: input.caseId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body ?? null,
      p_href: withPanelAnchor(input.href, input.kind),
    });
    if (error) throw new Error(error.message);
  } catch (cause) {
    console.error(`EDOSPMIS notification (${input.kind}) failed:`, cause);
  }
}

/**
 * Clear a whole class for a case, because the work is done.
 *
 * Called by whoever did it, which is what stops a fan-out becoming a pile:
 * four approvers were told, one approved, and the other three should not
 * still be looking at it.
 */
export async function resolveNotifications(
  caseId: string,
  kind: string,
  fromSupplier = false,
): Promise<void> {
  try {
    const supabase = fromSupplier ? createAdminClient() : await createClient();
    await supabase.rpc("edospmis_resolve_notifications", {
      p_case_id: caseId,
      p_kind: kind,
    });
  } catch (cause) {
    console.error(`EDOSPMIS resolving notifications (${kind}) failed:`, cause);
  }
}

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  read_at: string | null;
  created_at: string;
}

/** The bell's own read: mine, still outstanding, newest first. */
export async function getInbox(limit = 20): Promise<InboxItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as InboxItem[];
}

export interface CaseContext {
  tenantId: string;
  caseNumber: string;
  title: string | null;
  requesterId: string | null;
}

/**
 * The three things every notification needs about a case.
 *
 * Fetched once here rather than repeated at a dozen call sites, where the
 * temptation is to skip the case number and write "A request needs your
 * approval" — which tells somebody with four of them open nothing at all.
 */
export async function caseContext(caseId: string): Promise<CaseContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_cases")
    .select("tenant_id, case_number, edospmis_prs(title, requester_id)")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    tenant_id: string;
    case_number: string;
    edospmis_prs:
      | { title: string; requester_id: string }
      | { title: string; requester_id: string }[]
      | null;
  };
  const pr = Array.isArray(row.edospmis_prs)
    ? (row.edospmis_prs[0] ?? null)
    : row.edospmis_prs;

  return {
    tenantId: row.tenant_id,
    caseNumber: row.case_number,
    title: pr?.title ?? null,
    requesterId: pr?.requester_id ?? null,
  };
}

/**
 * The kinds that are somebody's job, as opposed to somebody's news.
 *
 * "Your goods have arrived" is worth telling a requester and is not work —
 * putting it in a work list means a list that cannot be emptied, which is the
 * same failure as a bell that never clears.
 *
 * Classified here rather than with a column on the table, because the
 * distinction belongs to the catalogue in migration 0055 and changes with it;
 * a boolean written at insert time would have to be backfilled every time
 * somebody reclassified an event.
 *
 * The `.requester` suffix is the convention for the informational twin of an
 * actionable event — po.issued is receiving's job, po.issued.requester is the
 * requester being told.
 */
export const ACTIONABLE_KINDS = [
  "pr.submitted",
  "pr.approved",
  "quotation.received",
  "bid.submitted",
  "po.pending_approval",
  "po.issued",
  "grn.recorded",
  "grn.inspection_failed",
  "invoice.submitted",
  "invoice.exception",
  "invoice.approved",
] as const;

export interface QueueItem extends InboxItem {
  case_id: string | null;
}

/**
 * Everything outstanding that is actually yours to do.
 *
 * This is the queue. `edospmis_queues` was only ever populated for the
 * approval stage, so five of six stages had an inbox configured and nothing
 * ever arrived in it; the notification rows know the case, the stage and who
 * holds the job, which is everything a queue needs.
 *
 * Approvals are left out: they come through getMyWork, which carries the
 * amount and the priority and renders as a decision rather than a line in a
 * list. Showing both would mean one requisition appearing twice.
 */
export async function getMyQueue(limit = 50): Promise<QueueItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_notifications")
    .select("id, kind, title, body, href, read_at, created_at, case_id")
    .is("resolved_at", null)
    .in(
      "kind",
      ACTIONABLE_KINDS.filter((k) => k !== "pr.submitted"),
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as QueueItem[];
}
