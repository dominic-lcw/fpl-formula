export type ScoreTone = "high" | "good" | "mid" | "low";

export type ScoreStyle = {
  tone: ScoreTone;
  color: string;
  background: string;
  border: string;
};

const TONES: Record<ScoreTone, ScoreStyle> = {
  high: {
    tone: "high",
    color: "rgb(165 243 252)",
    background: "rgb(8 145 178 / 0.2)",
    border: "rgb(103 232 249 / 0.38)",
  },
  good: {
    tone: "good",
    color: "rgb(167 243 208)",
    background: "rgb(16 185 129 / 0.16)",
    border: "rgb(52 211 153 / 0.32)",
  },
  mid: {
    tone: "mid",
    color: "rgb(253 230 138)",
    background: "rgb(245 158 11 / 0.14)",
    border: "rgb(251 191 36 / 0.28)",
  },
  low: {
    tone: "low",
    color: "rgb(254 202 202)",
    background: "rgb(244 63 94 / 0.12)",
    border: "rgb(251 113 133 / 0.28)",
  },
};

export function scoreTone(score: number): ScoreTone {
  if (score >= 75) return "high";
  if (score >= 55) return "good";
  if (score >= 40) return "mid";
  return "low";
}

export function scoreStyle(score: number): ScoreStyle {
  return TONES[scoreTone(score)];
}

export function paintScoreColumn(root: HTMLElement, columnIndex: number) {
  const paint = () => {
    root.querySelectorAll(`tbody td:nth-child(${columnIndex})`).forEach((node) => {
      const cell = node as HTMLTableCellElement;
      if (cell.dataset.scorePainted === "1") return;

      const score = Number(cell.textContent);
      if (!Number.isFinite(score)) return;

      const style = scoreStyle(score);
      const badge = document.createElement("span");
      badge.className = "score-badge";
      badge.dataset.tone = style.tone;
      badge.textContent = cell.textContent?.trim() ?? "";

      cell.dataset.scorePainted = "1";
      cell.replaceChildren(badge);
    });
  };

  paint();
  const observer = new MutationObserver(paint);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
