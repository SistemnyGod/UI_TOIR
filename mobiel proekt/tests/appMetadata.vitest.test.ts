import { describe, expect, it } from "vitest";

import { createLoginPayload, resolveRuntimeMetadata } from "@/auth/appMetadataPolicy";

describe("application runtime metadata", () => {
  it("puts the Expo config version into the login payload", () => {
    const metadata = resolveRuntimeMetadata({
      expoVersion: "1.4.2",
      nativeBuildVersion: "37",
      androidVersionCode: 36,
      platformName: "android",
      osVersion: "15",
      manufacturer: "Google",
      modelName: "Pixel 8"
    });

    const payload = createLoginPayload({
      login: "operator",
      password: "secret",
      deviceId: "device-1"
    }, metadata);

    expect(payload.appVersion).toBe("1.4.2");
    expect(payload.platform).toContain("build 37");
    expect(payload.deviceName).toBe("Google Pixel 8");
  });
});