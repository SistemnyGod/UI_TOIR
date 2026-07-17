import assert from "node:assert/strict";
import test from "node:test";

import { mergeNotificationReadState } from "../src/services/notificationReadState.ts";

test("notification sync does not turn a locally read item back to unread", () => {
  assert.deepEqual(
    mergeNotificationReadState(
      { readAt: "2026-07-16T10:00:00.000Z", readSyncPending: true },
      null
    ),
    { readAt: "2026-07-16T10:00:00.000Z", readSyncPending: true }
  );

  assert.deepEqual(
    mergeNotificationReadState(
      { readAt: "2026-07-16T10:00:00.000Z", readSyncPending: true },
      "2026-07-16T10:01:00.000Z"
    ),
    { readAt: "2026-07-16T10:01:00.000Z", readSyncPending: false }
  );
});
