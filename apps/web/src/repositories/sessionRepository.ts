import { ApiClient } from "../api/client";
import type { AuthSessionDto, LoginRequestDto, SessionUserDto } from "../api/contracts";

export const sessionTokenStorageKey = "patrol360.sessionToken";
export const sessionExpiresAtStorageKey = "patrol360.sessionExpiresAt";
export const sessionRememberStorageKey = "patrol360.sessionRememberMe";
export const sessionLastLoginStorageKey = "patrol360.lastLogin";

export interface SessionRepository {
  login(payload: LoginRequestDto): Promise<AuthSessionDto>;
  me(): Promise<SessionUserDto>;
  logout(): Promise<void>;
}

export function createSessionRepository({ baseUrl }: { baseUrl?: string } = {}): SessionRepository {
  const client = new ApiClient({ baseUrl, getAuthToken: getStoredSessionToken });

  return {
    login(payload) {
      return client.post<AuthSessionDto, LoginRequestDto>("/api/v1/auth/login", payload);
    },
    me() {
      return client.get<SessionUserDto>("/api/v1/auth/me");
    },
    logout() {
      return client.post<void>("/api/v1/auth/logout");
    },
  };
}

export function getStoredSessionToken() {
  clearExpiredStoredSession();
  return safeLocalStorage()?.getItem(sessionTokenStorageKey) ?? safeSessionStorage()?.getItem(sessionTokenStorageKey) ?? undefined;
}

export function setStoredSessionToken(token: string, rememberMe = false, expiresAt?: string) {
  clearStoredSessionToken();
  const storage = rememberMe ? safeLocalStorage() : safeSessionStorage();
  const fallbackStorage = rememberMe ? safeSessionStorage() : safeLocalStorage();
  const targetStorage = storage ?? fallbackStorage;
  targetStorage?.setItem(sessionTokenStorageKey, token);
  if (expiresAt) {
    targetStorage?.setItem(sessionExpiresAtStorageKey, expiresAt);
  }
  safeLocalStorage()?.setItem(sessionRememberStorageKey, rememberMe ? "true" : "false");
}

export function clearStoredSessionToken() {
  safeLocalStorage()?.removeItem(sessionTokenStorageKey);
  safeLocalStorage()?.removeItem(sessionExpiresAtStorageKey);
  safeSessionStorage()?.removeItem(sessionTokenStorageKey);
  safeSessionStorage()?.removeItem(sessionExpiresAtStorageKey);
}

export function getStoredRememberMe() {
  return safeLocalStorage()?.getItem(sessionRememberStorageKey) === "true";
}

export function getStoredLastLogin() {
  return safeLocalStorage()?.getItem(sessionLastLoginStorageKey) ?? "";
}

export function setStoredLastLogin(login: string) {
  const normalizedLogin = login.trim();
  if (!normalizedLogin) return;
  safeLocalStorage()?.setItem(sessionLastLoginStorageKey, normalizedLogin);
}

function clearExpiredStoredSession() {
  const localExpiresAt = safeLocalStorage()?.getItem(sessionExpiresAtStorageKey);
  const sessionExpiresAt = safeSessionStorage()?.getItem(sessionExpiresAtStorageKey);
  const expiresAt = localExpiresAt ?? sessionExpiresAt;
  if (!expiresAt) return;

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    clearStoredSessionToken();
  }
}

function safeLocalStorage() {
  const runtime = globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
  };

  if (runtime.process?.versions?.node || typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function safeSessionStorage() {
  const runtime = globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
  };

  if (runtime.process?.versions?.node || typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
