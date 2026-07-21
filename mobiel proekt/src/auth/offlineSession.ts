export type OfflineSessionState = {
  userId: string;
  fullName: string;
  lastOnlineLoginAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
};

export function isOfflineSessionValid(session: OfflineSessionState) {
  // Offline authorization belongs to the enrolled device and is not tied to
  // access/refresh token expiry. It ends only after explicit revocation or a
  // manual logout.
  return !session.revokedAt;
}
