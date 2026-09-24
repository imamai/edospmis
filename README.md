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
- RBAC: a fixed 36-key permission catalogue, tenant-scoped custom roles,
  a Roles admin screen (create a role, toggle its permissions by
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

Not yet built (later phases, see ARCHITECTURE.md §18): Case/PR/workflow/
queue/approval/SLA engine (Phase 2), procurement — RFQ/supplier/PO
(Phase 3), fulfilment — GRN/inspection/delivery/closure (Phase 4),
finance/three-way-matching (Phase 5), analytics (Phase 6), integrations
(Phase 7).

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
full reasoning once written). `0001_platform_foundation.sql` is the
Phase 1 schema: org structure, users, memberships, RBAC, audit log, and
the `edospmis_provision_tenant()` function sign-up calls.

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
