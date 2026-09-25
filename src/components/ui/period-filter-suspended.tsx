import { Suspense } from "react";
import { PeriodFilter } from "./period-filter";
import type { PeriodKey } from "@/lib/report-period";

/** `useSearchParams` inside PeriodFilter needs a Suspense boundary — shared here so every caller gets it for free. */
export function PeriodFilterSuspended({ activeKey }: { activeKey: PeriodKey }) {
  return (
    <Suspense fallback={<div className="h-9" />}>
      <PeriodFilter activeKey={activeKey} />
    </Suspense>
  );
}
