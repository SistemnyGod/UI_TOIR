import assert from "node:assert/strict";
import test from "node:test";

import { findMissingClientFileIds } from "../src/sync/fileReferenceIntegrity.ts";

test("all referenced files must exist before a report is sent", () => {
  assert.deepEqual(
    findMissingClientFileIds(["photo-1", "photo-2"], ["photo-1"]),
    ["photo-2"]
  );
});

test("duplicate references produce one missing-file diagnostic", () => {
  assert.deepEqual(
    findMissingClientFileIds(["photo-1", "photo-1"], []),
    ["photo-1"]
  );
});

test("no missing references are reported when every file is available", () => {
  assert.deepEqual(
    findMissingClientFileIds(["photo-2", "photo-1"], ["photo-1", "photo-2"]),
    []
  );
});
