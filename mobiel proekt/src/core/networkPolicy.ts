type ConnectionState = {
  isConnected: boolean | null | undefined;
  isInternetReachable?: boolean | null;
  type?: string;
  details?: { isConnectionExpensive?: boolean; ipAddress?: string | null; ssid?: string | null; subnet?: string | null } | null;
};

/**
 * NetInfo's `isInternetReachable` describes public Internet reachability, not
 * whether a configured corporate/LAN API can be reached.  A connected device
 * must therefore be allowed to attempt the bounded API health check.
 */
export function canAttemptServerConnection(state: ConnectionState) {
  return state.isConnected === true;
}

/** A LAN route can disappear while cellular keeps isConnected true. */
export function networkRouteKey(state: ConnectionState) {
  return JSON.stringify([
    canAttemptServerConnection(state), state.type ?? null,
    state.details?.ipAddress ?? null, state.details?.subnet ?? null,
    state.type === 'wifi' ? state.details?.ssid ?? null : null
  ]);
}
