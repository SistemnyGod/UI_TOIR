import { mobileRequest } from "@/api/httpClient";
import { emptyResponseSchema, loginResponseSchema } from "@/api/schemas";
import { MobileDeviceDto, MobileUserDto } from "@/domain/patrol/patrolTypes";
import { getMobileRuntimeConfig } from "@/core/serverSettings";

export type LoginRequest = {
  login: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
};

export type LoginResponse = {
  user: MobileUserDto;
  device: MobileDeviceDto;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  contourId: string;
};

export async function login(payload: LoginRequest) {
  const runtimeConfig = await getMobileRuntimeConfig();
  return mobileRequest<LoginResponse>("/api/v1/mobile/auth/login", loginResponseSchema, {
    method: "POST",
    body: { ...payload, contourId: runtimeConfig.contourId },
    accessToken: null,
    skipAuthRefresh: true
  });
}

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export async function refresh(payload: RefreshRequest) {
  const runtimeConfig = await getMobileRuntimeConfig();
  return mobileRequest<LoginResponse>("/api/v1/mobile/auth/refresh", loginResponseSchema, {
    method: "POST",
    body: { ...payload, contourId: runtimeConfig.contourId },
    accessToken: null,
    skipAuthRefresh: true
  });
}

export function logout(accessToken?: string) {
  return mobileRequest<void>("/api/v1/mobile/auth/logout", emptyResponseSchema, {
    method: "POST",
    accessToken,
    skipAuthRefresh: true
  });
}