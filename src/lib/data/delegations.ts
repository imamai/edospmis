import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Delegation } from "@/lib/database.types";

export interface DelegationRow extends Delegation {
  role_name: string;
  from_name: string;
  to_name: string;
}

export async function getDelegations(tenantId: string): Promise<DelegationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_delegations")
    .select(
      "*, edospmis_roles(name), from_user:edospmis_users!edospmis_delegations_from_user_id_fkey(full_name, email), to_user:edospmis_users!edospmis_delegations_to_user_id_fkey(full_name, email)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((d) => {
    const role = d.edospmis_roles as unknown as { name: string } | null;
    const fromUser = d.from_user as unknown as { full_name: string | null; email: string } | null;
    const toUser = d.to_user as unknown as { full_name: string | null; email: string } | null;
    return {
      ...(d as unknown as Delegation),
      role_name: role?.name ?? "",
      from_name: fromUser?.full_name ?? fromUser?.email ?? "",
      to_name: toUser?.full_name ?? toUser?.email ?? "",
    };
  });
}
