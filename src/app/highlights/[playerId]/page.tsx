import { notFound } from "next/navigation";
import { PlayerHighlightDetail } from "@/components/player-highlights";

export default async function PlayerHighlightPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const playerId = Number((await params).playerId);
  if (!Number.isSafeInteger(playerId) || playerId < 1) notFound();

  return <PlayerHighlightDetail playerId={playerId} />;
}
