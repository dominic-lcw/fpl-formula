import { describe, expect, it } from "vitest";
import { summarizeGameweeks } from "../src/lib/fpl-gameweeks";

describe("summarizeGameweeks", () => {
  it("distinguishes the active gameweek from the latest completed one", () => {
    expect(summarizeGameweeks([
      { id: 1, finished: true, is_current: false, is_next: false },
      { id: 2, finished: false, is_current: true, is_next: false },
      { id: 3, finished: false, is_current: false, is_next: true },
    ])).toEqual({
      currentGameweek: 2,
      currentGameweekStatus: "in_progress",
      latestFinishedGameweek: 1,
    });
  });

  it("reports the next gameweek after the current one is complete", () => {
    expect(summarizeGameweeks([
      { id: 1, finished: true, is_current: false, is_next: false },
      { id: 2, finished: true, is_current: false, is_next: false },
      { id: 3, finished: false, is_current: false, is_next: true },
    ])).toEqual({
      currentGameweek: 3,
      currentGameweekStatus: "upcoming",
      latestFinishedGameweek: 2,
    });
  });
});
