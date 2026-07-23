import { isOfflineSessionValid } from "./offlineSession.ts";
import type { OfflineSessionState } from "./offlineSession.ts";

export type SessionRestoreDecision = "resume" | "offline-unlock" | "login";

type SessionRestoreInput = {
  accessToken: string | null;
  ownerUserId: string | null;
  offlineSession: OfflineSessionState | null;
  contourId: string;
};

export function resolveSessionRestoreDecision({
  accessToken,
  ownerUserId,
  offlineSession,
  contourId
}: SessionRestoreInput): SessionRestoreDecision {
  const hasValidLocalSession = Boolean(
    ownerUserId
      && offlineSession
      && offlineSession.userId === ownerUserId
      && isOfflineSessionValid(offlineSession, contourId)
  );

  if (!hasValidLocalSession) {
    return "login";
  }

  return accessToken ? "resume" : "offline-unlock";
}