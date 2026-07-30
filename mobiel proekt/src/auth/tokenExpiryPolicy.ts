const refreshSkewMs = 60_000;

/**
 * Legacy installations may not have a locally stored expiry timestamp. In
 * that case the API's 401 path remains the source of truth and performs the
 * refresh, so missing metadata must not lock the user out locally.
 */
export function shouldRefreshAccessToken(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) {
    return false;
  }

  const expiryTime = Date.parse(expiresAt);
  return Number.isFinite(expiryTime) && expiryTime <= now + refreshSkewMs;
}
