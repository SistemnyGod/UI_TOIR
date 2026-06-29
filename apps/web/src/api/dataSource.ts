import type { DataSourceMode } from "../types";

export const dataSourceModes: DataSourceMode[] = ["mock", "api"];

interface ViteImportMeta {
  env?: {
    VITE_ENABLE_MOCK_MODE?: string;
    VITE_DATA_SOURCE_MODE?: string;
  };
}

interface RuntimeProcess {
  process?: {
    env?: {
      VITE_ENABLE_MOCK_MODE?: string;
      VITE_DATA_SOURCE_MODE?: string;
    };
  };
  __PATROL360_RUNTIME_ENV__?: {
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
  return getConfiguredDataSourceMode() ?? "api";
}

export function getConfiguredDataSourceMode(): DataSourceMode | null {
  const configuredMode = getRuntimeEnv().VITE_DATA_SOURCE_MODE;
  return isDataSourceMode(configuredMode) ? configuredMode : null;
}

export function getDataSourceLabel(mode: DataSourceMode) {
  return mode === "api" ? "API" : "Локально";
}

function canUseMockDataSource() {
  const env = getRuntimeEnv();
  const mockEnabled = env?.VITE_ENABLE_MOCK_MODE === "true" || env?.VITE_ENABLE_MOCK_MODE === "1";
  if (!mockEnabled) return false;

  if (typeof window === "undefined") return true;

  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function getRuntimeEnv() {
  const viteEnv = (import.meta as ViteImportMeta).env;
  const runtime = globalThis as typeof globalThis & RuntimeProcess;
  const explicitRuntimeEnv = runtime.__PATROL360_RUNTIME_ENV__;
  const processEnv = runtime.process?.env;
  return {
    VITE_DATA_SOURCE_MODE: explicitRuntimeEnv?.VITE_DATA_SOURCE_MODE ?? processEnv?.VITE_DATA_SOURCE_MODE ?? viteEnv?.VITE_DATA_SOURCE_MODE,
    VITE_ENABLE_MOCK_MODE: explicitRuntimeEnv?.VITE_ENABLE_MOCK_MODE ?? processEnv?.VITE_ENABLE_MOCK_MODE ?? viteEnv?.VITE_ENABLE_MOCK_MODE,
  };
}
