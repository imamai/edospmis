"use client";

import { useMemo, useState } from "react";
import { SelectInput } from "@/components/ui/field";
import type { Placement, PlacementOptions } from "@/lib/database.types";

/**
 * Choosing a place in the organisation: business unit → branch → department
 * → team.
 *
 * Only the deepest choice is submitted. The ancestors are derived in the
 * database by the `edospmis_normalise_placement` trigger, so this form posts
 * `team_id` when a team is picked and `department_id` when one is not — never
 * four ids that could disagree with each other. The upper selects are there
 * to narrow the lists, not to be saved.
 *
 * Every level is optional. A person who belongs to a business unit and no
 * particular department is a real person, and forcing a department on them
 * would put a wrong answer in every report rather than no answer.
 */
export function PlacementPicker({
  options,
  value,
  disabled,
  compact,
}: {
  options: PlacementOptions;
  value?: Placement | null;
  disabled?: boolean;
  /** Stack into one column, for a table row rather than a full form. */
  compact?: boolean;
}) {
  const [businessUnitId, setBusinessUnitId] = useState(value?.business_unit_id ?? "");
  const [branchId, setBranchId] = useState(value?.branch_id ?? "");
  const [departmentId, setDepartmentId] = useState(value?.department_id ?? "");
  const [teamId, setTeamId] = useState(value?.team_id ?? "");

  const branches = useMemo(
    () => options.branches.filter((b) => !businessUnitId || b.business_unit_id === businessUnitId),
    [options.branches, businessUnitId],
  );

  const departments = useMemo(
    () =>
      options.departments.filter((d) => {
        if (branchId) return d.branch_id === branchId;
        if (businessUnitId) return d.business_unit_id === businessUnitId || branches.some((b) => b.id === d.branch_id);
        return true;
      }),
    [options.departments, branchId, businessUnitId, branches],
  );

  const teams = useMemo(
    () => options.teams.filter((t) => !departmentId || t.department_id === departmentId),
    [options.teams, departmentId],
  );

  return (
    <div className={compact ? "flex flex-col gap-2.5" : "grid gap-4 sm:grid-cols-2"}>
      {/* Only one of these two is posted, and the deeper one wins. */}
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="department_id" value={teamId ? "" : departmentId} />

      <SelectInput
        label="Business unit"
        value={businessUnitId}
        disabled={disabled}
        onChange={(e) => {
          setBusinessUnitId(e.target.value);
          // Anything below a changed level is no longer necessarily valid, so
          // it is cleared rather than left to point somewhere else.
          setBranchId("");
          setDepartmentId("");
          setTeamId("");
        }}
      >
        <option value="">Not set</option>
        {options.businessUnits.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </SelectInput>

      <SelectInput
        label="Branch"
        value={branchId}
        disabled={disabled || branches.length === 0}
        onChange={(e) => {
          setBranchId(e.target.value);
          setDepartmentId("");
          setTeamId("");
        }}
      >
        <option value="">{branches.length === 0 ? "No branches" : "Not set"}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </SelectInput>

      <SelectInput
        label="Department"
        value={departmentId}
        disabled={disabled || departments.length === 0}
        onChange={(e) => {
          setDepartmentId(e.target.value);
          setTeamId("");
        }}
      >
        <option value="">{departments.length === 0 ? "No departments" : "Not set"}</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </SelectInput>

      <SelectInput
        label="Team"
        value={teamId}
        disabled={disabled || teams.length === 0}
        onChange={(e) => setTeamId(e.target.value)}
      >
        <option value="">
          {teams.length === 0 ? (departmentId ? "No teams in this department" : "Pick a department first") : "Not set"}
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </SelectInput>
    </div>
  );
}

