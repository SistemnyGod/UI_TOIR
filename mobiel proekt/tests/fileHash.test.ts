import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { bytesToHex, decodeBase64Bytes } from "../src/sync/fileHash.ts";

test("file SHA-256 input is the decoded raw bytes, not the Base64 text", () => {
  const base64 = "/9j/AA==";
  const bytes = decodeBase64Bytes(base64);

  assert.deepEqual(Array.from(bytes), [0xff, 0xd8, 0xff, 0x00]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "374ffede23adbc8bc625205f4bf86750807ffb6ce71fc7d10cac8bded0872bf5");
  assert.notEqual(
    createHash("sha256").update(bytes).digest("hex"),
    createHash("sha256").update(base64, "utf8").digest("hex")
  );
});

test("native digest bytes are serialized as lowercase hexadecimal", () => {
  assert.equal(bytesToHex(Uint8Array.from([0, 15, 16, 255]).buffer), "000f10ff");
});

test("malformed Base64 is rejected before upload", () => {
  assert.throws(() => decodeBase64Bytes("abcde"), /Invalid Base64/);
  assert.throws(() => decodeBase64Bytes("not;base64"), /Invalid Base64/);
});
