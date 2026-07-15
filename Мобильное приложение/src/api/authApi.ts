import { mobileRequest } from "@/api/httpClient";
import { MobileDeviceDto, MobileUserDto } from "@/domain/patrol/patrolTypes";

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
};

export function login(payload: LoginRequest) {
  return mobileRequest<LoginResponse>("/api/v1/mobile/auth/login", {
    method: "POST",
    body: payload,
    accessToken: null,
    skipAuthRefresh: true
  });
}

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export function refresh(payload: RefreshRequest) {
  return mobileRequest<LoginResponse>("/api/v1/mobile/auth/refresh", {
    method: "POST",
    body: payload,
    accessToken: null,
    skipAuthRefresh: true
  });
}

export function logout(accessToken?: string) {
  return mobileRequest<void>("/api/v1/mobile/auth/logout", {
    method: "POST",
    accessToken,
    skipAuthRefresh: true
  });
}
