export type OfflineSessionState = {
  contourId?: string;
  userId: string;
  fullName: string;
  lastOnlineLoginAt: string;
  expiresAt: string;
  offlineExpiresAt?: string;
  deviceTrusted?: boolean;
  userBlockedAt?: string | null;
  deviceBlockedAt?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  requiresReenrollment?: boolean;
};

export function isOfflineSessionValid(session: OfflineSessionState, expectedContourId?: string) {
  // Offline authorization belongs to the enrolled device and is not tied to
  // access/refresh token expiry. It ends only after explicit revocation or a
  // local/server security guard. Legacy sessions do not have deviceTrusted;
  // those sessions were created before the field existed and remain trusted
  // until the server records an explicit block.
  return !session.revokedAt
    && !session.userBlockedAt
    && !session.deviceBlockedAt

    && session.deviceTrusted !== false
    && (!expectedContourId || session.contourId === expectedContourId);
}
