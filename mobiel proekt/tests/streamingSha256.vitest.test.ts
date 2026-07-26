import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StreamingSha256 } from "@/sync/streamingSha256";

describe("StreamingSha256", () => {
  it("matches the server-compatible SHA-256 for a 20 MB payload read in chunks", () => {
    const chunk = new Uint8Array(64 * 1024);
    for (let index = 0; index < chunk.length; index += 1) {
      chunk[index] = (index * 31) & 0xff;
    }

    const hasher = new StreamingSha256();
    const reference = createHash("sha256");
    const totalBytes = 20 * 1024 * 1024;

    for (let offset = 0; offset < totalBytes; offset += chunk.length) {
      hasher.update(chunk);
      reference.update(chunk);
    }

    expect(hasher.digestHex()).toBe(reference.digest("hex"));
  });
});
