import { Suspense } from "react";
import { MatchSimulationPage } from "@/components/match-simulation";

export default async function ForecastMatchPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;

  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-muted-foreground">Loading match…</p>}>
      <MatchSimulationPage fixtureId={fixtureId} />
    </Suspense>
  );
}
