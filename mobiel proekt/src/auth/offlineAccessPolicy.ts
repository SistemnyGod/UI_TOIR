import type { OfflineSessionState } from "@/auth/offlineSession";

export type OfflineAccessMode = "full" | "emergency" | "denied";

export type OfflineAccessReason =
  | "allowed"
  | "authenticationRequired"
  | "offlineExpired"
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
  now?: Date;
  authenticationSatisfied?: boolean;
  expectedContourId?: string;
};

/**
 * Decides whether a stored session may unlock the writable application.
 * Expired sessions can only enter the isolated emergency mode after local
 * authentication; they never unlock the work tabs.
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

  if (session.deviceTrusted !== true) {
    return denied("deviceNotTrusted");
  }

  if (options.authenticationSatisfied !== true) {
    return denied("authenticationRequired");
  }

  const expiresAt = Date.parse(session.offlineExpiresAt ?? session.expiresAt);
  const now = (options.now ?? new Date()).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= now) {
    return {
      mode: "emergency",
      reason: "offlineExpired",
      canOpenWorkTabs: false
    };
  }

  return {
    mode: "full",
    reason: "allowed",
    canOpenWorkTabs: true
  };
}

function denied(reason: Exclude<OfflineAccessReason, "allowed" | "offlineExpired">): OfflineAccessDecision {
  return {
    mode: "denied",
    reason,
    canOpenWorkTabs: false
  };
}
