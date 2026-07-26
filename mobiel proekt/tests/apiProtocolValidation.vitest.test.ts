import { describe, expect, it, vi } from "vitest";

import { bootstrapResponseSchema } from "@/api/schemas";
import { MobileApiProtocolError, parseMobileResponse } from "@/api/protocolValidation";

const invalidBootstrap = {
  user: {
    serverUserId: "user-1",
    fullName: "Operator",
    roles: ["mobile"],
    permissions: ["patrol.read"],
    updatedAtServer: "2026-07-26T10:00:00Z"
  },
  device: {
    deviceId: "device-1",
    ownerUserId: "user-1",
    trusted: true,
    blockedAt: null
  },
  boundEmployees: [],
  emuSections: [],
  requestBoard: [],
  assignments: [],
  routes: [{
    name: "Route",
    version: 1,
    allowFreeOrder: true,
    nfcEnabled: true,
    qrFallbackEnabled: true
  }],
  points: [],
  serverTime: "2026-07-26T10:00:00Z",
  syncCursor: null,
  contourId: "patrol360-local-enterprise"
};

describe("mobile API protocol validation", () => {
  it("rejects bootstrap without routeId before local persistence", () => {
    const persist = vi.fn();

    expect(() => {
      const parsed = parseMobileResponse(bootstrapResponseSchema, invalidBootstrap);
      persist(parsed);
    }).toThrow(MobileApiProtocolError);

    expect(persist).not.toHaveBeenCalled();
  });
});