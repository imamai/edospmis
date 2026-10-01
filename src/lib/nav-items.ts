import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FileSearch,
  FileSignature,
  Gauge,
  Globe,
  LayoutDashboard,
  LineChart,
  ListChecks,
  PackageCheck,
  PenTool,
  Receipt,
  Settings2,
  ShoppingCart,
  Sparkles,
  Truck,
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
        // The one piece of configuration that lives here rather than in
        // Settings. Inviting suppliers to quote is something a procurement
        // officer does several times a week, not something set up once — and
        // two clicks away is two clicks too many for that.
        href: "/app/settings/suppliers",
        label: "Suppliers",
        icon: Truck,
        requires: "procurement.supplier.manage",
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

  // Configuration is not in the sidebar. Every one of these screens is listed
  // on the Settings page with a line saying what it is for, and having both
  // meant the same twenty entries in two places — which is not a shortcut, it
  // is two things to keep in step. The sidebar is what you do; Settings is
  // what you set up.

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
  // A signature appears on an approval, a purchase order or a contract.
  // Offering one to somebody who signs none of those is clutter at best, and
  // at worst suggests an authority they do not have.
  {
    href: "/app/settings/signature",
    label: "My signature",
    icon: PenTool,
    requires: "signature.manage",
  },
];

export const NAV_ROOT_PATHS = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_BOTTOM_ITEMS,
].map((i) => i.href);
