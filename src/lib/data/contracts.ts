import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Contract, ContractEvent, ContractParty, ContractTemplate } from "@/lib/database.types";

export interface ContractRow extends Contract {
  client_name: string | null;
}

export async function getContracts(tenantId: string): Promise<ContractRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_contracts")
    .select("*, edospmis_clients(name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => {
    const client = c.edospmis_clients as unknown as { name: string } | null;
    return { ...(c as unknown as Contract), client_name: client?.name ?? null };
  });
}

export interface ContractDetail {
  contract: Contract;
  parties: ContractParty[];
  clientName: string | null;
  events: ContractEvent[];
}

export async function getContractDetail(tenantId: string, contractId: string): Promise<ContractDetail | null> {
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("edospmis_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!contract) return null;

  const [{ data: parties }, { data: client }, { data: events }] = await Promise.all([
    supabase.from("edospmis_contract_parties").select("*").eq("contract_id", contractId).order("signing_order").order("created_at"),
    contract.client_id
      ? supabase.from("edospmis_clients").select("name").eq("id", contract.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("edospmis_contract_events").select("*").eq("contract_id", contractId).order("occurred_at", { ascending: false }),
  ]);

  return {
    contract: contract as Contract,
    parties: (parties ?? []) as ContractParty[],
    clientName: client?.name ?? null,
    events: (events ?? []) as ContractEvent[],
  };
}

export async function getContractTemplates(tenantId: string): Promise<ContractTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_contract_templates")
    .select("*")
    .eq("is_active", true)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("tenant_id", { ascending: true, nullsFirst: true })
    .order("name");
  return (data ?? []) as ContractTemplate[];
}
