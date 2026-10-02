"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify/email";
import { awardEmail, rfqInviteEmail } from "@/lib/notify/auth-email";
import {
  caseContext,
  notifyRole,
  notifyUser,
  resolveNotifications,
} from "@/lib/notify/notifications";
import { formatDate, formatMoney } from "@/lib/utils";

export interface ProcurementState {
  error: string | null;
  ok: string | null;
}

export async function startProcurement(
  caseId: string,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_start_procurement", {
    p_case_id: caseId,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Procurement started." };
}

export async function inviteSupplierToRfq(
  rfqId: string,
  caseId: string,
  supplierId: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("edospmis_rfq_suppliers")
    .insert({
      tenant_id: session.tenant.id,
      rfq_id: rfqId,
      supplier_id: supplierId,
    })
    .select("id")
    .single();
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Already invited."
          : "Couldn't invite that supplier.",
      ok: null,
    };

  // Inviting is telling them. A failed send is reported as part of the
  // success, not instead of it: the invitation exists either way, and saying
  // "couldn't invite" about a supplier who is now on the list would send
  // somebody looking for a row that is already there.
  const mail = await mailRfqInvite(
    row.id,
    session.tenant.id,
    session.tenant.name,
  );
  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok: mail.ok
      ? `Supplier invited. ${mail.message}`
      : `Supplier invited, but not emailed: ${mail.message}`,
  };
}

