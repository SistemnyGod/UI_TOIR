import { describe, expect, it } from "vitest";

import { countWaitingAuthItems } from "@/features/syncQueue/syncQueueAuthPolicy";

describe("очередь, ожидающая подтверждения входа", () => {
  it("считает только waiting_auth и не смешивает его с сетевыми повторами", () => {
    expect(countWaitingAuthItems([
      { status: "waiting_auth" },
      { status: "waiting_network" },
      { status: "retryLater" },
      { status: "waiting_auth" }
    ])).toBe(2);
  });
});