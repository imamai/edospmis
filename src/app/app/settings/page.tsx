import Link from "next/link";
import {
  Banknote,
  Boxes,
  Building,
  Building2,
  CreditCard,
  FileCheck2,
  Gavel,
  Landmark,
  ListOrdered,
  Network,
  PenTool,
  Settings2,
  ShieldCheck,
  Tags,
  Truck,
  Users,
  UsersRound,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import type { SessionContext } from "@/lib/data/session";

/**
 * One place that lists everything configurable.
 *
 * Every settings screen already lived under /app/settings, but the sidebar
 * scattered them across Procurement, Directory, Organization and Admin, and
 * there was no page at /app/settings itself — so somebody looking for "the
 * settings" had nowhere to land and had to know which group a thing happened
 * to be filed under.
 *
 * The sidebar groups stay exactly as they are: they are useful once you know
 * where something lives. This is for before you know.
 *
 * Each entry names what it is *for* rather than what it is called, because
 * "Queues" tells somebody nothing about whether it is where they set who
 * approves what.
 */

interface Entry {
  href: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Hidden entirely when the viewer cannot use it — a dead link is worse than no link. */
  requires?: string;
}

interface Section {
  title: string;
  blurb: string;
  entries: Entry[];
}

const SECTIONS: Section[] = [
  {
    title: "Procurement setup",
    blurb: "What you buy, who you buy it from, and what a bidder must return.",
    entries: [
      {
        href: "/app/settings/catalogue",
        label: "Item catalogue",
        blurb:
          "What this organisation buys, named once, so requesters pick instead of typing. Import your price list.",
        icon: Boxes,
        requires: "procurement.catalogue.manage",
      },
      {
        href: "/app/settings/suppliers",
        label: "Suppliers",
        blurb: "The companies you invite to quote, and their contact details.",
        icon: Truck,
        requires: "procurement.supplier.manage",
      },
      {
        href: "/app/settings/tender",
        label: "Tender requirements",
        blurb:
          "The documents and signed templates a bidder must return before they can be awarded.",
        icon: FileCheck2,
        requires: "procurement.rfq.create",
      },
      {
        href: "/app/settings/categories",
        label: "Categories",
        blurb: "What a request gets filed under.",
        icon: Tags,
        requires: "admin.org.manage",
      },
    ],
  },
  {
    title: "Money & approvals",
    blurb: "What there is to spend, and who may commit it.",
    entries: [
      {
        href: "/app/settings/budgets",
        label: "Budgets",
        blurb: "Lines, periods and what is left on each after commitments.",
        icon: Wallet,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/approval-rules",
        label: "Approval rules",
        blurb: "Who approves what, and above which amount.",
        icon: Gavel,
        requires: "admin.approvals.manage",
      },
      {
        href: "/app/settings/segregation-of-duties",
        label: "Finance controls",
        blurb: "Which pairs of jobs one person may not do on the same case.",
        icon: ShieldCheck,
        requires: "admin.approvals.manage",
      },
      {
        href: "/app/settings/billing",
        label: "Billing & plan",
        blurb: "Your EDOSPMIS subscription and invoices.",
        icon: CreditCard,
        requires: "admin.org.manage",
      },
    ],
  },
  {
    title: "Organization",
    blurb: "The shape of the business, and how documents it issues look.",
    entries: [
      {
        href: "/app/settings/organization",
        label: "Organisation profile",
        blurb:
          "Name, address, KRA PIN and logo — what appears on every PO, invoice and GRN.",
        icon: Settings2,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/business-units",
        label: "Business units",
        blurb: "The top level of the structure requests are filed against.",
        icon: Network,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/branches",
        label: "Branches",
        blurb: "Where people and requests sit geographically.",
        icon: Landmark,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/departments",
        label: "Departments",
        blurb: "Who a request belongs to, and whose budget it draws on.",
        icon: Building,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/teams",
        label: "Teams",
        blurb: "Smaller groupings inside a department.",
        icon: UsersRound,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/clients",
        label: "Clients",
        blurb: "The customers a request can be raised on behalf of.",
        icon: Building2,
        requires: "crm.client.manage",
      },
    ],
  },
  {
    title: "People & access",
    blurb: "Who is in this workspace and what each of them may do.",
    entries: [
      {
        href: "/app/settings/users",
        label: "Users",
        blurb: "Invite people, set their role, suspend an account.",
        icon: Users,
        requires: "admin.users.manage",
      },
      {
        href: "/app/settings/roles",
        label: "Roles",
        blurb: "What each role is allowed to do.",
        icon: ShieldCheck,
        requires: "admin.roles.manage",
      },
      {
        href: "/app/settings/delegations",
        label: "Delegations",
        blurb: "Who acts for whom while they are away.",
        icon: Banknote,
        requires: "admin.approvals.manage",
      },
      {
        href: "/app/settings/signature",
        label: "My signature",
        blurb:
          "The signature that appears when you approve or sign a document.",
        icon: PenTool,
      },
    ],
  },
  {
    title: "Workflow & integrations",
    blurb: "How work is routed, and what else hears about it.",
    entries: [
      {
        href: "/app/settings/queues",
        label: "Queues",
        blurb: "Where work waits, and who picks it up.",
        icon: ListOrdered,
        requires: "admin.workflows.manage",
      },
      {
        href: "/app/settings/webhooks",
        label: "Webhooks",
        blurb: "Tell another system when something happens here.",
        icon: Webhook,
        requires: "admin.webhooks.manage",
      },
    ],
  },
];

function visible(session: SessionContext, entry: Entry): boolean {
  return !entry.requires || can(session, entry.requires);
}

export default async function SettingsHomePage() {
  const session = await requireSession();

  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => visible(session, entry)),
  })).filter((section) => section.entries.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Everything configurable in {session.tenant.name}. Only what your role
          can reach is shown.
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
          Your role doesn&rsquo;t include any settings in this workspace. Ask an
          administrator if you need to change something.
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {section.title}
              </h2>
              <p className="text-xs text-ink-faint">{section.blurb}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.entries.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand"
                >
                  <entry.icon
                    className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint group-hover:text-brand"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {entry.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
                      {entry.blurb}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
