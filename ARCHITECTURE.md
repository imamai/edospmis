# EDOSPMIS — Architecture Blueprint
## Phase 0 — Discovery & Architecture (companion to PRD.md)

Status: **Draft for review — no application code written yet**, per the
explicit staging instruction this platform was scoped under. Everything
below is a decision record: Decision → Why → Alternatives → Trade-offs →
Recommendation, wherever a real choice existed.

---

## 1. Domain Model

### 1.1 Core entity map

```
Tenant
 └─ BusinessUnit ─ Branch ─ Department ─ Team ─ User
 └─ Role ─ Permission ─ RolePermission ─ UserRole
 └─ Client
 └─ Supplier ─ SupplierContact ─ SupplierDocument
 └─ Category ─ CostCentre ─ Budget
 └─ Case
     └─ PR ─ PRItem
     └─ Approval ─ (ApprovalRule, ApprovalStep templates, resolved at runtime)
     └─ WorkflowInstance (pinned to a WorkflowVersion) ─ WorkflowTask ─ WorkflowTransition
     └─ QueueEntry (current + historical)
     └─ RFQ ─ RFQItem ─ RFQSupplier ─ Quotation ─ QuotationItem
     └─ Evaluation ─ EvaluationCriteria ─ EvaluationScore
     └─ PurchaseOrder ─ POItem
     └─ GRN ─ GRNItem ─ Inspection
     └─ Invoice ─ InvoiceItem ─ MatchException
     └─ Delivery / Service
     └─ Contract ─ ContractVersion ─ ContractParty ─ ContractEvent (Case-linked, optional)
     └─ Document (polymorphic, attached to any of the above)
     └─ Notification (references the Case)
     └─ AuditLog (references the Case + any sub-entity)
 └─ Contract ─ ContractTemplate (a Contract need not have a Case at all —
   e.g. a standalone retainer — so it also hangs directly off Tenant)
 └─ Workflow ─ WorkflowVersion (definition, not instance)
 └─ SLA ─ Escalation (policy definitions)
 └─ Queue (definitions)
 └─ Integration ─ Webhook
```

**Central modelling decision**: a **Case** is the durable identity; a **PR**
is the first document attached to it. RFQs, POs, GRNs, invoices, deliveries
all carry `case_id`, never only a PR reference — so "where is this case"
never requires walking through PR → PO → GRN joins to answer; every
downstream table already points straight back to the Case.

### 1.2 Key entities (columns are representative, not exhaustive)

**`edospmis_tenants`** — id, name, slug, status (active/suspended/trial),
plan, branding jsonb, created_at.

**`edospmis_business_units` / `edospmis_branches` / `edospmis_departments` /
`edospmis_teams`** — each: id, tenant_id, parent references as applicable,
name, code, is_active. Hierarchy is explicit FK chain, not a materialized
path — enterprise orgs re-org occasionally and an explicit chain is easier
to reparent correctly and audit than a path string.

**`edospmis_users`** — id, tenant_id (nullable for platform-level users —
see §4.1), auth_user_id (Supabase Auth uid), email, name, department_id,
branch_id, status, mfa_enabled.

**`edospmis_roles`** — id, tenant_id (null = platform-defined default role,
non-null = tenant-custom role), name, is_system (protects the seeded
defaults like "Tenant Administrator" from deletion).

**`edospmis_permissions`** — id, key (e.g. `procurement.pr.approve`),
category, description. Platform-global, not tenant-scoped — the *catalogue*
of what can be granted is fixed; who has what is per-tenant.

**`edospmis_role_permissions`** (role_id, permission_id) and
**`edospmis_user_roles`** (user_id, role_id, scope_type, scope_id) — scope_type/
scope_id let a role assignment be global-to-tenant, or scoped to one
department/branch/business-unit, which is how "Department Manager for
Branch X only" is expressed without a combinatorial explosion of roles.

**`edospmis_cases`** — id, tenant_id, case_number (display, tenant-formatted),
status, current_stage, current_queue_id, current_owner_id, priority,
client_id, department_id, branch_id, business_unit_id, cost_centre_id,
workflow_version_id, opened_at, closed_at, sla_state (normal/warning/
breached), sla_due_at.

**`edospmis_prs`** — id, tenant_id, case_id, requester_id, category_id,
estimated_cost_cents, currency, required_by, priority, justification,
budget_id, status, version.
**`edospmis_pr_items`** — pr_id, description, qty, unit, spec, estimated_unit_cost_cents.

**`edospmis_workflows`** / **`edospmis_workflow_versions`** — a workflow is a
named process (e.g. "Standard Procurement"); each version holds an
immutable jsonb definition (stages, transitions, gate conditions). A
`edospmis_workflow_instances` row per Case pins `workflow_version_id` at
creation — later edits to the workflow never retroactively alter an
in-flight Case.

**`edospmis_workflow_tasks`** — the human/system task list for an instance:
id, instance_id, stage_key, assignee_id/queue_id, status, due_at,
started_at, completed_at.

**`edospmis_approval_rules`** — tenant-defined condition set (jsonb:
amount range, department, category, etc.) → ordered `edospmis_approval_steps`
(role or specific user, mode: sequential/parallel/any/majority).
**`edospmis_approvals`** — the resolved, per-Case instantiation of the
matched rule at submission time (so a later rule edit doesn't rewrite
history) — each row: step, approver_id, decision, comment, decided_at,
workflow_version_id.

**`edospmis_queues`** (definitions: name, stage_key, assignment_strategy) and
**`edospmis_queue_entries`** (case_id, queue_id, entered_at, position,
assigned_to, sla_due_at) — an entry is closed (not deleted) when the case
leaves the queue, preserving queue-wait-time history for analytics.

