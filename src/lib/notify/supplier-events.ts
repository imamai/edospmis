import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRole } from "@/lib/notify/notifications";

/**
 * Something a supplier did, told to the people who have to act on it.
 *
 * The supplier has no session, so the case behind the token has to be found
 * with the service role — and the notification itself runs the same way. What
 * does not change is who hears about it: still only members of the buying
 * tenant holding the permission.
 *
 * Never throws. A supplier who has just submitted a tender must not be shown
 * an error because our side failed to tell somebody about it.
 */
export async function notifyBySupplierToken(
  token: string,
  input: { kind: string; title: string; permission: string },
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("edospmis_rfq_suppliers")
      .select("edospmis_rfqs(case_id, tenant_id, edospmis_cases(case_number))")
      .eq("access_token", token)
      .maybeSingle();
    if (!data) return;

    const one = <T>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

    const rfq = one(
      (
        data as unknown as {
          edospmis_rfqs:
            | { case_id: string; tenant_id: string; edospmis_cases: unknown }
            | { case_id: string; tenant_id: string; edospmis_cases: unknown }[]
            | null;
        }
      ).edospmis_rfqs,
    );
    if (!rfq) return;

    const caseRow = one(
      rfq.edospmis_cases as
        { case_number: string } | { case_number: string }[] | null,
    );

    await notifyRole({
      tenantId: rfq.tenant_id,
      caseId: rfq.case_id,
      kind: input.kind,
      title: `${caseRow?.case_number ?? "A tender"}: ${input.title}`,
      href: `/app/cases/${rfq.case_id}`,
      permission: input.permission,
      fromSupplier: true,
    });
  } catch (cause) {
    console.error(
      `EDOSPMIS supplier notification (${input.kind}) failed:`,
      cause,
    );
  }
}
