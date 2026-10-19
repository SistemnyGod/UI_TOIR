import * as SecureStore from "expo-secure-store";

import { getInstalledAppVersion } from "@/core/appVersion";
import { currentContourId, defaultEnvironment, localEnterpriseHttpsBaseUrl } from "@/core/environments";
import { orderServerCandidateBaseUrls } from "@/core/serverCandidatePolicy";

const serverBaseUrlKey = `patrol360.serverBaseUrl.${currentContourId}`;
const settingsListeners = new Set<() => void>();
let settingsMutationQueue: Promise<void> = Promise.resolve();
function enqueueSettingsMutation<T>(operation: () => Promise<T>): Promise<T> {
  const request = settingsMutationQueue.then(operation);
  settingsMutationQueue = request.then(() => undefined, () => undefined);
  return request;
}

function repairStoredServerValue(expected: string, normalized: string | null) {
  return enqueueSettingsMutation(async () => {
    if (await SecureStore.getItemAsync(serverBaseUrlKey) !== expected) return;
    if (normalized === null) await SecureStore.deleteItemAsync(serverBaseUrlKey);
    else await SecureStore.setItemAsync(serverBaseUrlKey, normalized);
  });
}
export function subscribeToServerSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => { settingsListeners.delete(listener); };
}

export const localLanServerBaseUrl = "http://192.168.2.194:5173";
export const localLanSecureServerBaseUrl = localEnterpriseHttpsBaseUrl;
export const defaultServerBaseUrl = defaultEnvironment.apiBaseUrl;

export type MobileRuntimeConfig = {
  apiBaseUrl: string;
  contourId: string;
  allowedBaseUrls: string[];
  syncProtocolVersion: "1.0";
  /** Installed Android versionCode; null in development builds. */
  appVersionCode?: number | null;
};

export async function getServerBaseUrl() {
  return readServerBaseUrl();
}

async function readServerBaseUrl(repair = true) {
  const storedValue = await SecureStore.getItemAsync(serverBaseUrlKey);
  if (!storedValue) {
    return defaultServerBaseUrl;
  }

  let normalizedValue: string;
  try {
    normalizedValue = normalizeServerBaseUrl(storedValue);
  } catch {
    if (repair) await repairStoredServerValue(storedValue, null).catch(() => undefined);
    return defaultServerBaseUrl;
  }

  if (!isAllowedServerBaseUrl(normalizedValue)) {
    if (repair) await repairStoredServerValue(storedValue, null).catch(() => undefined);
    return defaultServerBaseUrl;
  }

  if (repair && normalizedValue !== storedValue) {
    await repairStoredServerValue(storedValue, normalizedValue).catch(() => undefined);
  }

  return normalizedValue;
}

export async function getServerCandidateBaseUrls(preferredBaseUrl?: string) {
  const storedValue = await SecureStore.getItemAsync(serverBaseUrlKey);
  const candidates = orderServerCandidateBaseUrls({
    primaryBaseUrl: isLocalEnvironment() ? localLanSecureServerBaseUrl : undefined,
    preferredBaseUrl,
    storedBaseUrl: storedValue ?? undefined,
    allowedBaseUrls: defaultEnvironment.allowedBaseUrls
  });

  const normalizedPreferred = preferredBaseUrl ? normalizeServerBaseUrl(preferredBaseUrl) : undefined;
  const preferredScheme = normalizedPreferred ? new URL(normalizedPreferred).protocol : undefined;
  return uniqueNormalizedUrls(candidates)
    .filter(isAllowedServerBaseUrl)
    // HTTPS is deliberately sticky for one operation. A certificate failure
    // must be visible to the employee, never silently retried over HTTP.
    .filter((candidate) => preferredScheme !== "https:" || new URL(candidate).protocol === "https:");
}

export async function getMobileRuntimeConfig(): Promise<MobileRuntimeConfig> {
  return {
    apiBaseUrl: await getServerBaseUrl(),
    contourId: currentContourId,
    allowedBaseUrls: defaultEnvironment.allowedBaseUrls,
    syncProtocolVersion: defaultEnvironment.syncProtocolVersion,
    appVersionCode: getInstalledAppVersion().versionCode
  };
}

export function setServerBaseUrl(value: string, isCurrent?: () => boolean) {
  return enqueueSettingsMutation(() => setServerBaseUrlInternal(value, isCurrent));
}

async function setServerBaseUrlInternal(value: string, isCurrent?: () => boolean) {
  const normalizedValue = normalizeServerBaseUrl(value);
  if (!isAllowedServerBaseUrl(normalizedValue)) {
    throw new Error(`Адрес сервера не разрешён для контура ${currentContourId}.`);
  }

  if (isCurrent && !isCurrent()) throw new Error("Настройки сервера изменились. Устаревший адрес не сохранён.");
  const previous = await readServerBaseUrl(false);
  if (previous === normalizedValue) return normalizedValue;
  if (isCurrent && !isCurrent()) throw new Error("Настройки сервера изменились. Устаревший адрес не сохранён.");
  await SecureStore.setItemAsync(serverBaseUrlKey, normalizedValue);
  if (isCurrent && !isCurrent()) {
    await SecureStore.setItemAsync(serverBaseUrlKey, previous);
    throw new Error("Настройки сервера изменились. Устаревший адрес не сохранён.");
  }
  settingsListeners.forEach(listener => listener());
  return normalizedValue;
}

export async function resetServerBaseUrl() {
  return enqueueSettingsMutation(async () => {
    await SecureStore.deleteItemAsync(serverBaseUrlKey);
    settingsListeners.forEach(listener => listener());
    return defaultServerBaseUrl;
  });
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

    // HTTPS was briefly documented with the legacy HTTP development port.
    // Correct only that exact historical typo; persisted HTTP endpoints retain
    // their original protocol for installed clients.
    if (parsedUrl.protocol === "https:" && parsedUrl.hostname === "192.168.2.194" && parsedUrl.port === "5173") {
      parsedUrl.port = "";
    }

    // Preserve a scheme explicitly supplied by the employee. Only normalize
    // legacy HTTP addresses which historically pointed at the development port.
    if (parsedUrl.protocol === "http:" && parsedUrl.hostname === "192.168.2.194" && (!parsedUrl.port || parsedUrl.port === "5000")) {
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