**`edospmis_sla_policies`** (per stage: target/warning/breach minutes,
calendar_id) and **`edospmis_calendars`** / **`edospmis_calendar_holidays`**
(tenant- or department-scoped working hours + holiday exceptions) —
elapsed SLA time is always computed against a calendar, never raw
wall-clock, per PRD NFR.

**`edospmis_escalation_policies`** (per SLA policy: ordered escalation
levels, each with a delay and a target role/user) and
**`edospmis_escalations`** (the fired instances, for audit/analytics).

**`edospmis_rfqs`** / **`edospmis_rfq_items`** / **`edospmis_rfq_suppliers`**
(invited suppliers + response status) / **`edospmis_quotations`** /
**`edospmis_quotation_items`**.

**`edospmis_evaluation_criteria`** (tenant-defined, weighted) /
**`edospmis_evaluations`** / **`edospmis_evaluation_scores`**
(evaluator_id, criteria_id, quotation_id, score, comment).

**`edospmis_purchase_orders`** (versioned — `edospmis_po_versions` holds
historical snapshots on amendment) / **`edospmis_po_items`**.

**`edospmis_grns`** / **`edospmis_grn_items`** (ordered_qty, received_qty,
condition: accepted/rejected/damaged/short/over, serial/batch jsonb) /
**`edospmis_inspections`** (grn_id, type, result, comments, evidence via
`edospmis_documents`).

**`edospmis_invoices`** / **`edospmis_invoice_items`** /
**`edospmis_match_exceptions`** (invoice_id, po_id, grn_id, exception_type:
quantity_mismatch/price_mismatch/missing_grn, status, resolved_by,
resolution_note) — three-way matching writes here rather than silently
flipping invoice status; see §5.

**`edospmis_deliveries`** (case_id, scheduled_at, dispatched_at,
delivered_at, proof_type: signature/photo/otp, proof_ref, client_confirmed_at).

**Legal / contract provisioning** (PRD §8.13) — a Lawyer/Advocate drafts and
sends a contract to a client; it may or may not be tied to a Case:

**`edospmis_contract_templates`** — id, tenant_id, name, contract_type
(tenant-defined vocabulary: service_agreement/nda/retainer/
framework_agreement/custom), body (the merge-field source text — content,
not a rendered file), is_active. A contract's first version is normally
rendered from one of these with the client/case's real data merged in,
though a lawyer can also start from a blank draft.

**`edospmis_contracts`** — id, tenant_id, case_id (nullable — a retainer
needs no Case), client_id, contract_number (tenant numbering format, same
pattern as Case numbering), contract_type, title, status (draft /
internal_review / sent / client_review / signed / active / expired /
terminated / superseded / declined), current_version_id, drafted_by,
requires_witness boolean, signing_deadline, effective_date, expiry_date,
voided_reason.

**`edospmis_contract_versions`** — id, contract_id, version_number,
document_id (fk → `edospmis_documents`; the rendered, tenant-branded PDF),
document_hash (sha-256 of the rendered file, so an executed contract can
later be verified byte-for-byte against what was actually signed),
summary_of_changes, created_by. Append-only, same pattern as
`edospmis_po_versions` — a post-signature amendment creates a **new**
version and moves the contract back to a re-signable status; it never
mutates a version that has already been sent or signed.

**`edospmis_contract_parties`** — id, contract_id, party_role
(client_signer / tenant_signer / witness), name, email, phone,
signing_order (enforces, e.g., a witness cannot attest ahead of the party
they're witnessing), access_token + token_expires_at (a client contact or
an external witness is not required to hold a platform account at all —
they reach their own signing step through this single-use secure link,
the same mechanism every real e-signature product uses), consented_electronic
boolean (the affirmative "I agree to sign electronically" step, captured
*before* the signature — never assumed by the act of signing itself),
status (pending/viewed/signed/declined), signed_at, signature_ref (the
evidentiary record — see the build-vs-buy note below), ip_address, user_agent.

**`edospmis_contract_events`** — id, contract_id, event_type (drafted/sent/
viewed/signed/declined/voided/reminder_sent/amended), actor_type (staff/
client/witness/system), actor_label, occurred_at — a **client-visible**
timeline, deliberately separate from the tenant-internal-only
`edospmis_audit_logs`, the same distinction real e-signature products draw
between "activity you can see" and "the vendor's own internal log."

**`edospmis_documents`** (polymorphic: owner_type, owner_id, storage_path,
content_type, uploaded_by, category, version) — see §8.

**`edospmis_notifications`** (recipient_id, case_id, channel, template_key,
payload jsonb, sent_at, read_at).

**`edospmis_audit_logs`** (tenant_id, actor_id, action, entity_type,
entity_id, before jsonb, after jsonb, reason, created_at) — append-only;
see §6.

**`edospmis_events`** — internal event/outbox log (event_type, payload
jsonb, occurred_at, processed_at) — the backbone of the notification engine
and the future integration/webhook dispatcher (§14). This is what makes the
architecture "event-driven modular monolith" rather than a plain monolith:
side effects (notify, escalate, webhook) subscribe to this log instead of
being wired inline into every mutation.

### 1.3 Indexing / soft-delete / versioning conventions

- Every tenant-scoped table: `tenant_id uuid not null` + a composite index
  leading with `tenant_id` on every frequently-filtered column set (e.g.
  `(tenant_id, status, current_owner_id)` on `edospmis_cases`).
