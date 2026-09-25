# EDOSPMIS

Enterprise Procurement, Workflow, Queue and Service Delivery Management
Platform — multi-tenant SaaS. See [PRD.md](PRD.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) for the full product and technical
blueprint; this file only covers running what's built so far.

## Phase status

**Phase 1 — Platform Foundation: implemented.**

- Supabase Auth (email/password), tenant sign-up and provisioning
  (`edospmis_provision_tenant`, one transaction: tenant row, membership,
  a starter set of 10 tenant-scoped roles seeded from the PRD's persona
  list, Tenant Administrator assignment).
- Multi-tenant org structure tables (business units, branches,
  departments, teams) — schema and RLS only; an admin UI for these lands
  with Phase 2's Case module, which is what actually needs them.
- RBAC: a fixed 41-key permission catalogue (includes `legal.contract.*`,
  seeded ahead of the module itself — see below), tenant-scoped custom
  roles, a Roles admin screen (create a role, toggle its permissions by
  category, delete an unused custom role — system roles are read-only).
- Users admin screen: invite a teammate by email (real Supabase Auth
  invite, not a mock — `/update-password` is where they land after
  accepting), change their role, suspend/reactivate.
- Audit log (`edospmis_audit_logs`) — every invite, role change, role
  permission change, suspension and tenant-provisioning event is written
  here; nothing updates or deletes an existing row.
- Sidebar (desktop/tablet) + a collapsible mobile nav, both driven by the
  signed-in user's actual permissions — a nav item simply doesn't render
  if they can't use it.
- "My Work" home screen — currently an empty state by design: there is
  nothing to assign yet until Phase 2 ships Cases/PRs. The greeting, role
  badges and layout it sits in are the real Phase-2 destination already
  wired up.

**Phase 2 — Case + PR + Workflow + Queue + Approval + SLA (MVP): implemented.**

- Cases and PRs: a PR is drafted with dynamic line items, opens a Case
  with a tenant-formatted case number (`CASE-{year}-{seq}`, atomically
  sequenced), and is submitted for approval from the Case detail page.
- Workflow engine: a default `draft → approval → approved` workflow is
  seeded per tenant, versioned and stored as data (`edospmis_workflow_versions.definition`)
  so the Case detail chevron (`WorkflowStepper`) reads real stage labels —
  see ARCHITECTURE.md §1.2/§4.2 for the scope cut (procedural, not a fully
  generic interpreter yet).
- Approval engine: tenant-configurable, amount-tiered rules with ordered
  role steps (Approval Rules admin screen); `edospmis_submit_pr` and
  `edospmis_decide_approval` run the chain as single atomic transactions.
- Queue + SLA: role-based queue entries; SLA status is computed live from
  a stored due timestamp (no calendar or escalation ticker yet — plain
  wall-clock, see the 0003 migration header for the full list of
  deliberate cuts).
- My Work now shows real pending-approval tasks with live SLA status,
  replacing Phase 1's empty state.
- Clients are a lightweight staff-managed reference list (no client
  login/portal yet — that's separate work comparable in size to the
  Phase 3 contract-signing tokens below).
- Verified live end-to-end against the shared Supabase project: signup →
  provision → PR → submit → approve → case closed out as Approved, plus a
  cross-tenant isolation check. This pass also caught and fixed a real gap
  before commit — see `0004_admin_holds_dept_manager.sql`.

**Phase 3 — Procurement + Legal/Contract Provisioning: implemented (v1 cuts).**

- Procurement: an approved case gets a "Start procurement" button (visible
  to whoever holds `procurement.rfq.create`), which opens an RFQ seeded
  from the PR's own items. From the Case detail page's Procurement panel:
  invite suppliers, record what they quoted, and award — issuing a PO
  (`PO-2026-000001`, derived from the case number) and moving the case to
  Awarded. Suppliers get their own admin screen, same pattern as Clients.
- Legal/Contract Provisioning v1: a Lawyer/Advocate drafts a contract body
  as plain text, adds signing parties (client signer / tenant countersigner
  / witness), sends it, and staff record each signature as it comes back —
  the contract flips to Signed automatically the moment every party has.
  This is the first, honest slice of the full model ARCHITECTURE.md §4.6
  already designed — no templates, no tenant-branded/hashed PDF rendering,
  no secure external no-login signing link yet. Those remain real,
  separate follow-up work, not a shortcut around the design.