/** Sources a supplier who isn't in the system yet — same invite mechanism, no supplier_id required until they submit. */
export async function inviteProspectToRfq(
  rfqId: string,
  caseId: string,
  name: string,
  email: string,
  phone: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  if (!name.trim())
    return { error: "Enter a company or contact name.", ok: null };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("edospmis_rfq_suppliers")
    .insert({
      tenant_id: session.tenant.id,
      rfq_id: rfqId,
      invite_name: name.trim(),
      invite_email: email.trim() || null,
      invite_phone: phone.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't add that supplier.", ok: null };

  const mail = await mailRfqInvite(
    row.id,
    session.tenant.id,
    session.tenant.name,
  );
  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok: mail.ok
      ? `Supplier invited. ${mail.message}`
      : `Supplier invited, but not emailed: ${mail.message}`,
  };
}

/**
 * The address this request arrived on, so a link mailed to a supplier comes
 * back to the deployment that sent it.
 *
 * NEXT_PUBLIC_SITE_URL is the fallback rather than the source of truth: unset,
 * it produced "undefined/quote/..." in a real supplier's inbox, and on a
 * preview deployment it points every link at production.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Sends one supplier their invitation, and records that we did.
 *
 * WHY THIS IS A HELPER AND NOT A BUTTON. Inviting a supplier used to insert a
 * row and send nothing: the mail went only if somebody separately clicked
 * Email on that row. Both states rendered as the same "invited" badge, so a
 * supplier nobody had written to looked exactly like one who had read it, and
 * the buying team waited for quotations from people who had never been asked.
 * Of every invitation in the live send log, two had mail sent.
 *
 * So inviting sends, and the manual button re-sends through this same path —
 * one body of code, so a re-send cannot drift from the original.
 *
 * `emailed_at` is stamped only after the provider accepts. Acceptance is not
 * delivery (one of those two sends bounced off a mistyped address), but it is
 * the honest boundary of what this process can observe.
 */
async function mailRfqInvite(
  inviteId: string,
  tenantId: string,
  tenantName: string,
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("edospmis_rfq_suppliers")
    .select(
      "access_token, invite_email, invite_name, supplier_id, rfq_id, edospmis_rfqs(title, closing_date), edospmis_suppliers(name, email)",
    )
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, message: "Couldn't find that invitation." };

  const rfq = invite.edospmis_rfqs as unknown as {
    title: string;
    closing_date: string | null;
  } | null;
  const supplier = invite.edospmis_suppliers as unknown as {
    name: string;
    email: string | null;
  } | null;
  const email = invite.invite_email || supplier?.email;
  if (!email)
    return {
      ok: false,
      message: "This supplier has no email address on file.",
    };

  const base = await requestOrigin();
  const link = `${base}/quote/${invite.access_token}`;

  // What this tender asks for, so the supplier knows before they open the
  // link rather than after. Mandatory first — those are the ones that will
  // stop them submitting.
  const { data: reqRows } = await supabase
    .from("edospmis_rfq_requirements")
    .select(
      "is_mandatory, edospmis_supplier_doc_types(name), edospmis_procurement_templates(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("rfq_id", invite.rfq_id);

  const one = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const requirements = (reqRows ?? [])
    .map((row) => {
      const r = row as unknown as {
        is_mandatory: boolean;
        edospmis_supplier_doc_types:
          { name: string } | { name: string }[] | null;
        edospmis_procurement_templates:
          { name: string } | { name: string }[] | null;
      };
      return {
        name:
          one(r.edospmis_supplier_doc_types)?.name ??
          one(r.edospmis_procurement_templates)?.name ??
          null,
        mandatory: r.is_mandatory,
      };
    })
    .filter((r): r is { name: string; mandatory: boolean } => r.name !== null)
    .sort(
      (a, b) =>
        Number(b.mandatory) - Number(a.mandatory) ||
        a.name.localeCompare(b.name),
    )
    .map((r) => (r.mandatory ? r.name : `${r.name} (optional)`));

  const result = await sendEmail({
    to: email,
    ...rfqInviteEmail({
      link,
      tenantName,
      rfqTitle: rfq?.title ?? "a request",
      closingDate: rfq?.closing_date ? formatDate(rfq.closing_date) : null,
      requirements,
    }),
  });
  if (!result.ok)
    return { ok: false, message: result.error ?? "Couldn't send the email." };

  await supabase
    .from("edospmis_rfq_suppliers")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("tenant_id", tenantId);

  return { ok: true, message: `Emailed to ${email}.` };
}

export async function shareRfqInviteLink(
  caseId: string,
  inviteId: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  const result = await mailRfqInvite(
    inviteId,
    session.tenant.id,
    session.tenant.name,
  );
  revalidatePath(`/app/cases/${caseId}`);
  return result.ok
    ? { error: null, ok: result.message }
    : { error: result.message, ok: null };
}

/**
 * Sending the invitations that were never sent.
 *
 * Needed because of a bug this codebase carried for a while: inviting a
 * supplier inserted a row and sent nothing, so the live data holds a backlog
 * of suppliers sitting at "invited" who were never actually asked. Inviting
 * now sends, but that does nothing for the ones already on the list.
 *
 * WHAT COUNTS AS UNSENT. Status still 'invited', and no send on record. A
 * supplier at 'viewed' has opened their link — they were reached, by a copied
 * link or WhatsApp, and are not waiting on us. Mailing them again would be
 * noise, and noise from a procurement system is how a buyer's mail starts
 * going to a spam folder.
 *
 * SEQUENTIAL, AND CAPPED. One send at a time, because Resend rate-limits and a
 * burst of parallel posts would have some rejected with nothing to show which.
 * Capped per click so the action cannot outrun a serverless request timeout
 * halfway through and leave the caller unable to tell what went out; the
 * message says when more remain.
 *
 * Partial success is the normal case, not an error: some suppliers have no
 * address on file. Each outcome is recorded against its own row as it happens,
 * so a run that dies early still leaves an accurate record of what was sent.
 */
const UNSENT_BATCH = 20;

export async function mailUnsentRfqInvites(
  rfqId: string,
  caseId: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  const supabase = await createClient();

  /**
   * A closed tender invites nobody.
   *
   * Checked because the backlog this exists to clear is mostly historical: of
   * the unsent invitations on the live system, three quarters belong to RFQs
   * that were awarded, received or paid months ago. Mailing those would ask a
   * dozen suppliers to quote on work already given to somebody else — a worse
   * outcome than the silence it set out to fix, and one you cannot take back.
   *
   * Gated here and not only in the panel, because this is the guarantee: the
   * button can be hidden, the action cannot be un-called.
   */
  const { data: rfq } = await supabase
    .from("edospmis_rfqs")
    .select("status")
    .eq("id", rfqId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!rfq) return { error: "Couldn't find that request.", ok: null };
  if (rfq.status !== "open")
    return {
      error:
        "This tender is closed. Suppliers can't be invited to quote on it now.",
      ok: null,
    };

  const { data: rows } = await supabase
    .from("edospmis_rfq_suppliers")
    .select("id, invite_email, edospmis_suppliers(email)")
    .eq("tenant_id", session.tenant.id)
    .eq("rfq_id", rfqId)
    .eq("status", "invited")
    .is("emailed_at", null)
    .order("invited_at");

  /**
   * Only an address decides it — not whether the supplier is active.
   *
   * This did exclude inactive suppliers, which was wrong for a reason the flag
   * hides: `is_active` false means two different things. A supplier who quotes
   * through the portal is created inactive pending staff approval, and on this
   * system all three inactive suppliers are that — each with purchase orders
   * against them. Skipping them would have silently dropped real trading
   * partners from a send the buyer had just confirmed.
   *
   * They are not hidden from the decision either: the confirmation dialog
   * marks them, so a genuinely archived supplier can be spotted before the
   * mail goes rather than being quietly included or quietly dropped.
   */
  const one = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const pending = (rows ?? []).filter((row) => {
    if (row.invite_email) return true;
    const supplier = one(
      row.edospmis_suppliers as
        { email: string | null } | { email: string | null }[] | null,
    );
    return Boolean(supplier?.email);
  });

  if (pending.length === 0 && (rows ?? []).length > 0)
    return {
      error: null,
      ok: "None of the remaining invitations have an email address on file.",
    };
  if (pending.length === 0)
    return { error: null, ok: "Every invitation has already been sent." };

  const batch = pending.slice(0, UNSENT_BATCH);
  let sent = 0;
  const failures: string[] = [];

  for (const row of batch) {
    const result = await mailRfqInvite(
      row.id,
      session.tenant.id,
      session.tenant.name,
    );
    if (result.ok) sent += 1;
    else failures.push(result.message);
  }

  revalidatePath(`/app/cases/${caseId}`);

  const parts: string[] = [
    sent === 1 ? "Emailed 1 supplier." : `Emailed ${sent} suppliers.`,
  ];
  // Counted by reason rather than listed one by one: sixteen rows each saying
  // "no email address on file" is a wall of text that hides the one failure
  // that was something else.
  const noAddress = failures.filter((f) =>
    f.includes("no email address"),
  ).length;
  if (noAddress > 0)
    parts.push(
      `${noAddress} ${noAddress === 1 ? "has" : "have"} no email address on file.`,
    );
  const other = failures.length - noAddress;
  if (other > 0)
    parts.push(
      `${other} failed to send — try again, or email those individually to see why.`,
    );
  const remaining = pending.length - batch.length;
  if (remaining > 0) parts.push(`${remaining} still to go — run it again.`);

  return { error: null, ok: parts.join(" ") };
}

/**
 * The base URL for a quote link, for the client to build Copy-link and
 * WhatsApp hrefs with.
 *
 * Those two built the URL from NEXT_PUBLIC_SITE_URL in the browser, while the
 * emailed link had already learned not to trust it — see `requestOrigin`,
 * which exists because that variable once put "undefined/quote/..." in a real
 * supplier's inbox. Sharing the same origin means all three routes to a
 * supplier are right or wrong together, rather than one silently working.
 */
export async function quoteLinkOrigin(): Promise<string> {
  await requireSession();
  return requestOrigin();
}

export async function recordQuotation(
  _prev: ProcurementState,
  form: FormData,
): Promise<ProcurementState> {
  const session = await requireSession();
  const rfqId = String(form.get("rfq_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const supplierId = String(form.get("supplier_id") ?? "");
  const totalRaw = String(form.get("total") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const totalCents = Math.round(Number(totalRaw) * 100);
  if (!Number.isFinite(totalCents) || totalCents <= 0)
    return { error: "Enter the quoted amount.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_quotations").insert({
    tenant_id: session.tenant.id,
    rfq_id: rfqId,
    supplier_id: supplierId,
    total_cents: totalCents,
    notes,
  });
  if (error) return { error: "Couldn't save that quotation.", ok: null };

  const ctx = await caseContext(caseId);
  if (ctx) {
    await notifyRole({
      tenantId: ctx.tenantId,
      caseId,
      kind: "quotation.received",
      title: `${ctx.caseNumber}: a quotation is in — compare and award`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
      permission: "procurement.rfq.evaluate",
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Quotation recorded." };
}

/**
 * Issue the purchase order.
 *
 * `overrideReason` is only ever read when the winning bidder has not returned
 * something mandatory. The gate itself lives in edospmis_award_po, not here,
 * so passing a reason when nothing is missing changes nothing and cannot be
 * used to pre-arm an override.
 */
export async function awardPO(
  rfqId: string,
  caseId: string,
  quotationId: string,
  notes: string,
  expectedDeliveryDate: string | null,
  overrideReason?: string | null,
): Promise<ProcurementState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_award_po", {
    p_rfq_id: rfqId,
    p_quotation_id: quotationId,
    p_notes: notes || null,
    p_expected_delivery_date: expectedDeliveryDate || null,
    p_override_reason: overrideReason?.trim() || null,
  });
  if (error) return { error: error.message, ok: null };

  // Tell the winner. This was not being sent at all: an award closed the RFQ,
  // issued a purchase order, and told the supplier nothing — so somebody had
  // to remember to ring them, and a supplier who finds out when the order
  // arrives has had no chance to say the price has moved or the stock is gone.
  //
  // After the award and never fatal. The purchase order exists either way; a
  // mail failure must not unwind a commitment, and reporting it as an award
  // failure would be a lie.
  try {
    const one = <T>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

    const { data: row } = await supabase
      .from("edospmis_quotations")
      .select(
        "total_cents, currency, supplier_id, edospmis_suppliers(email), edospmis_rfqs(title)",
      )
      .eq("id", quotationId)
      .maybeSingle();

    const quote = row as unknown as {
      total_cents: number;
      currency: string;
      supplier_id: string;
      edospmis_suppliers:
        { email: string | null } | { email: string | null }[] | null;
      edospmis_rfqs: { title: string } | { title: string }[] | null;
    } | null;

    if (quote) {
      // The address on the supplier record, or the one the invitation went to
      // for somebody sourced for this tender alone.
      const { data: invite } = await supabase
        .from("edospmis_rfq_suppliers")
        .select("invite_email")
        .eq("rfq_id", rfqId)
        .eq("supplier_id", quote.supplier_id)
        .maybeSingle<{ invite_email: string | null }>();

      const { data: po } = await supabase
        .from("edospmis_purchase_orders")
        .select("po_number, expected_delivery_date")
        .eq("rfq_id", rfqId)
        .maybeSingle<{
          po_number: string;
          expected_delivery_date: string | null;
        }>();

      const to = one(quote.edospmis_suppliers)?.email || invite?.invite_email;

      if (to && po) {
        await sendEmail({
          to,
          ...awardEmail({
            tenantName: session.tenant.name,
            rfqTitle: one(quote.edospmis_rfqs)?.title ?? "your quotation",
            poNumber: po.po_number,
            amount: formatMoney(quote.total_cents, {
              currency: quote.currency,
            }),
            expectedDelivery: po.expected_delivery_date
              ? formatDate(po.expected_delivery_date)
              : null,
          }),
        });
      }
    }
  } catch (cause) {
    console.error("EDOSPMIS award notification failed:", cause);
  }

  const ctx = await caseContext(caseId);
  if (ctx) {
    await resolveNotifications(caseId, "quotation.received");
    await resolveNotifications(caseId, "bid.submitted");
    await resolveNotifications(caseId, "pr.approved");

    const { data: po } = await supabase
      .from("edospmis_purchase_orders")
      .select("po_number, status")
      .eq("rfq_id", rfqId)
      .maybeSingle<{ po_number: string; status: string }>();

    if (po?.status === "pending_approval") {
      await notifyRole({
        tenantId: ctx.tenantId,
        caseId,
        kind: "po.pending_approval",
        title: `${ctx.caseNumber}: ${po.po_number} needs your approval before it can be issued`,
        body: ctx.title ?? undefined,
        href: `/app/cases/${caseId}`,
        permission: "procurement.po.approve",
        blocks: true,
      });
    } else if (po) {
      await notifyRole({
        tenantId: ctx.tenantId,
        caseId,
        kind: "po.issued",
        title: `${ctx.caseNumber}: ${po.po_number} issued — record the goods when they arrive`,
        body: ctx.title ?? undefined,
        href: `/app/cases/${caseId}`,
        permission: "receiving.grn.create",
      });
      await notifyUser({
        tenantId: ctx.tenantId,
        userId: ctx.requesterId,
        caseId,
        kind: "po.issued.requester",
        title: `${ctx.caseNumber}: the order has gone to the supplier`,
        body: ctx.title ?? undefined,
        href: `/app/cases/${caseId}`,
      });
    }
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order issued." };
}

export async function approvePO(
  poId: string,
  caseId: string,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_approve_po", {
    p_po_id: poId,
  });
  if (error) return { error: error.message, ok: null };
  const ctx = await caseContext(caseId);
  if (ctx) {
    await resolveNotifications(caseId, "po.pending_approval");
    await notifyRole({
      tenantId: ctx.tenantId,
      caseId,
      kind: "po.issued",
      title: `${ctx.caseNumber}: the order is issued — record the goods when they arrive`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
      permission: "receiving.grn.create",
    });
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: ctx.requesterId,
      caseId,
      kind: "po.issued.requester",
      title: `${ctx.caseNumber}: the order has gone to the supplier`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order approved." };
}
