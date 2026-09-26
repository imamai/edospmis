export type TenantStatus = "trial" | "active" | "suspended";
export type MembershipStatus = "invited" | "active" | "suspended";
export type RoleScopeType = "tenant" | "business_unit" | "branch" | "department";

export interface TenantBranding {
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  registration_number?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  branding: TenantBranding;
  numbering_format: string;
  case_sequence: number;
  requires_po_approval: boolean;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  last_tenant_id: string | null;
  signature_image: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  tenant_id: string;
  status: MembershipStatus;
  invited_by: string | null;
  department_id: string | null;
  branch_id: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  category: string;
  description: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id: string;
  scope_type: RoleScopeType;
  scope_id: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  business_unit_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

/** A role joined to the set of permission keys it grants, for the Roles admin screen. */
export interface RoleWithPermissions extends Role {
  permission_keys: string[];
}

/** A tenant member row shaped for the Users admin screen. */
export interface MemberRow {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: MembershipStatus;
  roles: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ *
 * Phase 2 — Case / PR / Workflow / Queue / Approval / SLA
 * ------------------------------------------------------------------ */

export type CaseStatus =
  | "draft"
  | "submitted"
  | "approval"
  | "approved"
  | "rejected"
  | "returned"
  | "cancelled"
  | "procurement"
  | "po_approval"
  | "awarded"
  | "receiving"
  | "finance"
  | "delivery"
  | "closed";
export type PRStatus = "draft" | "submitted" | "approved" | "rejected" | "returned" | "cancelled";
export type Priority = "low" | "normal" | "high" | "urgent";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "returned";

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface BusinessUnit {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  business_unit_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  business_unit_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  tenant_id: string;
  department_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Queue {
  id: string;
  tenant_id: string;
  name: string;
  stage_key: string;
  assignment_strategy: string;
  created_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PRItem {
  description: string;
  qty: number;
  unit: string;
  estimated_unit_cost_cents: number;
}

export interface Case {
  id: string;
  tenant_id: string;
  case_number: string;
  client_id: string | null;
  department_id: string | null;
  status: CaseStatus;
  current_stage_key: string;
  workflow_version_id: string | null;
  priority: Priority;
  created_by: string | null;
  opened_at: string;
  closed_at: string | null;
  on_hold: boolean;
  on_hold_reason: string | null;
  blocked: boolean;
  blocked_reason: string | null;
}

export interface CaseStageHistory {
  id: string;
  tenant_id: string;
  case_id: string;
  stage_key: string;
  entered_at: string;
  left_at: string | null;
}

export interface PR {
  id: string;
  tenant_id: string;
  case_id: string;
  requester_id: string;
  category_id: string | null;
  client_id: string | null;
  department_id: string | null;
  title: string;
  justification: string | null;
  items: PRItem[];
  estimated_cost_cents: number;
  currency: string;
  required_by: string | null;
  priority: Priority;
  status: PRStatus;
  created_at: string;
}

export interface WorkflowStageDef {
  key: string;
  label: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  definition: { stages: WorkflowStageDef[] };
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  tenant_id: string;
  name: string;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalStep {
  id: string;
  rule_id: string;
  step_order: number;
  role_id: string;
}

export interface Approval {
  id: string;
  tenant_id: string;
  case_id: string;
  rule_id: string;
  step_order: number;
  role_id: string;
  status: ApprovalDecision;
  comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  workflow_version_id: string | null;
  created_at: string;
}

/** A pending approval task, shaped for the My Work list. */
export interface MyWorkItem {
  approval_id: string;
  case_id: string;
  case_number: string;
  pr_title: string;
  estimated_cost_cents: number;
  currency: string;
  priority: Priority;
  role_name: string;
  due_at: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Phase 3a — Procurement: Supplier / RFQ / Quotation / Evaluation / PO
 * ------------------------------------------------------------------ */

export type RfqStatus = "open" | "closed" | "cancelled";
export type POStatus = "pending_approval" | "issued" | "cancelled";

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Rfq {
  id: string;
  tenant_id: string;
  case_id: string;
  title: string;
  items: PRItem[];
  closing_date: string | null;
  status: RfqStatus;
  created_by: string | null;
  created_at: string;
}

export interface QuotationLinePrice {
  description: string;
  qty: number;
  unit: string;
  unit_price_cents: number;
}

export type QuotationSource = "staff" | "supplier_portal";

export interface Quotation {
  id: string;
  tenant_id: string;
  rfq_id: string;
  supplier_id: string;
  total_cents: number;
  currency: string;
  notes: string | null;
  submitted_via: QuotationSource;
  line_prices: QuotationLinePrice[] | null;
  submitted_at: string;
  created_by: string | null;
  created_at: string;
}

export type RfqInviteStatus = "invited" | "viewed" | "submitted" | "declined";

export interface RfqInvite {
  id: string;
  tenant_id: string;
  rfq_id: string;
  supplier_id: string | null;
  invite_name: string | null;
  invite_email: string | null;
  invite_phone: string | null;
  access_token: string;
  token_expires_at: string;
  status: RfqInviteStatus;
  viewed_at: string | null;
  responded_at: string | null;
  invited_at: string;
}

export interface Evaluation {
  id: string;
  tenant_id: string;
  rfq_id: string;
  selected_quotation_id: string;
  notes: string | null;
  decided_by: string | null;
  decided_at: string;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  case_id: string;
  rfq_id: string | null;
  supplier_id: string;
  po_number: string;
  items: PRItem[];
  total_cents: number;
  currency: string;
  status: POStatus;
  expected_delivery_date: string | null;
  issued_by: string | null;
  issued_at: string;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Phase 3b — Legal / Contract Provisioning (v1 cut)
 * ------------------------------------------------------------------ */

export type ContractStatus = "draft" | "sent" | "signed" | "void";
export type ContractPartyRole = "client_signer" | "tenant_signer" | "witness";
export type ContractPartyStatus = "pending" | "viewed" | "signed" | "declined";

export interface Contract {
  id: string;
  tenant_id: string;
  case_id: string | null;
  client_id: string | null;
  template_id: string | null;
  contract_type: string;
  title: string;
  body: string;
  requires_witness: boolean;
  status: ContractStatus;
  voided_reason: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
}

export interface ContractParty {
  id: string;
  tenant_id: string;
  contract_id: string;
  party_role: ContractPartyRole;
  name: string;
  email: string | null;
  phone: string | null;
  status: ContractPartyStatus;
  signing_order: number;
  consented_electronic: boolean;
  access_token: string | null;
  token_expires_at: string | null;
  signed_name: string | null;
  signed_title: string | null;
  signature_image: string | null;
  ip_address: string | null;
  user_agent: string | null;
  viewed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface ContractTemplate {
  id: string;
  tenant_id: string | null;
  name: string;
  contract_type: string;
  body_template: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ContractEvent {
  id: string;
  tenant_id: string;
  contract_id: string;
  event_type: string;
  actor_type: "staff" | "client" | "witness" | "system";
  actor_label: string | null;
  occurred_at: string;
}

/* ------------------------------------------------------------------ *
 * Phase 4 — Fulfilment: GRN / Inspection / Delivery / Case closure
 * ------------------------------------------------------------------ */

export type GrnStatus = "recorded" | "inspected";
export type GrnItemCondition = "accepted" | "rejected" | "damaged" | "short" | "over";
export type InspectionResult = "pass" | "fail" | "conditional";
export type DeliveryStatus = "scheduled" | "dispatched" | "delivered" | "confirmed" | "cancelled";
export type ProofType = "signature" | "photo" | "otp" | "none";

export interface GrnItem {
  id: string;
  grn_id: string;
  description: string;
  unit: string | null;
  ordered_qty: number;
  received_qty: number;
  condition: GrnItemCondition;
  notes: string | null;
}

export interface Grn {
  id: string;
  tenant_id: string;
  case_id: string;
  po_id: string;
  grn_number: string;
  status: GrnStatus;
  notes: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
}

export interface Inspection {
  id: string;
  tenant_id: string;
  grn_id: string;
  result: InspectionResult;
  comments: string | null;
  evidence_ref: string | null;
  inspected_by: string | null;
  inspected_at: string;
}

export interface Delivery {
  id: string;
  tenant_id: string;
  case_id: string;
  status: DeliveryStatus;
  scheduled_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  proof_type: ProofType | null;
  proof_ref: string | null;
  client_confirmed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Phase 5 — Finance (Invoice + Three-Way Match) + Advanced Controls
 * ------------------------------------------------------------------ */

export type InvoiceStatus = "submitted" | "matched" | "exception" | "approved" | "paid" | "void";
export type MatchExceptionType = "quantity_mismatch" | "price_mismatch" | "missing_grn";
export type MatchExceptionStatus = "open" | "resolved";

export interface InvoiceItem {
  description: string;
  qty: number;
  unit: string;
  unit_cost_cents: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  case_id: string;
  po_id: string;
  supplier_id: string;
  invoice_number: string;
  items: InvoiceItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  payment_terms: string | null;
  due_date: string | null;
  status: InvoiceStatus;
  submitted_by: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  payment_method: string | null;
  created_at: string;
}

export interface MatchException {
  id: string;
  tenant_id: string;
  invoice_id: string;
  po_id: string;
  grn_id: string | null;
  exception_type: MatchExceptionType;
  detail: string;
  status: MatchExceptionStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface SodSettings {
  tenant_id: string;
  pr_requester_not_approver: boolean;
  receiver_not_payment_approver: boolean;
}

export interface Delegation {
  id: string;
  tenant_id: string;
  role_id: string;
  from_user_id: string;
  to_user_id: string;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

/* ------------------------------------------------------------------ *
 * Phase 7 — Integrations: webhooks + accounting export
 * ------------------------------------------------------------------ */

export interface Webhook {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  event_prefixes: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  tenant_id: string;
  event: string;
  payload: Record<string, unknown>;
  request_id: number | null;
  response_status: number | null;
  response_body: string | null;
  checked_at: string | null;
  created_at: string;
}