- Verified live end-to-end: a disposable tenant ran the complete
  PR → approval → procurement → PO-awarded path, and separately a two-party
  (including a witness) contract from draft through fully signed — both
  against the shared Supabase project before commit.

**Phase 4 — Fulfilment: implemented (v1 cuts).**

- Receiving: once a case is Awarded, a Receiving Officer records a GRN
  against the PO's own items — received qty and condition
  (accepted/short/over/damaged/rejected) per line, numbered `GRN-2026-000001`
  off the case number (`-01`, `-02`, ... for partial/repeat receipts). The
  case moves to Receiving on the first GRN.
- Inspection: whoever holds `receiving.grn.approve` records one pass/fail/
  conditional outcome per GRN, with comments and a free-text evidence
  reference — no file upload yet (see the migration header), so a report
  number or photo filename stands in for an attached document.
- Delivery / Service: a Delivery Officer schedules a delivery (or a service
  completion date), marks it dispatched, then confirms it with an optional
  proof type (signature/photo/OTP) and reference — one delivery per case in
  this v1, staff-recorded client confirmation (no client portal yet, same
  stand-in shape Phase 3's contract signatures already use).
- Case closure: an explicit "Close case" action, gated on
  `procurement.case.close` and the case not already being in a terminal
  state — deliberately not hard-blocked on "delivery confirmed", since a
  case can legitimately end without one (a services-only PR, a client
  collecting in person). The Case detail screen nudges toward closing after
  delivery confirms; it never refuses the button.
- The chevron now reads all the way to Completed for any case created from
  now on (`Draft › Approval › Approved › Procurement › Awarded › Receiving
  › Delivery › Completed` — Finance is Phase 5, not in this chevron yet).
  Existing tenants' default workflow was also given this fuller stage list
  via a new workflow version, so this applies to their next case too, not
  only brand-new tenants.
- Verified end-to-end against the shared Supabase project via a disposable
  tenant: the full PR → approval → procurement → award → GRN → inspection →
  delivery → confirmed → closed path, plus the negative paths (duplicate
  inspection, confirming before dispatch, re-closing a closed case all
  correctly rejected) and the audit trail recording every step.

**Phase 5 — Finance + Advanced Controls: implemented (v1 cuts).**

- Invoice + three-way match: a Finance Officer submits a supplier invoice
  against an awarded PO's own items; on submission the platform compares
  invoice total to PO total and total invoiced quantity to total received
  quantity across the case's GRNs, and flags a missing GRN entirely — any
  mismatch opens a match exception and the invoice is never silently
  auto-approved. A Finance Manager resolves each exception with a note;
  once every exception on an invoice is resolved it becomes ready for
  approval, then payment (status + reference only — no ledger or gateway).
- Segregation of duties: two tenant-toggleable rules, both **off by
  default** — a PR's requester cannot approve their own request, and
  whoever recorded a case's GRN cannot also approve that case's invoice for
  payment. Enforced at the point of action inside the same RPCs that
  already run the approval/invoice-approval logic, not as a report.
- Delegation: any user can temporarily hand a role they hold to a teammate
  for a date range; `edospmis_decide_approval` now honours an active
  delegation the same way it honours directly holding the role, drawing
  the permission from the delegated role itself so the delegate doesn't
  need to separately hold it. Delegating and revoking are both audited.
- The chevron now includes Finance, between Receiving and Delivery, for
  any case created from now on — existing tenants' default workflow again
  got a new version with the fuller stage list, same mechanism Phase 4
  used.
- Verified end-to-end via a disposable tenant with **two** real user
  accounts (segregation of duties and delegation both need a genuine
  second identity to test honestly): a self-approval correctly blocked and
  then approved by someone else, a role exercised purely through an active
  delegation (with the directly-held role removed first to prove it), a
  revoked delegation confirmed inert, an invoice that started with a
  missing-GRN exception through to resolved → matched, a second invoice
  against an already-invoiced PO correctly rejected, a clean invoice
  matching immediately with no exceptions, a GRN receiver correctly
  blocked from approving their own invoice's payment, and the full
  approve → pay path with the case landing in the `finance` stage. One
  real design bug was caught and fixed during this pass: delegation was
  only granted routing authority, not the underlying permission check, so
  a delegate with no independent grant on the delegated permission could
  never actually act — fixed by drawing the permission from the delegated
  role rather than the acting user's own role set.

**Flow Alignment — implemented.** A real client's own turnaround-time
export (SAP Business One PR/PO/GRPO day-counts) and their target 12-stage
procure-to-pay diagram were audited against the build above; this closed
the gaps that came out of it, fitted additively rather than as a rework:

- **Per-stage timing** (`edospmis_case_stage_history`): a database trigger
  on `edospmis_cases` — not a call threaded through every RPC — opens a
  stage row on creation and closes/reopens one on every status change,
  automatically, for every past and future write path. This is the exact
  "days from X to Y" metric the client's Excel report computes by hand,
  now live per case. The Case detail page shows it as "Time in each
  stage", and the current stage's SLA (if the tenant has configured one
  for it — `edospmis_sla_policies` was always generic per stage, only
  `approval` ever had a row) shows a live breach/warning status the same
  way approval SLA already did.
