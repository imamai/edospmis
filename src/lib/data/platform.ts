import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tenant } from "@/lib/database.types";

// Cross-tenant read — only returns rows at all for a platform admin (see
// the edospmis_tenants_select RLS policy, which ORs in
// edospmis_is_platform_admin()). Deliberately doesn't join membership
// counts: edospmis_memberships' own RLS only lets a platform admin see
// members of tenants they actually belong to, so a naive count here would
// silently under-report every other tenant — better to show none than a
// wrong number.
export async function getAllTenants(): Promise<Tenant[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_tenants").select("*").order("created_at");
  return (data ?? []) as Tenant[];
}
