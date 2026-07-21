import assert from "node:assert/strict";
import test from "node:test";

import { shouldTryNextMobileServer } from "../src/api/serverFailoverPolicy.ts";

test("only gateway and protocol mismatches fail over to the next mobile server", () => {
  assert.equal(shouldTryNextMobileServer(503, "application/json"), true);
  assert.equal(shouldTryNextMobileServer(404, "text/html"), true);
  assert.equal(shouldTryNextMobileServer(200, "text/html"), true);
  assert.equal(shouldTryNextMobileServer(200, "application/json"), false);
  assert.equal(shouldTryNextMobileServer(401, "application/json"), false);
  assert.equal(shouldTryNextMobileServer(422, "application/json"), false);
});
