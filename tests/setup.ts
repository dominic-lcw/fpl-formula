import { beforeAll } from "vitest";
import { setupTestDatabase } from "../src/lib/db";

beforeAll(async () => {
  await setupTestDatabase();
});
