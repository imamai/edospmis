"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import type { ContractPartyRole } from "@/lib/database.types";

export interface ContractFormState {
  error: string | null;
  ok: string | null;
}

export async function createContract(_prev: ContractFormState, form: FormData): Promise<ContractFormState> {
  const session = await requireSession();
  if (!can(session, "legal.contract.create")) {
    return { error: "You don't have permission to draft contracts.", ok: null };
  }
  const title = String(form.get("title") ?? "").trim();
  const contractType = String(form.get("contract_type") ?? "service_agreement");
  const clientId = String(form.get("client_id") ?? "") || null;
  const requiresWitness = form.get("requires_witness") === "on";
  const body = String(form.get("body") ?? "");
  if (!title) return { error: "Give the contract a title.", ok: null };

  const supabase = await createClient();
  const { data: contract, error } = await supabase
    .from("edospmis_contracts")
    .insert({
      tenant_id: session.tenant.id,
      title,
      contract_type: contractType,
      client_id: clientId,
      requires_witness: requiresWitness,
      body,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !contract) return { error: "Couldn't create that contract.", ok: null };

  redirect(`/app/contracts/${contract.id}`);
}

export async function updateContractBody(contractId: string, body: string): Promise<ContractFormState> {
  const session = await requireSession();
  if (!can(session, "legal.contract.edit")) {
    return { error: "You don't have permission to edit contracts.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_contracts")
    .update({ body })
    .eq("id", contractId)
    .eq("tenant_id", session.tenant.id)
    .eq("status", "draft");
  if (error) return { error: "Couldn't save changes — is this contract still a draft?", ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Saved." };
}

export async function addContractParty(
  contractId: string,
  partyRole: ContractPartyRole,
  name: string,
  email: string,
): Promise<ContractFormState> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a name.", ok: null };
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_contract_parties").insert({
    tenant_id: session.tenant.id,
    contract_id: contractId,
    party_role: partyRole,
    name: name.trim(),
    email: email.trim() || null,
  });
  if (error) return { error: "Couldn't add that party.", ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Party added." };
}

export async function removeContractParty(contractId: string, partyId: string): Promise<ContractFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_contract_parties").delete().eq("id", partyId);
  if (error) return { error: "Couldn't remove that party.", ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Removed." };
}

export async function sendContract(contractId: string): Promise<ContractFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_send_contract", { p_contract_id: contractId });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Contract sent." };
}

export async function recordContractSignature(contractId: string, partyId: string): Promise<ContractFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_contract_signature", { p_party_id: partyId });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Signature recorded." };
}

export async function voidContract(contractId: string, reason: string): Promise<ContractFormState> {
  await requireSession();
  if (!reason.trim()) return { error: "Say why this contract is being voided.", ok: null };
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_void_contract", { p_contract_id: contractId, p_reason: reason });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Contract voided." };
}
