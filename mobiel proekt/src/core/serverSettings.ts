import * as SecureStore from "expo-secure-store";

import { currentContourId, defaultEnvironment } from "@/core/environments";
import { orderServerCandidateBaseUrls } from "@/core/serverCandidatePolicy";

const serverBaseUrlKey = `patrol360.serverBaseUrl.${currentContourId}`;

export const localLanServerBaseUrl = "http://192.168.2.194:5173";
export const defaultServerBaseUrl = defaultEnvironment.apiBaseUrl;

export type MobileRuntimeConfig = {
  apiBaseUrl: string;
  contourId: string;
  allowedBaseUrls: string[];
  syncProtocolVersion: "1.0";
};

export async function getServerBaseUrl() {
  const storedValue = await SecureStore.getItemAsync(serverBaseUrlKey);
  if (!storedValue) {
    return defaultServerBaseUrl;
  }

  let normalizedValue: string;
  try {
    normalizedValue = normalizeServerBaseUrl(storedValue);
  } catch {
    await SecureStore.deleteItemAsync(serverBaseUrlKey).catch(() => undefined);
    return defaultServerBaseUrl;
  }

  if (!isAllowedServerBaseUrl(normalizedValue)) {
    await SecureStore.deleteItemAsync(serverBaseUrlKey).catch(() => undefined);
    return defaultServerBaseUrl;
  }

  if (normalizedValue !== storedValue) {
    await SecureStore.setItemAsync(serverBaseUrlKey, normalizedValue).catch(() => undefined);
  }

  return normalizedValue;
}

export async function getServerCandidateBaseUrls(preferredBaseUrl?: string) {
  const storedValue = await SecureStore.getItemAsync(serverBaseUrlKey);
  const candidates = orderServerCandidateBaseUrls({
    primaryBaseUrl: isLocalEnvironment() ? localLanServerBaseUrl : undefined,
    preferredBaseUrl,
    storedBaseUrl: storedValue ?? undefined,
    allowedBaseUrls: defaultEnvironment.allowedBaseUrls
  });

  return uniqueNormalizedUrls(candidates).filter(isAllowedServerBaseUrl);
}

export async function getMobileRuntimeConfig(): Promise<MobileRuntimeConfig> {
  return {
    apiBaseUrl: await getServerBaseUrl(),
    contourId: currentContourId,
    allowedBaseUrls: defaultEnvironment.allowedBaseUrls,
    syncProtocolVersion: defaultEnvironment.syncProtocolVersion
  };
}

export async function setServerBaseUrl(value: string) {
  const normalizedValue = normalizeServerBaseUrl(value);
  if (!isAllowedServerBaseUrl(normalizedValue)) {
    throw new Error(`Адрес сервера не разрешён для контура ${currentContourId}.`);
  }

  await SecureStore.setItemAsync(serverBaseUrlKey, normalizedValue);
  return normalizedValue;
}

export async function resetServerBaseUrl() {
  await SecureStore.deleteItemAsync(serverBaseUrlKey);
  return defaultServerBaseUrl;
}

export async function setLocalLanServerBaseUrl() {
  return setServerBaseUrl(localLanServerBaseUrl);
}

function uniqueNormalizedUrls(values: (string | null | undefined)[]) {
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    try {
      const normalizedValue = normalizeServerBaseUrl(value);
      if (!result.includes(normalizedValue)) {
        result.push(normalizedValue);
      }
    } catch {
      // Invalid saved values are ignored and cannot become an API target.
    }
  }

  return result;
}

function isLocalEnvironment() {
  return defaultEnvironment.name === "dev" || defaultEnvironment.name === "local-enterprise";
}

export function isAllowedServerBaseUrl(value: string) {
  const normalizedAllowedUrls = defaultEnvironment.allowedBaseUrls.map((allowedUrl) => normalizeServerBaseUrl(allowedUrl));
  return normalizedAllowedUrls.includes(value);
}

export function normalizeServerBaseUrl(value: string) {
  const trimmedValue = value.trim().replace(/\/+$/, "");

  if (!trimmedValue) {
    throw new Error("Укажите адрес сервера.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;

  if (/\s/.test(withProtocol)) {
    throw new Error("Адрес сервера не должен содержать пробелы.");
  }

  try {
    const parsedUrl = new URL(withProtocol);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error();
    }

    if (!parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
      throw new Error();
    }

    if (parsedUrl.hostname === "192.168.2.194" && (!parsedUrl.port || parsedUrl.port === "5000")) {
      parsedUrl.protocol = "http:";
      parsedUrl.port = "5173";
    }

    parsedUrl.pathname = normalizeServerBasePath(parsedUrl.pathname);
    parsedUrl.search = "";
    parsedUrl.hash = "";

    return parsedUrl.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("Укажите корректный адрес сервера.");
  }
}

function normalizeServerBasePath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "");

  if (!normalizedPath || normalizedPath === "/") {
    return "";
  }

  if (/^\/api(\/v\d+)?(\/.*)?$/i.test(normalizedPath)) {
    return "";
  }

  return normalizedPath;
}

export function isPilotHttpServer(value: string) {
  return value.toLowerCase().startsWith("http://");
}