- Soft-delete (`is_active` / `archived_at`) on reference data that other
  rows point to (Suppliers, Clients, Categories, Cost Centres, Users) so
  historical Cases keep readable labels after a supplier is retired. Hard
  delete only for draft, never-submitted records with no downstream
  references (e.g. a PR still in Draft).
- Versioning: `edospmis_workflow_versions`, `edospmis_po_versions`, and PR
  edit history (`edospmis_pr_revisions`) are append-only snapshot tables,
  not overwritten rows — this is what lets the audit trail answer "what did
  this look like when it was approved."

---

## 2. Multi-Tenancy Architecture

**Decision: shared database, `tenant_id` column + Postgres Row-Level
Security on every tenant-scoped table, inside the same Supabase project
already hosting the sibling EDOS Centre apps (`edospoa_`, `edoshatch360_`
prefixes) — this platform adds the `edospmis_` prefix to that same project.**

- **Why**: This developer's two sibling SaaS products already run this
  exact pattern in production (prefix-per-app tables in one shared Supabase
  project) and it has held up under real tenants. Reusing it means proven
  operational tooling (backups, RLS patterns, migration workflow) transfers
  directly, and avoids paying for/operating a second Postgres instance for
  what is, at MVP scale, a small amount of data.
- **Alternatives**: (a) Separate Supabase project per app — stronger blast-
  radius isolation between apps, at the cost of a second project to manage,
  secure and pay for, with no isolation benefit *within* this app's own
  tenants either way (that isolation still has to come from RLS regardless
  of which project it lives in). (b) Schema-per-tenant or database-per-
  tenant — the strongest isolation, but operationally heavy (migrations run
  N times, connection pooling gets harder) and unjustified until a tenant
  demands contractual physical isolation.
- **Trade-off accepted**: a bug in RLS policy on an `edospmis_*` table could
  theoretically expose data to another `edospmis_*` tenant (never to
  `edospoa_`/`edoshatch360_` tenants — different table sets entirely, no
  shared queries cross them). This is mitigated by the isolation test suite
  in §12 of PRD.md and a mandatory RLS-policy step in the migration
  checklist (§7).
- **Recommendation**: proceed shared, revisit database-per-tenant only if a
  specific enterprise customer's contract requires physical isolation.

**Enforcement layers** (per the mandatory list — none of these substitute
for another):
1. **Database**: RLS policy on every `edospmis_*` table, keyed off
   `tenant_id = current_setting('request.jwt.claims')::json->>'tenant_id'`
   (Supabase's standard JWT-claim RLS pattern) — this is the *authoritative*
   boundary.
2. **Application**: every server action/route handler resolves
   `session.tenant.id` server-side from the authenticated session, never
   from a client-supplied field, and passes it into every query explicitly
   (defense in depth even though RLS would also catch a mismatch).
3. **API**: same session-derived tenant context on every route handler;
   tenant ID is never accepted as a request parameter for authorization
   purposes.
4. **File/document storage**: Supabase Storage bucket paths are prefixed
   `{tenant_id}/...` and bucket policies mirror the RLS tenant check;
   signed URLs are short-lived, never permanent public paths.
5. **Cache**: any cache key (if/when introduced) is namespaced by
   `tenant_id`; no shared cache entry is ever keyed by a tenant-agnostic key
   for tenant-scoped data.
6. **Background jobs / events**: `edospmis_events` rows carry `tenant_id`;
   the job processor filters and processes per-tenant, never as a global
   unscoped batch that assumes uniformity.
7. **Search**: (Phase 6+) any search index entry is tagged and filtered by
   `tenant_id` before results reach the caller.
8. **Reporting/analytics**: every aggregate query is scoped by the
   authenticated tenant; there is no cross-tenant reporting view in this
   product (platform-level analytics for EDOS Centre's own operations is a
   separate, explicitly platform-only surface — §4.1).

---

## 3. RBAC & Segregation of Duties

- **Permission catalogue** is a fixed, platform-defined list (per PRD §8,
  e.g. `procurement.pr.approve`, `finance.invoice.approve`) — tenants
  cannot invent new permission keys (that would require new enforcement
  code anyway), but **can** invent new roles and assign any subset of the
  existing permissions to them, scoped to a department/branch/business-unit
  via `edospmis_user_roles.scope_*`.
- **Spending authority** is modelled as a special case of approval-rule
  matching (§ ApprovalStep can specify "role X, but only up to amount Y" —
  stored on the step, not as a separate authority table), keeping one
  source of truth for "who can approve what" instead of two systems that
  can drift apart.
- **Segregation of duties**: `edospmis_sod_rules` (tenant-scoped, opt-in per
  PRD risk mitigation) — pairs of actions that must not share an actor on
  the same Case (e.g. `pr.create` + `pr.approve`, `po.create` + `po.approve`,
  `grn.create` + `invoice.approve`). Enforced at the point of action: before
  recording an approval/creation, the system checks whether the acting user
  already performed the conflicting action on *this Case* and blocks with a
  clear message, logging the blocked attempt.
- **Delegation**: `edospmis_delegations` (from_user, to_user, scope,
  starts_at, ends_at, reason) — a delegated approval is recorded as decided
  by the delegate but tagged `on_behalf_of` in the audit entry, never
  silently attributed to the original approver.

---

## 4. Workflow, Queue, Approval & SLA Engines

### 4.1 Camunda vs Temporal vs custom — the required evaluation

| | Camunda (BPMN engine) | Temporal (durable execution) | Custom (Postgres-backed state machine) |
|---|---|---|---|
| Human approvals | First-class, but BPMN authoring has real learning curve | Supported via signals/activities, but it's a general workflow SDK, not approval-shaped out of the box | First-class — this *is* the product's core object model already |
| Long-running workflows | Yes | Yes, this is its design centre | Yes, at the timescales this product needs (hours–weeks, not sub-second) |
| Timers/SLA/escalation | Built-in BPMN timer events | Built-in (durable timers) | Built via `edospmis_sla_policies` + a scheduled ticker — more code, but the calendar-aware SLA math (working hours/holidays) is custom either way, so no engine saves that work |
| Multi-tenancy | Not tenant-aware by default; would need per-tenant process deployment discipline | Not tenant-aware; namespaces help but add operational surface | Native — every row already carries `tenant_id` |
| Operational complexity | Requires running/operating a JVM engine (or Camunda Cloud subscription) | Requires running a Temporal cluster (or Temporal Cloud subscription) — new infra class for this team | None beyond the Postgres + serverless stack already operated for two sibling products |
| Developer experience for this team | Low — no existing JVM/BPMN experience in this portfolio | Medium — Node SDK exists, but a new mental model (workers, activities, determinism rules) | High — same Next.js/Postgres patterns already proven across edos-poa and edoshatch360 |
| Cost | License (self-managed is free but ops-heavy) or Camunda Cloud fee | Temporal Cloud fee, or self-hosted ops burden | Zero incremental infra cost |
| Workflow visibility | Strong built-in tooling (Cockpit) | Strong built-in tooling (Temporal Web UI) | Must be built (the Case timeline + chevron stepper, already required by the UX spec regardless of engine choice) |
| Debugging | Engine-specific tooling to learn | Engine-specific tooling to learn | Plain SQL + application logs — same skills the team already debugs with daily |

**Recommendation: custom, Postgres-backed workflow engine for Phases 1–5.**
Why: the team operating this platform is the same small team running two
other Next.js+Supabase SaaS products with no existing Camunda/Temporal
operational experience; introducing either engine now would mean paying
its full operational tax (a new runtime/cluster to secure, monitor, back up
and understand) before there is workflow volume or complexity (long
parallel sub-processes, cross-organization signalling, needing durable
retries across days of network flakiness) that actually requires it. The
product's own object model (Case, WorkflowInstance, WorkflowTask,
QueueEntry, Approval) already *is* a lightweight workflow engine purpose-
built for exactly this domain, and it reuses infrastructure (Postgres, RLS,
Vercel Cron) the team already operates in production.

