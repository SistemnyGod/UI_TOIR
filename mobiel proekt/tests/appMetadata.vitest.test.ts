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

  it("keeps device metadata within the mobile login contract", () => {
    const metadata = resolveRuntimeMetadata({
      expoVersion: "1".repeat(41),
      nativeBuildVersion: "25",
      platformName: "Android",
      osVersion: "custom-build-".repeat(10),
      manufacturer: "Manufacturer",
      modelName: "M".repeat(180)
    });

    expect(metadata.appVersion).toHaveLength(40);
    expect(metadata.platform.length).toBeLessThanOrEqual(80);
    expect(metadata.deviceName.length).toBeLessThanOrEqual(160);
  });
});