- **PO Approval**: a new tenant-optional gate (`requires_po_approval`,
  off by default) between Procurement and Awarded — the client's data
  proved this is a real, distinct step (PO Created ≠ PO Approved dates)
  that most tenants don't need. Reuses a `procurement.po.approve`
  permission that had existed in the catalogue, unused, since Phase 1.
- **Expected delivery date**: a lightweight field on the PO capturing the
  diagram's inbound "Delivery window" — deliberately kept separate from
  the existing (outbound, tenant → tenant's-own-client) Delivery panel.
- **Delivery panel now hides itself** for any case with no client
  attached — the audit's own data showed most request types (Material,
  Maintenance, Admin, ICT, Petty Cash) are pure internal requisitions that
  never reach an external client, so showing an irrelevant "schedule
  delivery" step on every one of them was removed rather than kept.
- **Cancel case**: the `cancelled` status has existed since Phase 2 with
  no path to reach it; closed with one RPC + button, reusing the
  `procurement.pr.cancel` permission (also unused since Phase 1).
- **On hold / Blocked**: two boolean flags orthogonal to the status
  pipeline rather than new pipeline states, each with a reason, shown as
  a banner regardless of which stage a case is actually in.
- **Categories** admin screen — the audit surfaced the client's real
  category vocabulary (Material, Maintenance, Admin, Lab, Dairy
  Development, etc.), completely different from the seeded Goods/
  Services/Works starter set, and there was no self-service way to edit
  it before now.
- Explicitly **not** built: a generic "rework" mechanism (the system's
  real equivalents — a failed inspection, an invoice exception — already
  exist and are already timestamped), and a reporting screen that
  reproduces the client's Excel report (the data this now captures makes
  that possible; the screen itself is Phase 6 work).
- Verified end-to-end via a disposable tenant: the stage-history trigger
  firing correctly on both case creation and every transition, the
  PO-approval gate on and (separately, on a second tenant) off, receiving
  correctly rejected against a not-yet-approved PO, hold/block/cancel and
  their negative paths, all the way to a single open stage-history row
  landing on `cancelled`.

**Phase 6 — Reporting/Analytics: implemented (v1 cuts).**

- A new Reports screen (`reports.view`, already granted to several roles
  since Phase 1 and never used until now): open requests by age, time
  spent in each stage plus how many cases are sitting in each one right
  now (a live bottleneck view), approval SLA compliance, supplier
  performance (spend, GRN acceptance rate, average lead time from award to
  first receipt), and spend by category.
- No new tables — every report is a read-only Postgres function
  aggregating data the platform already writes as a side effect of normal
  use (`case_stage_history` from Flow Alignment, `workflow_tasks`, GRNs/
  GRN items, POs, PRs/categories). Nothing is scheduled or pre-computed;
  each report runs live.
- "Department spend" (PRD FR-38) is reported as spend-by-category instead
  — `department_id` exists on cases/PRs but nothing sets it yet, while
  `category_id` is populated on every PR and, since the flow-alignment
  audit, reflects each tenant's real vocabulary instead of a generic
  placeholder.
- Verified against the demo tenant's real seeded data (not synthetic
  test data): supplier acceptance rates matched the demo's GRN conditions
  exactly, the supplier with no GRN yet correctly showed a null lead time
  instead of a divide-by-zero, and SLA compliance/spend-by-category
  totals matched by hand-checking the seed script's own numbers.

**edos.ai — implemented.** The same assistant every EDOS Centre sibling
app (edos-poa, edoshatch360) ships, brought to EDOSPMIS:

