type ConnectionState = {
  isConnected: boolean | null | undefined;
};

/**
 * NetInfo's `isInternetReachable` describes public Internet reachability, not
 * whether a configured corporate/LAN API can be reached.  A connected device
 * must therefore be allowed to attempt the bounded API health check.
 */
export function canAttemptServerConnection(state: ConnectionState) {
  return state.isConnected === true;
}
