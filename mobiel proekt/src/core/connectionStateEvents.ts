export type MobileConnectionOutcome = "connected" | "serverUnavailable" | "authorizationRequired" | "authorizationRecovered";

export type MobileConnectionOutcomeEvent = {
  outcome: MobileConnectionOutcome;
  contextGeneration: number;
};

const listeners = new Set<(event: MobileConnectionOutcomeEvent) => void>();
const contextListeners = new Set<(generation: number) => void>();
let contextGeneration = 0;

export function getMobileConnectionContextGeneration() {
  return contextGeneration;
}

export function invalidateMobileConnectionContext() {
  contextGeneration += 1;
  contextListeners.forEach((listener) => listener(contextGeneration));
  return contextGeneration;
}

export function subscribeToMobileConnectionContext(listener: (generation: number) => void) {
  contextListeners.add(listener);
  return () => contextListeners.delete(listener);
}

export function recordMobileConnectionOutcome(
  outcome: MobileConnectionOutcome,
  requestContextGeneration = contextGeneration
) {
  const event = { outcome, contextGeneration: requestContextGeneration };
  listeners.forEach((listener) => listener(event));
}

export function subscribeToMobileConnectionOutcomes(listener: (event: MobileConnectionOutcomeEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const reachabilityListeners = new Set<() => void>();

/** Raised once when the server answers again after it was unreachable on a usable network. */
export function publishServerReachabilityRestored() {
  reachabilityListeners.forEach((listener) => listener());
}

export function subscribeToServerReachabilityRestored(listener: () => void) {
  reachabilityListeners.add(listener);
  return () => { reachabilityListeners.delete(listener); };
}
