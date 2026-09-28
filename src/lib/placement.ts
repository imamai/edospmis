import type { Placement, PlacementOptions } from "@/lib/database.types";

/**
 * `Tech Division › Nairobi › IT › AI team`, or a dash where nothing is set.
 *
 * Deliberately not in `placement-picker.tsx`: that file is `"use client"`,
 * and a function exported from a client module cannot be called by a server
 * component — it can only be rendered as one. The case page and the budgets
 * page are both server components and both need this label, so it lives in a
 * plain module that either side can import.
 */
export function placementLabel(placement: Placement | null, options: PlacementOptions): string {
  if (!placement) return "—";
  const parts = [
    options.businessUnits.find((b) => b.id === placement.business_unit_id)?.name,
    options.branches.find((b) => b.id === placement.branch_id)?.name,
    options.departments.find((d) => d.id === placement.department_id)?.name,
    options.teams.find((t) => t.id === placement.team_id)?.name,
  ].filter(Boolean);
  return parts.length === 0 ? "—" : parts.join(" › ");
}
