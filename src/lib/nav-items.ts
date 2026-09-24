import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ShieldCheck, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown when the session holds this permission — omit for "always visible". */
  requires?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app/home", label: "My Work", icon: LayoutDashboard },
  { href: "/app/settings/users", label: "Users", icon: Users, requires: "admin.users.manage" },
  { href: "/app/settings/roles", label: "Roles", icon: ShieldCheck, requires: "admin.roles.manage" },
];

export const NAV_ROOT_PATHS = NAV_ITEMS.map((i) => i.href);
