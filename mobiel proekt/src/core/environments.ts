import Constants from "expo-constants";

export type EnvironmentName = "dev" | "test" | "local-enterprise" | "production";

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
    allowedBaseUrls: ["http://192.168.2.194:5173", "http://192.168.2.194"],
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
    allowedBaseUrls: ["http://192.168.2.194:5173", "http://192.168.2.194"],
    syncProtocolVersion: "1.0"
  },
  production: {
    name: "production",
    apiBaseUrl: "https://patrol360.example.com",
    contourId: "patrol360-production",
    allowedBaseUrls: ["https://patrol360.example.com"],
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