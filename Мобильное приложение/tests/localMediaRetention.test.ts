import assert from "node:assert/strict";
import test from "node:test";

import { canReclaimLocalMedia } from "../src/domain/files/localMediaRetention.ts";

test("only server-linked media can be reclaimed", () => {
  assert.equal(canReclaimLocalMedia("linked"), true);
  for (const status of ["localOnly", "queued", "uploading", "uploaded", "retryLater"] as const) {
    assert.equal(canReclaimLocalMedia(status), false, `${status} must remain local`);
  }
});
