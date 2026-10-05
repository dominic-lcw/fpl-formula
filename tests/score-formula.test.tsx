import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScoreFormula } from "../src/components/score-formula";
import { FIXTURE_FORMULA_NOTE, FIXTURE_FORMULA_TEXT, FORMULA, INDIVIDUAL_FORMULA_TEXT } from "../src/lib/formula";
import { DEFAULT_PARAMS } from "../src/lib/scoring";

describe("ScoreFormula", () => {
  it("shows attack contribution, scaled defensive contribution, and FPL points note", () => {
    const html = renderToStaticMarkup(<ScoreFormula params={DEFAULT_PARAMS} />);
    expect(html).toContain(INDIVIDUAL_FORMULA_TEXT);
    expect(html).toContain("AtkCon");
    expect(html).toContain(`DefCon × ${FORMULA.defcon}`);
    expect(html).toContain("official bonus");
    expect(html).toContain(`team DefCon × ${FORMULA.teamDefcon}`);
    expect(html).not.toContain("position factor");
    expect(html).not.toContain("Match bonus");
    expect(html).toContain(FIXTURE_FORMULA_TEXT);
    expect(html).toContain(FIXTURE_FORMULA_NOTE);
    expect(html).toContain("fixed difficulty scale");
  });
});
