import { afterEach, describe, expect, it, vi } from "vitest";

describe("dataSource", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses explicit mock mode only when mock mode is enabled", async () => {
    vi.stubEnv("VITE_ENABLE_MOCK_MODE", "true");
    vi.stubEnv("VITE_DATA_SOURCE_MODE", "mock");
    const { getConfiguredDataSourceMode, getDefaultDataSourceMode, isDataSourceMode } = await import("../api/dataSource");

    expect(getConfiguredDataSourceMode()).toBe("mock");
    expect(getDefaultDataSourceMode()).toBe("mock");
    expect(isDataSourceMode("mock")).toBe(true);
  });

  it("uses explicit api mode as configured", async () => {
    vi.stubEnv("VITE_ENABLE_MOCK_MODE", "true");
    vi.stubEnv("VITE_DATA_SOURCE_MODE", "api");
    const { getConfiguredDataSourceMode, getDefaultDataSourceMode } = await import("../api/dataSource");

    expect(getConfiguredDataSourceMode()).toBe("api");
    expect(getDefaultDataSourceMode()).toBe("api");
  });

  it("falls back to api when mock mode is configured but disabled", async () => {
    vi.stubEnv("VITE_ENABLE_MOCK_MODE", "false");
    vi.stubEnv("VITE_DATA_SOURCE_MODE", "mock");
    const { getConfiguredDataSourceMode, getDefaultDataSourceMode, isDataSourceMode } = await import("../api/dataSource");

    expect(getConfiguredDataSourceMode()).toBeNull();
    expect(getDefaultDataSourceMode()).toBe("api");
    expect(isDataSourceMode("mock")).toBe(false);
  });
});