- A tool-calling loop against the Anthropic Messages API (`src/lib/ai/llm.ts`)
  — the model never touches the database. Each tool (`src/lib/ai/tools.ts`)
  is a query already scoped to the signed-in tenant: open-request aging,
  stage cycle times/bottlenecks, SLA compliance, supplier performance,
  spend by category, "what's waiting on me", case lookup and full case
  detail, supplier lookup, and a contracts overview. The model decides
  which to call and phrases the answer, but can't quote a figure this
  tenant's own data doesn't hold, because no tool returns one that isn't
  there.
- Switched on by `ANTHROPIC_API_KEY`; without one, edos.ai says so
  plainly and points at the Reports screen instead of guessing. This
  deliberately does **not** replicate the sibling apps' deterministic
  natural-language fallback ("answers of last resort" without a model
  configured) — real, separate work; matching its full breadth wasn't
  needed to bring the same assistant to this product.
- Saved conversations use EDOSPMIS's own established RLS-policy pattern
  (`user_id = auth.uid()`, like everything else in this app) rather than
  copying edos-poa's differing "RLS on, no policies, service-role only"
  arrangement — consistency within this codebase over matching a
  sibling's internal choice.
- Verified against the demo tenant's real seeded data (no API key needed
  for this part): case lookup by number and by title keyword, full case
  detail joins across PO/GRN/invoice, supplier lookup, and the contracts
  overview all returned correct results; conversation create/list/read/
  delete all round-tripped correctly under RLS.

**Phase 7 — Integrations: implemented (v1 cuts).**

- **Webhooks** — the one built genuinely live, not mocked: a tenant adds
  an HTTPS endpoint and (optionally) a list of event prefixes; a trigger
  on `edospmis_audit_logs` (one event pipeline, two consumers, per
  ARCHITECTURE.md §14 — the same log every RPC since Phase 1 already
  writes to, not a new parallel events table) dispatches a signed POST via
  `pg_net` for every matching action, tenant-wide, automatically, with no
  changes needed to any existing RPC. Each payload carries an
  `X-EDOSPMIS-Signature: sha256=<hex>` HMAC over the raw body, and a
  Settings screen shows recent deliveries with an on-demand status check
  (reads `net._http_response`). A misconfigured endpoint can never break
  the transaction that produced the event — the trigger swallows its own
  dispatch errors per webhook.
- **Accounting/ERP export** (FR-31 — "integration-ready export", explicitly
  not a native ledger): a CSV of every invoice with its case, PO, supplier,
  amounts, status and payment reference, from the Reports screen.
- **E-signature**: explicitly **not** built. Phase 3's contract v1 already
  deferred a secure external signing link, and there's no live provider
  account to build a real integration against — a mocked one would fail
  this phase's own "not a mock" bar, so it stays deferred rather than
  faked.
- Verified live, end-to-end, against a real external endpoint
  (`httpbin.org`, which echoes back exactly what it received): a genuine
  HTTPS POST left Supabase's infrastructure via `pg_net`, and the HMAC
  signature independently recomputed from the *raw* bytes that endpoint
  actually received matched exactly — the one subtlety worth flagging for
  anyone verifying a delivery themselves: hash the raw request body, never
  a reparsed-and-reserialized copy of it, the same rule Stripe/GitHub
  document for their own webhook signatures. Also verified: non-`https://`
  endpoints rejected, a paused webhook receiving no further deliveries,
  and deletion.
- The demo tenant predated Phase 5 and had zero invoices; one was added
  (case 5, deliberately with no goods-received note yet) so the demo shows
  a real, unresolved three-way-match exception — and the `finance` stage
  no longer sits empty in the demo's own stage-timing report.

Not yet built (later phases, see ARCHITECTURE.md §18): the rest of
Phase 8's AI scope (PR classification, spec extraction, duplicate
detection, SLA-breach prediction — PRD FR-39). Also not yet built: the
Platform Super Admin role (cross-tenant oversight for EDOS Centre as the
SaaS operator) — every account today is scoped to one tenant only, by
design, with no back door across tenants.

## Demo account

A persistent, read-only demo tenant for onboarders to explore without
signing up or risking real tenant data:

