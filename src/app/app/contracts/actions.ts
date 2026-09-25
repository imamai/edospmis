"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify/email";
import type { ContractPartyRole } from "@/lib/database.types";

export interface ContractFormState {
  error: string | null;
  ok: string | null;
}

// The tenant pre-signs first, in-app, before the contract ever goes out —
// that's what makes it a "pre-signed" contract by the time an external
// party sees it. A witness attests the client's signature, so signs after
// them. See ARCHITECTURE.md §4.6's enforced signing order.
const SIGNING_ORDER: Record<ContractPartyRole, number> = {
  tenant_signer: 1,
  client_signer: 2,
  witness: 3,
};

export async function createContract(_prev: ContractFormState, form: FormData): Promise<ContractFormState> {
  const session = await requireSession();
  if (!can(session, "legal.contract.create")) {
    return { error: "You don't have permission to draft contracts.", ok: null };
  }
  const title = String(form.get("title") ?? "").trim();
  const contractType = String(form.get("contract_type") ?? "service_agreement");
  const clientId = String(form.get("client_id") ?? "") || null;
  const templateId = String(form.get("template_id") ?? "") || null;
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
      template_id: templateId,
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
  phone: string,
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
    phone: phone.trim() || null,
    signing_order: SIGNING_ORDER[partyRole],
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

export async function signAsTenant(
  contractId: string,
  partyId: string,
  signedName: string,
  signedTitle: string,
  consented: boolean,
): Promise<ContractFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_contract_signature", {
    p_party_id: partyId,
    p_signed_name: signedName,
    p_signed_title: signedTitle || null,
    p_consented: consented,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/contracts/${contractId}`);
  return { error: null, ok: "Signed." };
}

export async function shareContractLink(contractId: string, partyId: string): Promise<ContractFormState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: contract } = await supabase.from("edospmis_contracts").select("title").eq("id", contractId).maybeSingle();
  const { data: party } = await supabase
    .from("edospmis_contract_parties")
    .select("email, access_token")
    .eq("id", partyId)
    .maybeSingle();
  if (!contract || !party) return { error: "Couldn't find that contract or party.", ok: null };
  if (!party.email) return { error: "This party has no email address on file.", ok: null };
  if (!party.access_token) return { error: "This contract hasn't been sent yet.", ok: null };

  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/sign/${party.access_token}`;
  const result = await sendEmail({
    to: party.email,
    subject: `Please review and sign: ${contract.title}`,
    html: `<p>${session.tenant.name} has sent you a contract to review and sign: <strong>${contract.title}</strong>.</p><p><a href="${link}">Open the contract and sign it here</a></p><p>This link is unique to you and expires in 30 days.</p>`,
  });
  if (!result.ok) return { error: result.error ?? "Couldn't send the email.", ok: null };

  return { error: null, ok: `Emailed to ${party.email}.` };
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