**Explicit revisit trigger** (documented so this isn't a "decide once,
forget forever" call): if a tenant needs workflow patterns the custom
engine can't cleanly express — genuine parallel-branch-with-join at scale,
cross-Case sagas, or workflow volume high enough that a scheduled-ticker
SLA scan (§4.4) becomes a real bottleneck — re-evaluate Temporal
specifically (not Camunda — no JVM ops experience to build on, whereas
Temporal has a first-class Node SDK this stack can adopt incrementally).

### 4.2 Workflow engine design (custom)

- A **WorkflowVersion** is a jsonb document: an ordered list of stage
  definitions (`key`, `label`, `type: human_task|system_task|gate|timer`,
  `queue_key`, `sla_policy_key`, transition rules referencing conditions
  evaluated against the Case's fields).
- A **WorkflowInstance** row tracks `current_stage_key`; advancing stages is
  a single server-side transaction: close the current `WorkflowTask` and
  `QueueEntry`, evaluate the next stage's entry condition, open the next
  `WorkflowTask`/`QueueEntry`, write an `edospmis_events` row
  (`case.stage_changed`), write an audit log entry.
- Gate stages (e.g. "all approvals complete?") are evaluated by a pure
  function reading the relevant sub-entities (approvals, GRNs, exceptions)
  — no separate rules engine needed at this scale; conditions are simple
  enough (amount thresholds, required-field presence, all-approved) to be
  plain TypeScript functions keyed by a `condition_key` string stored on the
  stage definition, which is both simpler and more debuggable for this team
  than embedding a generic expression language.

### 4.3 Approval engine

- On PR submission, the matching `edospmis_approval_rule` (highest-priority
  rule whose jsonb conditions match the PR's amount/department/category/
  etc.) is resolved **once** and materialized into concrete
  `edospmis_approvals` rows for this Case — so a later edit to the rule
  never rewrites an in-flight approval chain.
- Sequential steps advance one at a time; parallel/all-required steps open
  simultaneously and the gate waits for all; any-one/majority steps close
  the step as soon as their condition is met and mark the remaining pending
  approvals `superseded` (visible in history, not deleted).

### 4.4 SLA & escalation engine

- `edospmis_sla_policies` define target/warning/breach minutes **as working
  minutes**, resolved against `edospmis_calendars`.
- A scheduled function (Vercel Cron → Route Handler, running every 5
  minutes at MVP scale — cheap, no new infra) scans open `QueueEntry` /
  `WorkflowTask` rows, recomputes elapsed working-time against the
  applicable calendar, updates `sla_state`, and fires
  `edospmis_events` (`sla.warning`, `sla.breached`, `escalation.level_n`)
  which the notification subscriber turns into actual emails/SMS/in-app
  alerts and, per policy, reassigns/escalates the task's owner.
- **Why polling, not a per-row scheduled timer**: at MVP tenant volumes
  (hundreds, not millions, of open items) a 5-minute scan is trivially
  cheap and immensely simpler to reason about, test and debug than
  per-row durable timers — durable timers are exactly the kind of
  complexity Temporal exists to manage well, reinforcing §4.1's "revisit
  Temporal if this stops being cheap" trigger.

### 4.5 Queue engine

- `edospmis_queue_entries` is the single source of truth for "what's
  waiting and for whom" — the My Work view, the queue list view, and SLA
  scanning all read from this one table rather than deriving membership
  from scattered status fields on other entities.
- Assignment strategies are pluggable functions selected by
  `edospmis_queues.assignment_strategy`: `manual`, `fifo`, `round_robin`,
  `workload_balanced` (fewest currently-assigned open entries in that
  queue), `skill_department` (must match assignee's department/category
  skill tags). All are simple, testable, deterministic functions — no ML
  routing in early phases (that's the Phase 8 AI queue-optimization idea,
  explicitly deferred).

### 4.6 Contract execution: branding, signing, witnessing

This is the design behind the entities introduced in §1.2's "Legal /
contract provisioning" block (PRD §8.13).

- **Tenant branding on the rendered document**: `edospmis_tenants.branding`
  jsonb (already part of the Phase 1 schema) holds logo URL, brand color and
  letterhead text, set by a Tenant Administrator. Rendering a contract
  version reads this at render time and stamps it into the PDF's header,
  footer and signature block — two tenants' contracts must never look
  alike, because each tenant is a distinct legal entity issuing its own
  paper, not a platform-branded template. The signature/witness block
  itself is part of the same rendered layout: one block per
  `edospmis_contract_parties` row, laid out in `party_role` order, with the
  witness block only appearing at all when `requires_witness` is true.
- **Signing without a platform account**: a client contact or an external
  witness almost never has (or should need) a login to this platform. Each
  `edospmis_contract_parties` row carries its own single-use
  `access_token`, delivered by email/SMS — the same "click a link, no
  account needed" mechanism every real e-signature product (DocuSign,
  SignWell, …) uses. This is why client/witness signing is **not** gated
  through the internal RBAC permission catalogue in §3 — it isn't a tenant
  staff action at all, it's the named external party's own act on a
  document addressed specifically to them, authorized by possession of
  their token rather than by a role grant.
- **Consent before signature**: `consented_electronic` is captured as its
  own explicit step before the signature itself, not inferred from the act
  of signing — the same affirmative-consent pattern electronic-signature
  law generally expects (this is a UX/evidentiary discipline, not a
  jurisdiction-specific legal claim — see the caveat below).
- **Enforced signing order**: `signing_order` on each party row means the
  platform itself refuses to accept a witness's signature before the party
  they're witnessing has signed (PRD's Witnessed Contract Signing
  acceptance criterion, §10) — this is checked in the same server action
  that records a signature, not left to UI discipline alone.
