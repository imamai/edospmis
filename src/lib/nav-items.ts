import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  FileCheck2,
  Building,
  Building2,
  ClipboardList,
  CreditCard,
  FileSearch,
  FileSignature,
  Gauge,
  Gavel,
  Globe,
  LayoutDashboard,
  Landmark,
  LineChart,
  ListChecks,
  ListOrdered,
  Network,
  PackageCheck,
  PenTool,
  Receipt,
  Scale,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  Webhook,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown when the session holds this permission — omit for "always visible". */
  requires?: string;
  /** Key into the tenant's requisition-stage counts (RequisitionOverview["counts"], plus the synthetic "open"/"sourcing" totals) — shown as a small badge, omitted when 0/absent. */
  countKey?: string;
}

export interface NavGroup {
  /** null renders no header — used for the top, always-visible items. */
  label: string | null;
  items: NavItem[];
  /** Only rendered at all for a platform admin, regardless of tenant permissions. */
  platformOnly?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/app/dashboard",
        label: "Dashboard",
        icon: Gauge,
        requires: "reports.view",
      },
      { href: "/app/home", label: "My Work", icon: LayoutDashboard },
      {
        href: "/app/assistant",
        label: "edos.ai",
        icon: Sparkles,
        requires: "reports.view",
      },
    ],
  },
  {
    // Things you act on: raise, decide, award, sign. The read-only view of the
    // same domains is "Reports"; the things you set up once are the settings
    // groups below.
    label: "Procurement",
    items: [
      {
        href: "/app/requisitions",
        label: "Requisitions",
        icon: ListChecks,
        requires: "procurement.pr.view",
        countKey: "open",
      },
      {
        href: "/app/prs",
        label: "My requests",
        icon: ClipboardList,
        requires: "procurement.pr.view",
      },
      {
        href: "/app/contracts",
        label: "Contracts",
        icon: FileSignature,
        requires: "legal.contract.view",
      },
    ],
  },
  {
    // Things you look up: browse, filter by period/department/status, export.
    // Every row links back to its case workspace to actually act on it — no
    // edit or delete lives in this group, on purpose.
    label: "Reports",
    items: [
      {
        href: "/app/reports/rfqs",
        label: "Tenders & RFQs",
        icon: FileSearch,
        requires: "procurement.rfq.view",
        countKey: "sourcing",
      },
      {
        href: "/app/reports/purchase-orders",
        label: "Purchase orders",
        icon: ShoppingCart,
        requires: "procurement.po.view",
        countKey: "awarded",
      },
      {
        href: "/app/reports/goods-received",
        label: "Goods received",
        icon: PackageCheck,
        requires: "receiving.grn.view",
        countKey: "receiving",
      },
      {
        href: "/app/reports/invoices",
        label: "Invoices & payments",
        icon: Receipt,
        requires: "finance.invoice.view",
        countKey: "finance",
      },
      {
        href: "/app/analytics",
        label: "Analytics",
        icon: LineChart,
        requires: "reports.view",
      },
      {
        href: "/app/reports",
        label: "Reports",
        icon: BarChart3,
        requires: "reports.view",
      },
    ],
  },

  // ── Settings, grouped by what you are setting up ──────────────────────
  //
  // Everything below lives under /app/settings and is indexed on the Settings
  // page, which uses these same five headings. One taxonomy in both places:
  // two would drift, and then neither would be trustworthy.

  {
    label: "Procurement setup",
    items: [
      {
        href: "/app/settings/catalogue",
        label: "Item catalogue",
        icon: Boxes,
        requires: "procurement.catalogue.manage",
      },
      {
        href: "/app/settings/suppliers",
        label: "Suppliers",
        icon: Truck,
        requires: "procurement.supplier.manage",
      },
      {
        href: "/app/settings/tender",
        label: "Tender requirements",
        icon: FileCheck2,
        requires: "procurement.rfq.create",
      },
      {
        href: "/app/settings/categories",
        label: "Categories",
        icon: Tags,
        requires: "admin.org.manage",
      },
    ],
  },
  {
    label: "Money & approvals",
    items: [
      {
        href: "/app/settings/budgets",
        label: "Budgets",
        icon: Wallet,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/approval-rules",
        label: "Approval rules",
        icon: Gavel,
        requires: "admin.approvals.manage",
      },
      {
        href: "/app/settings/segregation-of-duties",
        label: "Finance controls",
        icon: Scale,
        requires: "admin.approvals.manage",
      },
      {
        href: "/app/settings/billing",
        label: "Billing & plan",
        icon: CreditCard,
        requires: "admin.org.manage",
      },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        href: "/app/settings/organization",
        label: "Organization profile",
        icon: Settings2,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/business-units",
        label: "Business units",
        icon: Landmark,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/branches",
        label: "Branches",
        icon: Network,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/departments",
        label: "Departments",
        icon: Building,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/teams",
        label: "Teams",
        icon: UsersRound,
        requires: "admin.org.manage",
      },
      {
        href: "/app/settings/clients",
        label: "Clients",
        icon: Building2,
        requires: "crm.client.manage",
      },
    ],
  },
  {
    label: "People & access",
    items: [
      {
        href: "/app/settings/users",
        label: "Users",
        icon: Users,
        requires: "admin.users.manage",
      },
      {
        href: "/app/settings/roles",
        label: "Roles",
        icon: ShieldCheck,
        requires: "admin.roles.manage",
      },
      {
        href: "/app/settings/delegations",
        label: "Delegations",
        icon: UserCog,
        requires: "admin.approvals.manage",
      },
    ],
  },
  {
    label: "Workflow & integrations",
    items: [
      {
        href: "/app/settings/queues",
        label: "Queues",
        icon: ListOrdered,
        requires: "admin.workflows.manage",
      },
      {
        href: "/app/settings/webhooks",
        label: "Webhooks",
        icon: Webhook,
        requires: "admin.webhooks.manage",
      },
    ],
  },
  {
    label: "Platform",
    platformOnly: true,
    items: [{ href: "/app/platform/tenants", label: "Tenants", icon: Globe }],
  },
];

/** Ungrouped, always visible, rendered just above sign-out. */
export const NAV_BOTTOM_ITEMS: NavItem[] = [
  // One way in to everything configurable. The groups above stay as they are:
  // they are useful once you know where a thing lives, and this is for before
  // you know.
  { href: "/app/settings", label: "Settings", icon: Settings2 },
  { href: "/app/settings/signature", label: "My signature", icon: PenTool },
];

export const NAV_ROOT_PATHS = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_BOTTOM_ITEMS,
].map((i) => i.href);
