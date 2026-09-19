"use client";

import { useRouter } from "next/navigation";
import { useDashboard } from "@/components/dashboard-provider";
import { FormulaTracker } from "@/components/formula-tracker";
import { dashboardRoutes } from "@/lib/dashboard-nav";
import { sanitiseParams } from "@/lib/scoring";
import type { RankingParams } from "@/lib/fpl-types";

export default function TrackerPage() {
  const router = useRouter();
  const { params, updateParams } = useDashboard();

  function applyTrackerParams(nextParams: RankingParams) {
    updateParams(sanitiseParams(nextParams));
    router.push(dashboardRoutes.rankings);
  }

  return (
    <FormulaTracker
      currentParams={params}
      onApplyParams={applyTrackerParams}
    />
  );
}
