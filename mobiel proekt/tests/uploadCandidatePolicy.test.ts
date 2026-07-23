import assert from "node:assert/strict";
import test from "node:test";

import { extractUploadClientFileIds } from "../src/sync/uploadCandidatePolicy.ts";

test("point media is selected for background upload before final report", () => {
  const ids = extractUploadClientFileIds({
    commandType: "markPatrolPointIssue",
    payload: { photoClientFileIds: ["photo-1", "video-1", "video-1", null] }
  });

  assert.deepEqual(ids, ["photo-1", "video-1", "video-1"]);
});

test("completion keeps media fallback for attachments not uploaded with point command", () => {
  const ids = extractUploadClientFileIds({
    commandType: "completePatrolAssignment",
    payload: {
      pointResults: [
        { photoClientFileIds: ["photo-2"] },
        { photoClientFileIds: ["video-2"] }
      ]
    }
  });

  assert.deepEqual(ids, ["photo-2", "video-2"]);
});