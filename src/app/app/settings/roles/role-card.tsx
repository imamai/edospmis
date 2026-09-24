"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { updateRolePermissions, deleteRole } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckboxRow } from "@/components/ui/field";
import type { Permission, RoleWithPermissions } from "@/lib/database.types";

export function RoleCard({
  role,
  permissions,
  memberCount,
}: {
  role: RoleWithPermissions;
  permissions: Permission[];
  memberCount: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permission_keys));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  const byCategory = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const p of permissions) {
      if (!groups.has(p.category)) groups.set(p.category, []);
      groups.get(p.category)!.push(p);
    }
    return groups;
  }, [permissions]);

  const keyToId = useMemo(() => new Map(permissions.map((p) => [p.key, p.id])), [permissions]);
  const dirty =
    selected.size !== role.permission_keys.length || role.permission_keys.some((k) => !selected.has(k));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    start(async () => {
      const ids = Array.from(selected)
        .map((key) => keyToId.get(key))
        .filter((id): id is string => !!id);
      const result = await updateRolePermissions(role.id, ids);
      setMessage(result.error ? { tone: "error", text: result.error } : { tone: "ok", text: result.ok ?? "Saved." });
      if (!result.error) router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete the "${role.name}" role?`)) return;
    start(async () => {
      const result = await deleteRole(role.id);
      if (result.error) setMessage({ tone: "error", text: result.error });
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={role.name}
        subtitle={role.description ?? undefined}
        action={
          <div className="flex items-center gap-2">
            {role.is_system && <Badge tone="neutral">System role</Badge>}
            <Badge tone="brand">
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Badge>
          </div>
        }
      />
      <CardBody>
        {role.is_system ? (
          <p className="text-xs text-ink-faint">
            System roles ship with a fixed set of permissions and can&rsquo;t be edited or deleted —
            create a custom role instead if you need a different combination.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from(byCategory.entries()).map(([category, perms]) => (
                <div key={category} className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{category}</p>
                  {perms.map((p) => (
                    <CheckboxRow
                      key={p.id}
                      label={p.description}
                      checked={selected.has(p.key)}
                      onChange={() => toggle(p.key)}
                    />
                  ))}
                </div>
              ))}
            </div>
            {message && (
              <p className={`mt-3 text-xs ${message.tone === "error" ? "text-critical" : "text-good"}`}>{message.text}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" onClick={save} busy={pending} disabled={!dirty}>
                Save permissions
              </Button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint hover:text-critical disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete role
              </button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