- **Tenant**: Amani Logistics Ltd (Demo) — a mid-size logistics company
  seeded with 9 cases (one per lifecycle stage: draft, pending approval,
  approved, in procurement, awarded, receiving, delivery, closed, and one
  rejected) and 3 contracts (draft, sent/partially signed, fully signed).
  One case (the "awarded" one) also carries an invoice with a real,
  unresolved three-way-match exception (added after Phase 7, since the
  demo predated Finance) — a concrete example of the exception queue
  FR-30 requires, safe to look at but not resolve from the read-only
  account.
- **Login**: `demo@edospmis.co.ke` / `AmaniDemo2026!`
- The account holds a single tenant-custom **Demo Viewer** role
  (`procurement.pr.view`, `legal.contract.view`, `reports.view`,
  `admin.audit.view` — no create/edit/approve/close permissions anywhere),
  so every write action across the app is correctly refused if attempted;
  nothing an onboarder does can corrupt the shared demo data. It was
  seeded by first provisioning the tenant normally (temporarily Tenant
  Administrator, so every seeded record was created through the same real
  RPCs a genuine user would call — not hand-crafted rows) and only
  stripping the account down to Demo Viewer once seeding finished.
- Sidebar visibility follows the same permission-gated nav every account
  uses (`src/lib/nav-items.ts`) — the demo account sees "My Work" and
  "Requests" (its own 9 seeded cases) and "Contracts"; the admin/config
  screens (Users, Roles, Suppliers, Clients, Approval Rules) require a
  `.manage` permission the demo role deliberately doesn't hold, so they're
  hidden rather than shown-but-broken.

## Stack

Next.js (App Router) + TypeScript + Tailwind v4, Supabase (Postgres +
Auth + Storage), deployed to Vercel — see ARCHITECTURE.md §13 for why.

This app's tables all live in the same shared Supabase project as EDOS
Centre's other products (`edospoa_`, `edoshatch360_` prefixes), under the
`edospmis_` prefix — see ARCHITECTURE.md §2.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the Supabase project's URL/keys
npm run dev
```

Required env vars are documented in `.env.example`. The service-role key
is only needed for tenant sign-up's admin-invite path and inbound
webhooks (see `src/lib/supabase/admin.ts`) — never used from a page or
component.

## Database

Migrations live in `supabase/migrations/`, applied directly against the
shared project (no local Supabase stack is run for this app currently —
see `MULTI_TENANCY.md`, a Phase 1 documentation deliverable, for the
full reasoning once written).

- `0001_platform_foundation.sql` — Phase 1: org structure, users,
  memberships, RBAC, audit log, `edospmis_provision_tenant()`.
- `0002_legal_contract_rbac.sql` — forward-seeds the Phase 3 Lawyer/Advocate
  role and `legal.contract.*` permissions (module itself not built yet).
- `0003_phase2_case_pr_workflow.sql` — Phase 2: cases, PRs, workflow/queue/
  approval/SLA tables, `edospmis_submit_pr()`, `edospmis_decide_approval()`.
- `0004_admin_holds_dept_manager.sql` — fixes a gap the pre-commit smoke
  test caught: the founding admin now also holds Department Manager so
  the seeded default approval rule is immediately actionable solo.
- `0005_phase3_procurement.sql` — Phase 3a: suppliers, RFQs, quotations,
  evaluations, purchase orders, `edospmis_start_procurement()`,
  `edospmis_award_po()`; extends the case lifecycle past "approved".
- `0006_phase3_contracts_v1.sql` — Phase 3b: contracts + signing parties
  (v1 cut — see the migration header), `edospmis_send_contract()`,
  `edospmis_record_contract_signature()`, `edospmis_void_contract()`.

## Testing

`npx tsc --noEmit`, `npx eslint .`, `npm run build` — all three gate
every change; `npm run build` specifically catches the "server-only
imported from a client component" class of bug that `tsc` alone misses.
A dedicated tenant-isolation test suite (ARCHITECTURE.md §17) is a
near-term follow-up, not yet written.

## Project structure

```
src/
  app/            Next.js App Router — auth pages, /app (the product), /auth/callback
  components/
    ui/           shared design-system primitives (Button, Card, Field, Badge, Spinner)
    app/          app-shell components (sidebar/mobile nav)
  lib/
    data/         server-only data-access modules (session, rbac)
    supabase/     client/server/admin Supabase client factories
    audit.ts      logAudit() — the one place anything writes to edospmis_audit_logs
supabase/migrations/
```
