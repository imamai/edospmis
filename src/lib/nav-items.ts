import type { LucideIcon } from "lucide-react";
import { Building2, ClipboardList, FileSignature, Gavel, LayoutDashboard, ShieldCheck, Truck, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown when the session holds this permission — omit for "always visible". */
  requires?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app/home", label: "My Work", icon: LayoutDashboard },
  { href: "/app/prs", label: "Requests", icon: ClipboardList, requires: "procurement.pr.view" },
  { href: "/app/contracts", label: "Contracts", icon: FileSignature, requires: "legal.contract.view" },
  { href: "/app/settings/users", label: "Users", icon: Users, requires: "admin.users.manage" },
  { href: "/app/settings/roles", label: "Roles", icon: ShieldCheck, requires: "admin.roles.manage" },
  { href: "/app/settings/approval-rules", label: "Approval Rules", icon: Gavel, requires: "admin.approvals.manage" },
  { href: "/app/settings/clients", label: "Clients", icon: Building2, requires: "crm.client.manage" },
  { href: "/app/settings/suppliers", label: "Suppliers", icon: Truck, requires: "procurement.supplier.manage" },
];

export const NAV_ROOT_PATHS = NAV_ITEMS.map((i) => i.href);
