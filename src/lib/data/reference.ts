import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Category, Client } from "@/lib/database.types";

export async function getCategories(tenantId: string, includeInactive = false): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_categories").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Category[];
}

export async function getClients(tenantId: string, includeInactive = false): Promise<Client[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_clients").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Client[];
}
