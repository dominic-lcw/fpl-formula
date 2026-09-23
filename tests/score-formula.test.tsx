import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScoreFormula } from "../src/components/score-formula";
import { FORMULA, INDIVIDUAL_FORMULA_TEXT } from "../src/lib/formula";
import { DEFAULT_PARAMS } from "../src/lib/scoring";

describe("ScoreFormula", () => {
  it("shows attack contribution, scaled defensive contribution, and the 3-point bonus", () => {
    const html = renderToStaticMarkup(<ScoreFormula params={DEFAULT_PARAMS} />);
    expect(html).toContain(INDIVIDUAL_FORMULA_TEXT);
    expect(html).toContain("AtkCon");
    expect(html).toContain(`DefCon × ${FORMULA.defcon}`);
    expect(html).toContain(`receives ${FORMULA.bonusAward} points`);
    expect(html).toContain(`team DefCon × ${FORMULA.teamDefcon}`);
    expect(html).not.toContain("position factor");
  });
});
