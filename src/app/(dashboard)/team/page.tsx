"use client";

import { useDashboard } from "@/components/dashboard-provider";
import { TeamAnalysisPanel } from "@/components/team-analysis";

export default function TeamPage() {
  const { params, showLiveData, updateLiveData } = useDashboard();

  return (
    <TeamAnalysisPanel
      params={params}
      showLiveData={showLiveData}
      onShowLiveDataChange={updateLiveData}
    />
  );
}
