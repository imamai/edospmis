# EDOSPMIS — Enterprise Procurement, Workflow & Service Delivery Platform
## Product Requirements Document (Phase 0 — Discovery)

Status: **Draft for review — no code written yet.**
Table prefix convention: **`edospmis_`** (all tenant-scoped and platform tables).

---

## 1. Executive Summary

EDOSPMIS is a multi-tenant SaaS platform that turns a client request into a
traceable **Case**, and carries that Case through validation, approval,
procurement (RFQ → quotation → evaluation → PO), supplier fulfilment,
receiving/inspection, finance, delivery/service and formal closure — under
configurable workflows, queues, approval chains and SLAs that each tenant
defines for itself. It is not a CRUD app, not a ticketing tool, and not an
accounting system: it is the connective tissue between "someone asked for
something" and "the organization can prove, at any moment, exactly where
that request stands and who owns the next step."

## 2. Problem Statement

Organizations that procure goods/services on behalf of clients (internal or
external) today split this process across email, spreadsheets, paper
approval slips and disconnected point tools (a requisition form here, a
supplier spreadsheet there, WhatsApp for status updates). The result:

- No single place answers "where is request #X right now, and who has it?"
- Approval chains live in people's heads, not in an enforced system —
  approvals get skipped, backdated, or rubber-stamped without visibility.
- Nobody can see SLA risk until a client complains.
- Procurement, receiving and finance records exist in silos, so three-way
  matching (PO vs. goods received vs. invoice) is manual and error-prone or
  skipped entirely.
- Every organization's approval thresholds, departments and procurement
  methods differ — a hard-coded workflow forces the org to bend its process
  to the software, or abandon the software.

## 3. Product Vision

> A client request becomes a Case with a permanent identity. The Case
> travels through the tenant's own configured stages, queues and approvals.
> At every point, any authorized viewer — staff, manager, client — can see
> what has happened, what is happening, what happens next, who owns it, and
> whether it's at risk. The Case cannot close until the tenant's own
> closure conditions are actually met.

## 4. Goals

- G1 — Configurable workflow, approval, queue and SLA engines with **zero
  hard-coded** departments, roles, thresholds or stages.
- G2 — Full lifecycle traceability: Case → PR → RFQ → Quotation → Evaluation
  → PO → GRN → Inspection → Invoice → Delivery → Closure, as one linked
  chain, never disconnected documents.
- G3 — Strict multi-tenant isolation enforced at the database layer (RLS),
  never trusted from the client.
- G4 — An enterprise-credible RBAC + permission model supporting custom
  roles, delegation and segregation of duties.
- G5 — A staff experience where "what do I need to do right now" is the
  first thing anyone sees on login, on desktop and on mobile.
- G6 — A client portal that answers what-did-I-ask / what's-happening /
  what's-needed-from-me without exposing internal detail.
- G7 — An audit trail complete enough to answer "who approved what, when,
  and under which workflow version" for every money-adjacent action.
- G8 — Ship in phases; each phase is independently useful and deployable.

## 5. Non-Goals (explicitly out of scope)

- NG1 — Not a general-ledger/accounting system. Finance module tracks
  invoices, matching and payment status; it is integration-ready toward a
  real accounting/ERP system, not a replacement for one.
- NG2 — Not a public e-procurement marketplace. Suppliers are tenant-scoped
  contacts/vendors, not a cross-tenant marketplace (no shared supplier pool
  across tenants in v1).
- NG3 — No jurisdiction-specific procurement legal compliance (e.g. public
  tender law) baked in by default — configurable procurement methods let a
  tenant model this themselves; the platform does not claim legal compliance
  out of the box.
- NG4 — No native mobile apps in Phase 1–7. Responsive PWA only; native
  wrapper is a Phase 8 evaluation, not a commitment.
- NG5 — No AI auto-approval of money-impacting decisions, ever. AI assists
  and recommends; a human approves.