- **Tamper-evidence**: the executed PDF is hashed
  (`edospmis_contract_versions.document_hash`) the moment every required
  party has signed, so the exact bytes that were signed can be verified
  later against the stored file — before that point, no version is
  considered executed, matching the PRD acceptance criterion that a
  partial signature set never produces an executed document.
- **Build vs buy — signature capture**: the module's first cut (Phase 3)
  ships a typed-name + explicit-consent-checkbox + timestamp + IP
  attestation, clearly disclosed to signers as an electronic signature.
  This is *build*, not buy, because it's cheap, and it is explicitly framed
  as a lower evidentiary bar than a dedicated e-signature provider — the
  fast-follow is integrating a real provider (DocuSign or a lighter API
  such as SignWell/Dropbox Sign) for contracts where a tenant's counsel
  wants stronger evidentiary weight than an in-house attestation gives.
  Buying that integration (rather than building drawn-signature capture,
  identity verification, and provider-grade tamper-sealing in-house) is the
  same build-vs-buy logic already applied to auth, email and SMS in §71 —
  none of that is this platform's core differentiator.
- **Legal caveat, repeated here because it matters**: the platform enforces
  whatever `requires_witness` and signing order a tenant's own counsel
  configures — it does not determine or certify that a given contract type
  is legally sufficient with or without a witness/notarization in any
  jurisdiction. That judgment stays with the Lawyer/Advocate using it (PRD
  Non-Goal NG3).
- **Role scope**: the Lawyer/Advocate role is granted at `scope_type =
  'tenant'` (§1.2/§3), not scoped to one department or branch — counsel
  advises across whichever case or client needs it, regardless of which
  department originated the underlying request, so their grant is
  deliberately tenant-wide rather than following the department-scoped
  pattern used for, e.g., a Department Manager's approval authority.

---

## 5. Three-Way Matching

Matching runs when an invoice is submitted against a PO: sum GRN-received
quantities for that PO, compare to invoice quantity within a
tenant-configured tolerance (default 0%, tenant may set e.g. ±2%); compare
unit price to PO unit price within a configured tolerance. Any breach
writes an `edospmis_match_exceptions` row and the invoice stays in
`pending_exception` — it cannot advance to payment approval until the
exception is resolved by an authorized Finance user, with the resolution
reasoning captured in the audit log. This is a hard gate, not a warning
banner that can be dismissed.

---

## 6. Audit Architecture

- `edospmis_audit_logs`: append-only (enforced by a Postgres rule/trigger
  rejecting UPDATE/DELETE from the application role — only a platform-level
  migration, never app code, can touch existing rows).
- Every server action that mutates a Case, approval, financial record, or
  tenant configuration writes one row: `actor_id`, `action` (dot-namespaced,
  mirroring the permission key vocabulary, e.g. `pr.approved`,
  `po.amended`), `entity_type`, `entity_id`, `before`, `after`, `reason`
  (required for corrections/deletions on money-adjacent records — this
  mirrors the pattern already proven useful in this developer's
  edoshatch360 product), `workflow_version_id` where relevant.
- Audit entries are readable by Auditor/Executive roles and the tenant's
  own admins; never editable by anyone through the application.

