import assert from "node:assert/strict";
import test from "node:test";

import { orderServerCandidateBaseUrls } from "../src/core/serverCandidatePolicy.ts";

test("local enterprise prefers the last stored server before probing LAN", () => {
  const candidates = orderServerCandidateBaseUrls({
    primaryBaseUrl: "http://192.168.2.194:5173",
    preferredBaseUrl: "http://31.173.110.118",
    storedBaseUrl: "http://31.173.110.118",
    allowedBaseUrls: ["http://192.168.2.194:5173", "http://31.173.110.118"]
  });

  assert.deepEqual(candidates, ["http://31.173.110.118", "http://192.168.2.194:5173"]);
});
