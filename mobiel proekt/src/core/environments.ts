import Constants from "expo-constants";

export type EnvironmentName = "dev" | "test" | "local-enterprise" | "production";

const configuredProductionApiBaseUrl = typeof Constants.expoConfig?.extra?.productionApiBaseUrl === "string"
  ? Constants.expoConfig.extra.productionApiBaseUrl.trim()
  : "";
const configuredPublicApiBaseUrl = typeof Constants.expoConfig?.extra?.publicApiBaseUrl === "string"
  ? Constants.expoConfig.extra.publicApiBaseUrl.trim()
  : "";
const localEnterpriseAllowedBaseUrls = uniqueValues([
  "http://192.168.2.194:5173",
  "http://192.168.2.194",
  configuredPublicApiBaseUrl
]);

export type MobileEnvironment = {
  name: EnvironmentName;
  apiBaseUrl: string;
  contourId: string;
  allowedBaseUrls: string[];
  syncProtocolVersion: "1.0";
};

export const environments: Record<EnvironmentName, MobileEnvironment> = {
  dev: {
    name: "dev",
    apiBaseUrl: "http://192.168.2.194:5173",
    contourId: "patrol360-dev",
    allowedBaseUrls: localEnterpriseAllowedBaseUrls,
    syncProtocolVersion: "1.0"
  },
  test: {
    name: "test",
    apiBaseUrl: "https://test.patrol360.local",
    contourId: "patrol360-test",
    allowedBaseUrls: ["https://test.patrol360.local"],
    syncProtocolVersion: "1.0"
  },
  "local-enterprise": {
    name: "local-enterprise",
    apiBaseUrl: "http://192.168.2.194:5173",
    contourId: "patrol360-local-enterprise",
    allowedBaseUrls: localEnterpriseAllowedBaseUrls,
    syncProtocolVersion: "1.0"
  },
  production: {
    name: "production",
    apiBaseUrl: configuredProductionApiBaseUrl,
    contourId: "patrol360-production",
    allowedBaseUrls: configuredProductionApiBaseUrl ? [configuredProductionApiBaseUrl] : [],
    syncProtocolVersion: "1.0"
  }
};

export const defaultEnvironment = environments[resolveDefaultEnvironmentName(Constants.expoConfig?.extra?.defaultEnvironment)];

export const currentContourId = defaultEnvironment.contourId;

function resolveDefaultEnvironmentName(value: unknown): EnvironmentName {
  return typeof value === "string" && isEnvironmentName(value) ? value : "local-enterprise";
}

function isEnvironmentName(value: string): value is EnvironmentName {
  return value === "dev"
    || value === "test"
    || value === "local-enterprise"
    || value === "production";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
