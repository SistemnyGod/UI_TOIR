import assert from "node:assert/strict";
import test from "node:test";

import { canReclaimLocalMedia } from "../src/domain/files/localMediaRetention.ts";

test("expired server-linked media is reclaimable while its metadata remains eligible for retention", () => {
  const expiredLinkedFile = {
    status: "linked" as const,
    linkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    serverFileId: "server-file-1",
    sha256: "sha-1",
    sizeBytes: 1024
  };

  assert.equal(canReclaimLocalMedia(expiredLinkedFile), true);
  assert.equal(canReclaimLocalMedia({
    ...expiredLinkedFile,
    linkedAt: new Date().toISOString()
  }), false);
  assert.equal(canReclaimLocalMedia({ ...expiredLinkedFile, status: "uploaded" }), false);
});