## 6. Target Users / Personas

| Persona | Summary | Primary need |
|---|---|---|
| **Requester** | Any staff member (or client, where enabled) who raises a request | Fast, simple request creation; visibility into status |
| **Department Manager** | First-line approver, owns a department's spend | See what's waiting on them, approve/reject/return in seconds, from a phone |
| **Procurement Officer** | Runs RFQs, manages suppliers, builds POs | A clear procurement queue, supplier comparison tools, no lost paperwork |
| **Procurement Manager** | Oversees the procurement team, higher approval authority | Pipeline visibility, bottleneck detection, spend oversight |
| **Finance Officer/Manager** | Handles invoices, matching, payment approval | Exception visibility (mismatches), not buried in manual reconciliation |
| **Receiving/Warehouse Officer** | Receives and logs goods | Fast GRN entry against a PO, partial/short/damaged handling |
| **Quality/Inspection Officer** | Verifies goods/services meet spec | Simple accept/reject/partial workflow with evidence capture |
| **Delivery Officer** | Executes final delivery/service to the client | Scheduling, dispatch, proof-of-delivery capture |
| **Client** | The person/org the request is ultimately for | Status transparency, minimal friction, confirm receipt |
| **Tenant Administrator** | Configures the org's entire process | Full control without needing engineering help |
| **Executive/Auditor** | Oversight | Dashboards, spend visibility, full audit trail, no edit rights needed |
| **Platform Super Admin** | EDOS Centre itself, operating the SaaS | Tenant provisioning, platform health, never sees tenant business data unless invited for support |

## 7. Representative User Journeys

