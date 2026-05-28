export type OfflineSessionState = {
  userId: string;
  fullName: string;
  lastOnlineLoginAt: string;
  expiresAt: string;
};

export function isOfflineSessionValid(session: OfflineSessionState, now = new Date()) {
  return new Date(session.expiresAt).getTime() > now.getTime();
}
