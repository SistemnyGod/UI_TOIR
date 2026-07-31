import type { OfflineSessionState } from "@/auth/offlineSession";

export type OfflineAccessMode = "full" | "denied";

export type OfflineAccessReason =
  | "allowed"
  | "authenticationRequired"
  | "deviceNotTrusted"
  | "userBlocked"
  | "deviceBlocked"
  | "sessionRevoked"
  | "sessionInvalid";

export type OfflineAccessDecision = {
  mode: OfflineAccessMode;
  reason: OfflineAccessReason;
  canOpenWorkTabs: boolean;
};

type EvaluateOfflineAccessOptions = {
  authenticationSatisfied?: boolean;
  expectedContourId?: string;
};

/**
 * Decides whether a stored session may unlock the writable application.
 * Legacy expiry fields are retained in stored sessions for compatibility, but
 * offline work ends only after explicit revocation or a device/account guard.
 */
export function evaluateOfflineAccess(
  session: OfflineSessionState | null,
  options: EvaluateOfflineAccessOptions = {}
): OfflineAccessDecision {
  if (!session) {
    return denied("sessionInvalid");
  }

  if (options.expectedContourId && session.contourId !== options.expectedContourId) {
    return denied("sessionInvalid");
  }

  if (session.revokedAt) {
    return denied("sessionRevoked");
  }

  if (session.userBlockedAt) {
    return denied("userBlocked");
  }

  if (session.deviceBlockedAt) {
    return denied("deviceBlocked");
  }

  // deviceTrusted was added after the first mobile releases. Preserve
  // existing enrolled sessions unless the server explicitly marks them as
  // untrusted; a missing value is a legacy trusted session.
  if (session.deviceTrusted === false) {
    return denied("deviceNotTrusted");
  }

  if (options.authenticationSatisfied !== true) {
    return denied("authenticationRequired");
  }

  return {
    mode: "full",
    reason: "allowed",
    canOpenWorkTabs: true
  };
}

function denied(reason: Exclude<OfflineAccessReason, "allowed">): OfflineAccessDecision {
  return {
    mode: "denied",
    reason,
    canOpenWorkTabs: false
  };
}