---

## 7. Security Architecture

- **AuthN**: Supabase Auth (email/password + MFA; OIDC/SSO as a Phase 5+
  paid-tier feature per tenant demand, not built speculatively now).
- **AuthZ**: RBAC + permission checks server-side on every server
  action/route handler; the frontend hides unauthorized actions for UX
  only, and every check is re-verified server-side per PRD's explicit
  "never trust frontend authorization" rule.
- **Transport/at-rest**: HTTPS everywhere (Vercel default), Postgres
  encryption at rest (Supabase-managed).
- **Secrets**: environment variables via Vercel/Supabase project secrets,
  never committed; `.env.example` documents required keys without values.
- **Input validation**: server-side schema validation (zod) at every
  server action boundary, independent of any client-side form validation.
- **File upload**: Supabase Storage with server-issued signed upload URLs
  scoped to `{tenant_id}/{case_id}/...`; content-type allowlist; virus
  scanning evaluated as a Phase 3+ addition (build vs buy: buy — a scanning
  API/service, not a self-hosted ClamAV instance, given team size).
- **Rate limiting**: at the edge (Vercel) for auth endpoints and public
  client-portal submission endpoints specifically, to blunt credential-
  stuffing and submission-spam without adding infra for every route.
- **Dependency/vulnerability scanning**: GitHub Dependabot (free, already
  zero-config for a GitHub-hosted repo) — buy/adopt over building.

---

## 8. Document Management

- `edospmis_documents` polymorphic table + Supabase Storage, bucket paths
  namespaced `{tenant_id}/{case_id}/{document_id}-{filename}`.
- Signed, short-lived download URLs generated server-side after an
  authorization check against the requesting user's role/scope — never a
  predictable or permanently-public path, per the explicit requirement.
- Versioning: a new upload against the same logical document slot creates a
  new `edospmis_documents` row with `previous_version_id`, not an overwrite.

---

## 9. Notification Architecture

- Subscriber pattern off `edospmis_events`: a small dispatcher reads new
  event rows (again via the same lightweight polling approach as SLA
  scanning — consistent, debuggable, no separate message-queue infra at
  this scale) and, per tenant-configured `edospmis_notification_templates`,
  sends in-app (always) + email (default on) + SMS (opt-in per tenant,
  since it costs money per message).
- **Build vs buy**: email via a transactional provider (Resend/Postmark —
  buy), SMS via a regional aggregator appropriate to the tenant base (e.g.
  Africa's Talking, consistent with this developer's other Kenya-market
  products — buy). Building SMS/email delivery infrastructure in-house is
  not justified at any phase of this roadmap.
- WhatsApp is noted as a future channel (Phase 7 integration candidate),
  not built speculatively now.

---

## 10. UX Architecture

### 10.1 Farmbrite-inspired principles (borrowed patterns, not appearance)

- Persistent left sidebar (desktop/tablet) with collapsible groups, a
  visible search affordance, and a prominent "Quick Add" — reused verbatim
  as *interaction patterns*, restyled entirely in EDOSPMIS's own visual
  language (see design system, §10.3).
- Card-based information density on dashboards; tables reserved for dense
  operational lists (queues, PR lists), never forced onto mobile widths.
- Clear, restrained status coloring — a small fixed semantic palette
  (normal/warning/breach/blocked), not a "rainbow of colors" per the
  explicit constraint.

### 10.2 The chevron workflow stepper (reusable component)

A horizontal stepper: `PR › Verification › Approval › Procurement ›
Supplier › Receiving › Finance › Delivery › Completed`, states
(completed/current/pending/waiting/blocked/rejected/returned/skipped/
cancelled) distinguished by shape + restrained color + icon (never color
alone, for accessibility). Interactive: clicking a completed stage opens
that stage's history in the timeline below, rather than a modal disconnect.

Responsive behavior:
- Desktop/tablet: full horizontal chevrons.
- Mobile: horizontally scrollable compact stepper (current stage
  center-anchored on load), or a compact "Stage 4 of 9 — Procurement"
  progress bar for very narrow widths — never a layout that forces
  horizontal page scroll.

### 10.3 Design system

New, EDOSPMIS-specific token set (typography, spacing, color, and the
component list in PRD §44) built as a small internal package
(`packages/ui` in the repo structure, §13) so it is shared cleanly between
the case-detail workspace, dashboards, and the client portal without
duplicating component code — the same discipline already used for the
"reusable pattern, not copy-paste" component work in this developer's
existing apps.

### 10.4 Case detail — the central workspace

Header (Case ID, client, priority, status, current owner, SLA) → chevron
stepper → summary strip (value, age, SLA, queue, owner, outstanding
action) → tabs (Overview, Items, Approvals, Procurement, Suppliers,
Documents, Receiving, Finance, Delivery, Communication, Audit) → master
chronological timeline. This is the one screen every persona eventually
lands on; it is the first "real" screen built in Phase 2, immediately
after auth/tenant/RBAC foundations.

### 10.5 "My Work"

Login lands on a personalized action list — assigned items, overdue, due
today, awaiting others — sorted by urgency, matching the PRD's explicit
"good morning, James" pattern. This view and the Case detail view are the
two screens held to the highest design bar; everything else (admin config
screens, reports) can be plainer utilitarian CRUD UI without harming the
product's premium feel, since staff live in these two screens all day.

---

## 11. Mobile / PWA Architecture

- Responsive web app first (installable PWA — manifest + service worker
  for offline shell caching of My Work/Case list, not full offline data
  entry in early phases; edoshatch360's IndexedDB-backed offline queue
  pattern is a proven precedent to lift for Phase 8 if a specific
  connectivity-poor tenant needs it, but is not built speculatively now).