**J1 — Simple low-value request (single approval)**
Requester submits PR (KSh 12,000, office supplies) → auto-routes to
Department Manager (amount < tenant's Tier‑1 threshold) → Manager approves
from phone in 90 seconds → PR enters Procurement queue → Officer picks
existing-supplier direct procurement (no RFQ needed, per tenant's
configured method for this category/amount) → PO issued → goods received →
GRN auto-matches PO → no inspection required for this category (tenant
config) → Case closes.

**J2 — High-value multi-approval procurement**
Requester submits PR (KSh 1,200,000, equipment) → sequential approval chain
(Dept Manager → Procurement Manager → Finance Manager → Director, per
tenant's Tier‑3 rule) → each approval recorded with comment + workflow
version → Procurement issues RFQ to 4 suppliers → 3 quotations received →
weighted evaluation scored by 2 evaluators → recommendation approved →
PO issued and versioned → partial delivery received (GRN #1, 60%) →
inspection passes → remainder received later (GRN #2) → invoice arrives →
three-way match: PO vs. GRN(combined) vs. Invoice → discrepancy detected
(invoice quantity ≠ received quantity) → **exception queue**, not silent
approval → Finance resolves with supplier → invoice re-matched → payment
approved → delivery/service scheduled → client confirms receipt with
signature capture → Case closes (all configured closure conditions met).

**J3 — Rejection and correction loop**
Requester submits PR missing budget code → Validation queue flags it →
returned to requester with comment → requester corrects and resubmits →
proceeds normally. Full history of the return/resubmit is preserved on the
Case timeline, not overwritten.

**J4 — SLA breach and escalation**
PR sits in Procurement Manager's approval queue past the tenant's warning
threshold (18h) → in-app + email warning → breach threshold (24h) →
supervisor escalation → still unresolved at 30h → department-head
escalation. Each transition is logged; the Case detail page shows SLA
status plainly at all times.

**J5 — Client self-service**
Client logs into the portal, sees 2 open requests: one "Awaiting your
confirmation" (delivery arrived, needs sign-off) and one "In procurement —
supplier quotations under review, expected 3 more days." Client uploads a
missing specification document requested by procurement. No internal
approval chain, supplier names or margin data is visible to the client.

## 8. Functional Requirements (by module)

Each item below is elaborated architecturally in `ARCHITECTURE.md`; this
section states the requirement, not the implementation.

### 8.1 Case & PR
- FR‑1 (P0): Every request is assigned a permanent, human-readable Case ID
  (`CASE-{year}-{sequence}`) at creation, independent of tenant numbering
  preferences (tenant may configure the display format; the internal ID
  never changes).
- FR‑2 (P0): A PR carries items/services, quantities, specification,
  estimated cost, currency, required date, priority, justification, budget
  reference, department/branch/business-unit/cost-centre, and attachments.
- FR‑3 (P0): PR lifecycle states are tenant-configurable but the platform
  ships a default state machine (Draft → Submitted → Validation → Approval
  → Approved → Procurement → Fulfilment → Delivery → Client Confirmation →
  Completed → Closed) plus exception states (Returned, Rejected, Cancelled,
  On Hold, Blocked, Exception).
- FR‑4 (P1): PRs support versioning on edit while in Draft; once submitted,
  changes are corrections with audit trail, not silent edits.

### 8.2 Workflow Engine
- FR‑5 (P0): Workflow definitions (states, transitions, conditions, gates)
  are stored data, versioned; a running Case is pinned to the workflow
  version it started under.
- FR‑6 (P0): Support sequential and parallel human tasks, automated
  (system) tasks, timers, and conditional branches.
- FR‑7 (P1): Tenant admin can visually/declaratively edit workflow
  definitions without engineering involvement (Phase 2 ships the reusable
  chevron/stepper renderer against server-defined stages; a visual
  drag-and-drop workflow *editor* is a P1 stretch inside that same phase,
  not deferred wholesale).

### 8.3 Approval Engine
- FR‑8 (P0): Approval rules conditioned on amount, department, branch,
  business unit, cost centre, category, supplier, procurement method,
  priority, custom fields — tenant-defined, not hard-coded.
- FR‑9 (P0): Support sequential, parallel/all-required, any-one, and
  majority approval modes.
- FR‑10 (P0): Every decision records approver, role, timestamp, decision,
  comment, workflow version, and relevant document snapshot references.
- FR‑11 (P1): Delegation and temporary acting-approver support, with the
  delegation itself audited.
- FR‑12 (P1): Approval timeout/expiry with configurable auto-escalation.

### 8.4 Segregation of Duties
- FR‑13 (P1): Tenant-configurable conflict rules (e.g., PR creator ≠ PR
  approver; PO creator ≠ PO approver; goods receiver ≠ payment approver).
  System detects and blocks prohibited same-person combinations at the
  point of action, not just in a report.

### 8.5 Queue Engine
- FR‑14 (P0): Named queues per stage (Verification, Approval, Procurement,
  RFQ, Evaluation, PO, Fulfilment, Receiving, Inspection, Invoice, Finance,
  Delivery, Client Confirmation, Exceptions).
- FR‑15 (P0): Assignment strategies: manual, automatic (round-robin,
  workload-balanced, skill/department-based), FIFO, priority, SLA-driven.
- FR‑16 (P0): Each queue entry displays position, Case/PR ref, client,
  priority, age, SLA remaining/status, owner, required action.

### 8.6 SLA & Escalation Engine
- FR‑17 (P0): Per-stage target/warning/breach thresholds, tenant-defined,
  respecting tenant working hours, weekends and holiday calendars (not
  naive 24/7 elapsed time).
- FR‑18 (P0): Multi-level escalation chains, timed, configurable per stage
  and per priority.
- FR‑19 (P1): Department-specific calendars/schedules.

### 8.7 Procurement
- FR‑20 (P0): Configurable procurement methods (existing contract,
  framework agreement, RFQ, competitive quotation, tender, direct,
  emergency, tenant-custom).
- FR‑21 (P0): RFQ creation, supplier invitation, response capture,
  clarifications, side-by-side quotation comparison.
- FR‑22 (P0): Configurable weighted evaluation criteria, multi-evaluator
  scoring, recommendation, approval.
- FR‑23 (P0): PO generation from an approved evaluation/award, versioning,
  amendment, cancellation, partial/full fulfilment tracking.

### 8.8 Supplier Management
- FR‑24 (P0): Supplier profile (legal identity, tax info, contacts,
  categories, addresses, banking, documents, compliance status, contracts).
- FR‑25 (P1): Supplier performance history derived from fulfilment/quality
  data (on-time %, rejection rate, price variance) — computed, not
  self-reported.
- FR‑26 (P2): Supplier self-service portal (RFQ receipt, quotation
  submission, PO acceptance, fulfilment updates, invoice submission).

### 8.9 Receiving / Inspection
- FR‑27 (P0): GRN against a PO with partial/full/short/over/damaged/
  rejected handling, serial/batch capture where applicable.
- FR‑28 (P0): Inspection workflow (technical, quantity, quality, spec
  checks) with accept/reject/partial-accept and photo evidence.

### 8.10 Finance
- FR‑29 (P0): Invoice capture with line items, tax, payment terms.
- FR‑30 (P0): Three-way match (PO vs GRN vs Invoice); any discrepancy
  raises an Exception queue item — **never silently auto-approved**.
- FR‑31 (P1): Payment status tracking; integration-ready export toward an
  external accounting/ERP system rather than native ledger functionality.

### 8.11 Delivery / Service & Closure
- FR‑32 (P0): Assignment, scheduling, dispatch, delivery/service
  execution, proof of delivery (photo, signature, OTP where enabled).
- FR‑33 (P0): Case closure only permitted when tenant-configured closure
  conditions are all satisfied (approval complete, procurement complete, PO
  complete, delivery/service confirmed, inspection complete, client
  accepted, required docs present, finance at an appropriate state, no open
  exception).

### 8.12 Client Portal
- FR‑34 (P0): Create/view requests, view status and (non-internal) history,
  upload documents, respond to queries, confirm delivery/service.

### 8.13 Administration
- FR‑35 (P0): Tenant admin self-service configuration of org structure,
  roles/permissions, approval rules, workflows, queues, SLAs, escalation,
  categories, cost centres, numbering, branding, notification templates —
  every change audited.

### 8.14 Notifications
- FR‑36 (P0): In-app + email; SMS as a configurable channel per
  notification type; templates tenant-editable.

### 8.15 Audit
- FR‑37 (P0): Every significant state change, approval, configuration
  change and financial action is recorded with who/what/when/before/after
  (and why, where a reason is captured). Audit records are append-only from
  the application's perspective.

### 8.16 Reporting/Analytics
- FR‑38 (P1): PR aging, procurement cycle time, approval time, queue wait
  time, SLA compliance/breach, supplier performance, department spend,
  bottleneck views.

### 8.17 AI (forward-looking, not committed to early phases)
- FR‑39 (P2): PR classification, spec/document extraction, supplier
  matching, duplicate detection, SLA-breach prediction — always explainable,
  reviewable, and never auto-deciding on money without human approval.

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Multi-tenancy | Tenant A must never access Tenant B's data, enforced at the database layer (RLS), independently of any application-layer check. Tested explicitly (see §12). |
| Security | RBAC + permission-based authZ; MFA available; encrypted at rest and in transit; no plaintext secrets; input validation at every boundary. |
| Auditability | Every approval/financial/configuration action reconstructable after the fact — actor, timestamp, before/after, workflow version. |
| Availability | Target 99.5% for MVP (single-region managed Postgres + serverless frontend); no formal multi-region HA commitment before Phase 6+. |
| Performance | P0 pages (My Work, Case detail, Queue list) render meaningfully in <2s on typical broadband; API mutations <500ms server time excluding network, for the data volumes of a single mid-size tenant (hundreds of open cases, not millions). |
| Mobile | Every P0 staff and client workflow (approve, view case, confirm delivery) must work on a phone without a native app. |
| Extensibility | New workflow stages, roles, approval conditions addable via tenant configuration, not a code deploy. |
| Data retention | Tenant data retained per tenant's plan; audit logs retained a minimum of 7 years for financial records (configurable per tenant's regulatory need). |

## 10. Sample Acceptance Criteria

**PR Approval**
```
Given a PR requiring manager approval,
When the PR enters the approval queue,
Then the authorized manager receives a task (in-app + configured channel).
The manager can Approve / Reject / Return.
  If approved: PR proceeds to the next configured workflow stage.
  If rejected: PR enters the tenant's configured Rejected state; requester notified.
  If returned: PR enters the tenant's configured Correction state; requester notified with comment.
Every decision is written to the audit log with approver, role, timestamp,
decision, comment, and the workflow version active on the Case.
```

**Three-Way Match Exception**
```
Given a PO for 500 units,
And a combined GRN total of 480 units received,
And an invoice for 500 units,
When the invoice is submitted for matching,
Then the system raises an Exception (quantity mismatch) into the Exception queue
and does NOT mark the invoice as matched or eligible for payment approval
until the exception is resolved by an authorized user, with the resolution
and resolver recorded in the audit log.
```

**Tenant Isolation**
```
Given User U belongs to Tenant A,
When U requests any Case, PR, Supplier, Invoice or Document record,
Then only records where tenant_id = A are returned,
even if U supplies or guesses an ID belonging to Tenant B —
enforced by database row-level security, not only by the API query.
```

## 11. Risk Register

| Risk | Prob. | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Workflow/approval configurability scope creep delays MVP | High | High | Phase 1–2 ship a *default* workflow + a constrained configuration surface (thresholds, chains, stages from a fixed vocabulary); a full visual workflow designer is explicitly P1/Phase-later | Product |
| Tenant data leakage via missed RLS policy on a new table | Med | Critical | RLS policy is part of the table-creation checklist/migration template; isolation test suite runs against every new tenant-scoped table (§12) | Engineering |
| SLA/escalation timing bugs (timezone/holiday-calendar edge cases) | Med | Med | Dedicated SLA calculation unit tests against fixed calendars before Phase 2 sign-off | Engineering |
| Three-way matching false positives erode trust | Med | Med | Configurable tolerance thresholds per tenant (e.g. ±2% quantity/price variance) before flagging | Product |
| Solo/small engineering team over-builds workflow engine (Camunda/Temporal complexity) before it's justified | Med | High | Explicit build-vs-buy decision in `ARCHITECTURE.md` §9 defers Temporal until case volume justifies it | Engineering |
| Mobile approval UX treated as afterthought | Low | High | Mobile is a P0 acceptance criterion on every approval-related feature, not a follow-up pass | Product |
| Segregation-of-duties rules block legitimate small-team tenants (one person wears many hats) | Med | Med | SoD rules are opt-in per tenant, off by default for small tenants, on by default for larger ones | Product |

## 12. Roadmap Summary (see ARCHITECTURE.md §12 for full phase detail)

Phase 0 (this document + ARCHITECTURE.md) → Phase 1 Platform Foundation →
Phase 2 Case+PR+Workflow+Queue+Approval+SLA (MVP) → Phase 3 Procurement
(RFQ/Supplier/PO) → Phase 4 Fulfilment (Receiving/GRN/Inspection/Delivery/
Closure) → Phase 5 Finance+Advanced Controls (3-way match, SoD, delegation)
→ Phase 6 Analytics → Phase 7 Integrations → Phase 8 Mobile polish + AI.

MVP-for-first-paying-tenant = Phases 1–4. Finance/matching (Phase 5) is
what separates "workflow tool" from "procurement platform" and should not
slip past the second paying tenant.
