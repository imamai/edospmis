"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setSupplierActive } from "./actions";
import { EditSupplierButton } from "./edit-supplier-button";
import { Badge } from "@/components/ui/badge";
import type { Supplier } from "@/lib/database.types";

export function SupplierRow({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await setSupplierActive(supplier.id, !supplier.is_active);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4">
        <Link
          href={`/app/settings/suppliers/${supplier.id}`}
          className="text-sm font-medium text-brand hover:underline"
        >
          {supplier.name}
        </Link>
        {/* Said rather than left blank. A supplier with no address cannot be
            emailed an invitation, and the row that shows nothing there looks
            the same as one that simply has a long name. */}
        {supplier.email ? (
          <p className="text-xs text-ink-faint">{supplier.email}</p>
        ) : (
          <p className="text-xs text-attention">No email address</p>
        )}
      </td>
      <td className="py-2.5 pr-4 text-sm text-ink-soft">
        {supplier.phone ?? "—"}
      </td>
      <td className="py-2.5 pr-4">
        <Badge tone={supplier.is_active ? "good" : "neutral"}>
          {supplier.is_active ? "active" : "inactive"}
        </Badge>
      </td>
      <td className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-3">
          <EditSupplierButton supplier={supplier} />
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
          >
            {supplier.is_active ? "Archive" : "Reactivate"}
          </button>
        </div>
      </td>
    </tr>
  );
}
