import type { DataSourceMode } from "../types";

export const dataSourceModes: DataSourceMode[] = ["mock", "api"];

export function isDataSourceMode(value: unknown): value is DataSourceMode {
  return value === "mock" || value === "api";
}

export function getDataSourceLabel(mode: DataSourceMode) {
  return mode === "api" ? "API" : "Mock";
}