- Business logic lives entirely server-side (server actions/route
  handlers); there is exactly one implementation of "can this user approve
  this PR," never a duplicated mobile-vs-web copy to drift apart.
- Mobile approval flow (§ PRD J-journeys and acceptance criteria) is a P0
  acceptance target on the Case detail and Queue views specifically, not a
  generic "responsive CSS" afterthought.

---

## 12. Architecture Style

**Decision: event-driven modular monolith.**

- **Why not microservices**: team size is small; the domain's modules
  (Case/PR, Procurement, Finance, Delivery) are tightly sequential within
  one Case's lifecycle — most calls between them are "the next stage of the
  same transaction," which is exactly the case where network-hop
  microservices add latency and failure modes without a real independent-
  scaling or independent-deployment need at this stage.
- **Why not a plain (non-event) monolith**: side effects — notifications,
  SLA escalation, audit fan-out, future webhooks/integrations — are cleaner
  and more testable as subscribers to an internal `edospmis_events` log
  than as inline side-effect calls scattered through every mutation's code
  path, and this also gives a clean seam to later extract a piece (e.g.
  notifications, or a specific high-volume module) into its own service if
  and when that's actually justified, without a rewrite.
- **Modules within the monolith** (enforced by directory/module boundaries,
  not separate deployables): Identity/Tenant/RBAC, Case/PR/Workflow,
  Queue/SLA/Escalation, Procurement (RFQ/Supplier/PO), Fulfilment
  (GRN/Inspection/Delivery), Finance (Invoice/Matching), Notifications,
  Audit, Reporting.

---

## 13. Technology Stack

| Layer | Choice | Why | Alternative considered | Trade-off |
|---|---|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Directly reuses this team's proven, production-tested pattern from edos-poa/edoshatch360; fast iteration; good PWA support | Separate SPA (React+Vite) + API | No benefit here — Next.js server actions already give the API layer for free |
| Backend | Next.js server actions + route handlers, in the same app (modular monolith) | Matches §12; no second deployable to operate | NestJS/Java/.NET dedicated backend | A dedicated backend buys structure this domain doesn't yet need and costs a second runtime/deploy pipeline this team doesn't currently operate |
| Database | PostgreSQL via Supabase, `edospmis_` prefix in the existing shared project | Proven pattern (§2); RLS, Auth, Storage all bundled | Dedicated Postgres (RDS/Neon) + separate auth | More moving parts, no isolation benefit within this app's own tenants |
| Auth | Supabase Auth | Buy over build — MFA, session management, OIDC path already solved | Keycloak (self-hosted), Auth0 | Both add either ops burden (Keycloak) or cost with no capability gain over what Supabase already provides at this scale |
| File storage | Supabase Storage (S3-compatible) | Same project, same RLS-aligned access model | Raw S3 | No meaningful benefit; adds a second cloud account to secure |
| Workflow engine | Custom, Postgres-backed | See §4.1 in full | Camunda, Temporal | Deferred, not rejected — explicit revisit trigger documented |
| Background/scheduled work | Vercel Cron → route handlers | Zero new infra, same deploy | Dedicated worker process, Redis/BullMQ | Unjustified until job volume/latency needs exceed a 5-minute poll cadence |
| Notifications | Resend/Postmark (email), Africa's Talking-class provider (SMS) | Buy — see §9 | Build SMTP/SMS gateway | Not worth engineering time at any phase here |
| E-signature (fast-follow, §4.6) | In-house attestation first (typed name + consent + IP + hash), then buy a provider (DocuSign / SignWell-class) | Cheap to ship first cut in-house; buy the stronger evidentiary tier once a tenant's counsel needs it — not this platform's differentiator | Build full e-signature (drawn capture, identity verification, provider-grade sealing) in-house | Building the stronger tier in-house would mean re-solving a legally-sensitive problem dedicated vendors already solve well |
| Deployment | Vercel (app) + Supabase (data/auth/storage) | Matches existing operational muscle memory across this developer's portfolio | Self-hosted (Docker/Kubernetes) | Kubernetes explicitly not justified per PRD's own instruction not to default to it |
| Observability | Sentry (errors) + Vercel Analytics + Supabase logs | Buy, fast to wire up, matches team scale | Self-hosted OpenTelemetry/Prometheus/Grafana stack | Real operational overhead unjustified before multi-tenant scale demands it; revisit at Phase 6+ if tenant count grows materially |
| CI/CD | GitHub Actions (lint, typecheck, build, migration check) → Vercel deploy | Free at this scale, integrates with existing GitHub-based workflow | Custom pipeline | No benefit |

---

## 14. API Architecture

REST, versioned under `/api/v1/...`, mirroring the module list:
`/auth`, `/tenants`, `/users`, `/roles`, `/permissions`, `/clients`,
`/suppliers`, `/cases`, `/prs`, `/approvals`, `/workflows`, `/queues`,
`/slas`, `/rfqs`, `/quotations`, `/evaluations`, `/purchase-orders`,
`/grns`, `/invoices`, `/deliveries`, `/documents`, `/notifications`,
`/reports`, `/audit`.

Conventions: cursor-based pagination on all list endpoints; consistent
error shape (`{ error: { code, message, field? } }`); idempotency keys
required on POST endpoints that create financial records (PO issuance,
invoice submission, payment approval) to make client retries safe;
webhooks (`edospmis_webhooks` + signed payloads) as the Phase 7 integration
surface, built on top of the same `edospmis_events` log already powering
notifications internally — one event pipeline, two consumers.

---

