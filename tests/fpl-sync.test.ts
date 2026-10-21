import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fpl-hydrate", () => ({
  syncCurrentSeasonFromFpl: vi.fn(async () => ({
    season: "2026-27",
    records: 42,
    syncedAt: "2026-10-20T12:00:00.000Z",
  })),
}));

describe("POST /api/sync", () => {
  it("returns the current-season sync payload", async () => {
    const { POST } = await import("../src/app/api/sync/route");
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      season: "2026-27",
      records: 42,
      syncedAt: "2026-10-20T12:00:00.000Z",
    });
  });
});
