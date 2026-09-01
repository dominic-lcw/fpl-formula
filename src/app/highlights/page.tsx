import type { Metadata } from "next";
import { PlayerHighlights } from "@/components/player-highlights";

export const metadata: Metadata = {
  title: "Player highlights | FPL Formula Lab",
  description: "Top FPL Formula Lab picks and their recent Gameweek trends.",
};

export default function HighlightsPage() {
  return <PlayerHighlights />;
}
