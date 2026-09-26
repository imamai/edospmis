import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building,
  Building2,
  ClipboardList,
  FileSignature,
  Gauge,
  Gavel,
  Globe,
  LayoutDashboard,
  Landmark,
  LineChart,
  ListOrdered,
  Network,
  PenTool,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Webhook,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown when the session holds this permission — omit for "always visible". */
  requires?: string;
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
      { href: "/app/dashboard", label: "Dashboard", icon: Gauge, requires: "reports.view" },
      { href: "/app/home", label: "My Work", icon: LayoutDashboard },
      { href: "/app/assistant", label: "edos.ai", icon: Sparkles, requires: "reports.view" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { href: "/app/prs", label: "Requests", icon: ClipboardList, requires: "procurement.pr.view" },
      { href: "/app/contracts", label: "Contracts", icon: FileSignature, requires: "legal.contract.view" },
      { href: "/app/analytics", label: "Analytics", icon: LineChart, requires: "reports.view" },
      { href: "/app/reports", label: "Reports", icon: BarChart3, requires: "reports.view" },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/app/settings/clients", label: "Clients", icon: Building2, requires: "crm.client.manage" },
      { href: "/app/settings/suppliers", label: "Suppliers", icon: Truck, requires: "procurement.supplier.manage" },
      { href: "/app/settings/categories", label: "Categories", icon: Tags, requires: "admin.org.manage" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/app/settings/business-units", label: "Business Units", icon: Landmark, requires: "admin.org.manage" },
      { href: "/app/settings/branches", label: "Branches", icon: Network, requires: "admin.org.manage" },
      { href: "/app/settings/departments", label: "Departments", icon: Building, requires: "admin.org.manage" },
      { href: "/app/settings/teams", label: "Teams", icon: UsersRound, requires: "admin.org.manage" },
      { href: "/app/settings/queues", label: "Queues", icon: ListOrdered, requires: "admin.workflows.manage" },
      { href: "/app/settings/organization", label: "Organization Profile", icon: Settings2, requires: "admin.org.manage" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/app/settings/users", label: "Users", icon: Users, requires: "admin.users.manage" },
      { href: "/app/settings/roles", label: "Roles", icon: ShieldCheck, requires: "admin.roles.manage" },
      { href: "/app/settings/approval-rules", label: "Approval Rules", icon: Gavel, requires: "admin.approvals.manage" },
      { href: "/app/settings/segregation-of-duties", label: "Segregation of Duties", icon: Scale, requires: "admin.approvals.manage" },
      { href: "/app/settings/delegations", label: "Delegations", icon: UserCog, requires: "admin.approvals.manage" },
      { href: "/app/settings/webhooks", label: "Webhooks", icon: Webhook, requires: "admin.webhooks.manage" },
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
  { href: "/app/settings/signature", label: "My signature", icon: PenTool },
];

export const NAV_ROOT_PATHS = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_BOTTOM_ITEMS].map((i) => i.href);