## 15. Observability, Backup & Disaster Recovery

- **Observability**: structured logs (Vercel), error tracking (Sentry),
  and a business-facing "Bottlenecks" view (Phase 6 analytics) built from
  `edospmis_queue_entries`/`edospmis_escalations` history — engineers and
  business users read different views of the same underlying event data,
  not two separate systems.
- **Backup**: Supabase managed daily backups + point-in-time recovery
  (available on Supabase's paid tiers) — RPO target ≤ 24h at MVP (PITR
  tightens this once a paying tenant's contract requires it), RTO target
  ≤ 4h for a full project restore.
- **Disaster recovery is not claimed complete until a restore has actually
  been tested** against a scratch project, per the explicit instruction not
  to claim untested DR — this test is a Phase 1 checklist item, not a
  Phase-6 afterthought, since it's cheap to verify early and expensive to
  discover broken late.

---

## 16. Repository Structure

```
edospmis/
  PRD.md
  ARCHITECTURE.md            (this file)
  SECURITY.md                (Phase 1 deliverable)
  MULTI_TENANCY.md           (Phase 1 deliverable)
  RBAC.md                    (Phase 1 deliverable)
  WORKFLOW_ENGINE.md         (Phase 2 deliverable)
  APPROVAL_ENGINE.md         (Phase 2 deliverable)
  QUEUE_ENGINE.md            (Phase 2 deliverable)
  SLA_ENGINE.md              (Phase 2 deliverable)
  DATABASE.md                (Phase 1 deliverable, generated from migrations)
  API.md                     (Phase 1+ deliverable, generated/maintained alongside route handlers)
  AUDIT_LOGGING.md
  NOTIFICATIONS.md
  TESTING.md
  DEPLOYMENT.md
  DEVELOPMENT.md
  src/
    app/                     Next.js App Router (marketing + authenticated app + client portal)
    lib/
      data/                  server-only data-access modules, one per domain module
      workflow/              workflow/approval/queue/SLA engine logic
      audit.ts
      permissions.ts
    components/
  packages/
    ui/                      shared design-system components
  supabase/
    migrations/              edospmis_* table migrations, RLS policies included in the same migration as the table
  tests/
    isolation/                tenant-isolation test suite (§12 PRD — always run against every new table)
```

---

## 17. Testing Strategy Summary

Unit (engine logic: SLA calendar math, approval-rule matching, matching
tolerances) → integration (server actions against a real test Postgres
schema) → **tenant isolation suite** (the one test category the PRD calls
out as non-negotiable: attempt cross-tenant reads/writes for every
tenant-scoped table, assert RLS rejects them) → permission/SoD tests →
workflow/queue/SLA scenario tests (the journeys in PRD §7, encoded as
tests) → accessibility pass on the chevron stepper and My Work view →
mobile-width visual checks on Case detail and approval flows.

---

## 18. Phased Development Plan (detail)

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | This document + PRD.md | Reviewed and approved by the user before any code |
| 1 | Auth, tenant provisioning, org structure, users/roles/permissions, RBAC, audit log plumbing, design system base, CI/CD, DR restore test | A tenant admin can sign up, configure departments/roles, and every action is audited |
| 2 | Case+PR, workflow engine, queue engine, approval engine, SLA engine (default policies), Case detail workspace, chevron stepper, My Work, client portal v1 | A PR can be submitted, approved through a configured chain, and tracked to a generic "fulfilled" close, entirely without procurement/finance modules |
| 3 | Procurement: RFQ, supplier management, quotations, evaluation, PO. **Plus Legal/Contract Provisioning** (§4.6, PRD §8.13): contract templates, tenant-branded rendering, secure-link signing with optional witness step, contract-specific timeline | An approved PR can go through RFQ → PO without leaving the platform; a Lawyer/Advocate can draft, send and get a contract executed (client-signed, witnessed where flagged, hashed) without leaving the platform |
| 4 | Fulfilment: GRN, inspection, delivery, client confirmation, case closure rules | A PO can be received, inspected, delivered and the Case formally closed |
| 5 | Finance: invoices, three-way matching, exceptions; advanced controls: delegation, SoD, advanced SLA/escalation | Three-way match exceptions correctly block payment approval; SoD rules correctly block conflicting actions |
| 6 | Analytics: executive/procurement/department dashboards, bottleneck views | Reporting reads only from already-captured data — no new capture work |
| 7 | Integrations: webhooks, accounting/ERP export, e-signature | At least one real external integration live, not a mock |
| 8 | Mobile polish, PWA offline for key views, AI-assisted classification/extraction (recommend-only) | AI recommendations are explainable and require human approval; no regression to earlier phases |

**MVP for the first paying tenant = Phases 1–4.**

---

## 19. Open Decisions for User Review

Before Phase 1 implementation begins, please confirm or redirect:

1. **Supabase project**: reuse the existing shared project (adding
   `edospmis_` tables alongside `edospoa_`/`edoshatch360_`), per §2's
   recommendation — or provision a dedicated Supabase project for this
   platform instead?
2. **First tenant**: is EDOS Centre itself the first tenant (dogfooding its
   own procurement), or is there an external pilot tenant already lined up?
   This affects how much Phase 1 admin self-service needs to be truly
   turnkey vs. hand-held.
3. **SMS provider**: confirm Africa's Talking (or name a preferred
   provider) so Phase 5 notification work targets the right integration.
4. **Numbering/branding**: any existing case/PR numbering convention to
   match, or is `CASE-{year}-{seq}` / tenant-configurable fine as the
   default?

No implementation work starts until these are resolved or you say to
proceed with the stated recommendations as defaults.
