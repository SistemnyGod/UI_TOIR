export type OfflineSessionState = {
  contourId?: string;
  userId: string;
  fullName: string;
  lastOnlineLoginAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
  requiresReenrollment?: boolean;
};

export function isOfflineSessionValid(session: OfflineSessionState, expectedContourId?: string) {
  // Offline authorization belongs to the enrolled device and is not tied to
  // access/refresh token expiry. It ends only after explicit revocation or a
  // manual logout.
  return !session.revokedAt && (!expectedContourId || session.contourId === expectedContourId);
}
