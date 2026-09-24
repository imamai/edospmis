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

Not yet built (later phases, see ARCHITECTURE.md §18): fulfilment —
GRN/inspection/delivery/closure (Phase 4), finance/three-way-matching
(Phase 5), analytics (Phase 6), integrations (Phase 7). Also not yet
built: the Platform Super Admin role (cross-tenant oversight for EDOS
Centre as the SaaS operator) — every account today is scoped to one
tenant only, by design, with no back door across tenants.

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
