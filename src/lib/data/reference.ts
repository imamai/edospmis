import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  Client,
  BusinessUnit,
  Branch,
  Department,
  Team,
  Queue,
  Placement,
  PlacementOptions,
} from "@/lib/database.types";

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

/**
 * Everything a placement can be chosen from, in one round trip.
 *
 * The four lists are small — an organisation has tens of departments, not
 * thousands — so they are fetched whole and cascaded in the browser rather
 * than re-queried each time a select changes. That keeps the picker instant
 * and means a half-made choice never needs a server round trip to show its
 * consequences.
 */
export async function getPlacementOptions(
  tenantId: string,
  includeInactive = false,
): Promise<PlacementOptions> {
  const [businessUnits, branches, departments, teams] = await Promise.all([
    getBusinessUnits(tenantId, includeInactive),
    getBranches(tenantId, includeInactive),
    getDepartments(tenantId, includeInactive),
    getTeams(tenantId, includeInactive),
  ]);
  return { businessUnits, branches, departments, teams };
}

/**
 * Where this person sits, for defaulting a request they raise.
 *
 * Null where they have never been placed, which is the honest answer — a
 * request should not be filed against a department simply because it was the
 * first one in the list.
 */
export async function getMyPlacement(tenantId: string, userId: string): Promise<Placement | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_memberships")
    .select("business_unit_id, branch_id, department_id, team_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    business_unit_id: data.business_unit_id,
    branch_id: data.branch_id,
    department_id: data.department_id,
    team_id: data.team_id,
  };
}
