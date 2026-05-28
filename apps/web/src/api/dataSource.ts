import type { DataSourceMode } from "../types";

export const dataSourceModes: DataSourceMode[] = ["mock", "api"];

interface ViteImportMeta {
  env?: {
    VITE_ENABLE_MOCK_MODE?: string;
    VITE_DATA_SOURCE_MODE?: string;
  };
}

export function isDataSourceMode(value: unknown): value is DataSourceMode {
  if (value === "api") return true;
  if (value === "mock") return canUseMockDataSource();
  return false;
}

export function getDefaultDataSourceMode(): DataSourceMode {
  const configuredMode = (import.meta as ViteImportMeta).env?.VITE_DATA_SOURCE_MODE;
  return isDataSourceMode(configuredMode) ? configuredMode : "api";
}

export function getDataSourceLabel(mode: DataSourceMode) {
  return mode === "api" ? "API" : "Локально";
}

function canUseMockDataSource() {
  const env = (import.meta as ViteImportMeta).env;
  const mockEnabled = env?.VITE_ENABLE_MOCK_MODE === "true" || env?.VITE_ENABLE_MOCK_MODE === "1";
  if (!mockEnabled) return false;

  if (typeof window === "undefined") return true;

  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
