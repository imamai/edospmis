import type { LucideIcon } from "lucide-react";
import { BarChart3, Building2, ClipboardList, FileSignature, Gauge, Gavel, LayoutDashboard, LineChart, Scale, ShieldCheck, Sparkles, Tags, Truck, UserCog, Users, Webhook } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown when the session holds this permission — omit for "always visible". */
  requires?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: Gauge, requires: "reports.view" },
  { href: "/app/home", label: "My Work", icon: LayoutDashboard },
  { href: "/app/assistant", label: "edos.ai", icon: Sparkles, requires: "reports.view" },
  { href: "/app/prs", label: "Requests", icon: ClipboardList, requires: "procurement.pr.view" },
  { href: "/app/contracts", label: "Contracts", icon: FileSignature, requires: "legal.contract.view" },
  { href: "/app/analytics", label: "Analytics", icon: LineChart, requires: "reports.view" },
  { href: "/app/reports", label: "Reports", icon: BarChart3, requires: "reports.view" },
  { href: "/app/settings/users", label: "Users", icon: Users, requires: "admin.users.manage" },
  { href: "/app/settings/roles", label: "Roles", icon: ShieldCheck, requires: "admin.roles.manage" },
  { href: "/app/settings/approval-rules", label: "Approval Rules", icon: Gavel, requires: "admin.approvals.manage" },
  { href: "/app/settings/segregation-of-duties", label: "Segregation of Duties", icon: Scale, requires: "admin.approvals.manage" },
  { href: "/app/settings/delegations", label: "Delegations", icon: UserCog, requires: "admin.approvals.manage" },
  { href: "/app/settings/clients", label: "Clients", icon: Building2, requires: "crm.client.manage" },
  { href: "/app/settings/suppliers", label: "Suppliers", icon: Truck, requires: "procurement.supplier.manage" },
  { href: "/app/settings/categories", label: "Categories", icon: Tags, requires: "admin.org.manage" },
  { href: "/app/settings/webhooks", label: "Webhooks", icon: Webhook, requires: "admin.webhooks.manage" },
];

export const NAV_ROOT_PATHS = NAV_ITEMS.map((i) => i.href);
