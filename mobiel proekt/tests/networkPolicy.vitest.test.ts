import { describe, expect, it } from "vitest";

import { canAttemptServerConnection } from "@/core/networkPolicy";

describe("local network availability", () => {
  it("allows the local health check when Wi-Fi has no public Internet", () => {
    expect(canAttemptServerConnection({
      isConnected: true,
      isInternetReachable: false
    })).toBe(true);
  });
});