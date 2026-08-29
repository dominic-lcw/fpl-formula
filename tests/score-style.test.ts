import { describe, expect, it } from "vitest";
import { scoreStyle, scoreTone } from "../src/lib/score-style";

describe("scoreTone", () => {
  it("bands scores so the strongest ranks stay visually distinct", () => {
    expect(scoreTone(91.4)).toBe("high");
    expect(scoreTone(75)).toBe("high");
    expect(scoreTone(62)).toBe("good");
    expect(scoreTone(55)).toBe("good");
    expect(scoreTone(48.2)).toBe("mid");
    expect(scoreTone(40)).toBe("mid");
    expect(scoreTone(12)).toBe("low");
  });
});

describe("scoreStyle", () => {
  it("uses cyan for high scores and warmer colors as the value falls", () => {
    expect(scoreStyle(88).color).toBe("rgb(165 243 252)");
    expect(scoreStyle(60).color).toBe("rgb(167 243 208)");
    expect(scoreStyle(44).color).toBe("rgb(253 230 138)");
    expect(scoreStyle(9).color).toBe("rgb(254 202 202)");
  });
});
