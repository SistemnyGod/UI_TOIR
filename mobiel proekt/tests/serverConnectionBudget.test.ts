import assert from "node:assert/strict";
import test from "node:test";

import { serverConnectionProbeBudgetMs } from "../src/api/serverConnectionPolicy.ts";

test("connection probe budget is positive and shorter than two full health probe timeouts", () => {
  assert.ok(serverConnectionProbeBudgetMs > 0);
  assert.ok(serverConnectionProbeBudgetMs < 16_000);
});
