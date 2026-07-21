import assert from "node:assert/strict";
import test from "node:test";

import { isPhotoEvidenceRequired } from "../src/domain/patrol/photoEvidencePolicy.ts";

test("an OK point never requires photo evidence", () => {
  assert.equal(isPhotoEvidenceRequired(true, "ok"), false);
});

test("configured issue and skipped states require photo evidence", () => {
  assert.equal(isPhotoEvidenceRequired(true, "issue"), true);
  assert.equal(isPhotoEvidenceRequired(true, "skipped"), true);
});

test("pending and deferred points do not add a duplicate photo problem", () => {
  assert.equal(isPhotoEvidenceRequired(true, "pending"), false);
  assert.equal(isPhotoEvidenceRequired(true, "deferred"), false);
});

test("photo evidence stays optional when the route point does not require it", () => {
  assert.equal(isPhotoEvidenceRequired(false, "issue"), false);
  assert.equal(isPhotoEvidenceRequired(false, "skipped"), false);
});
