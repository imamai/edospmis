import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Category, Client, BusinessUnit, Branch, Department, Team, Queue } from "@/lib/database.types";

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

export async function getBusinessUnits(tenantId: string, includeInactive = false): Promise<BusinessUnit[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_business_units").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as BusinessUnit[];
}

export async function getBranches(tenantId: string, includeInactive = false): Promise<Branch[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_branches").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Branch[];
}

export async function getDepartments(tenantId: string, includeInactive = false): Promise<Department[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_departments").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Department[];
}

export async function getTeams(tenantId: string, includeInactive = false): Promise<Team[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_teams").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Team[];
}

export async function getQueues(tenantId: string): Promise<Queue[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_queues").select("*").eq("tenant_id", tenantId).order("name");
  return (data ?? []) as Queue[];
}
