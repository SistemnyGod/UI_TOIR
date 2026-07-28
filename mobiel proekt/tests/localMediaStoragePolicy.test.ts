import assert from "node:assert/strict";
import test from "node:test";

import {
  maximumManagedMediaBytes,
  minimumFreeStorageBytes,
  assessLocalMediaStorage
} from "../src/domain/files/localMediaStoragePolicy.ts";

test("new media is blocked before a pending file can exhaust device storage", () => {
  const pendingVideoBytes = 25 * 1024 * 1024;
  const quotaExceeded = assessLocalMediaStorage(
    2 * 1024 * 1024 * 1024,
    maximumManagedMediaBytes - pendingVideoBytes + 1,
    pendingVideoBytes
  );
  const insufficientFreeSpace = assessLocalMediaStorage(
    minimumFreeStorageBytes + pendingVideoBytes - 1,
    0,
    pendingVideoBytes
  );

  assert.equal(quotaExceeded.canPersist, false);
  assert.equal(quotaExceeded.status, "managedQuotaExceeded");
  assert.equal(insufficientFreeSpace.canPersist, false);
  assert.equal(insufficientFreeSpace.status, "insufficientFreeSpace");
});