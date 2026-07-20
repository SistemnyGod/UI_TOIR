type SessionGateListener = (isUnlocked: boolean) => void;

let sessionUnlocked = false;
const listeners = new Set<SessionGateListener>();
let pendingRoute: string | null = null;

export function isSessionUnlocked() {
  return sessionUnlocked;
}

export function markSessionUnlocked() {
  sessionUnlocked = true;
  notifyListeners();
}

export function lockSession() {
  sessionUnlocked = false;
  notifyListeners();
}

export function subscribeToSessionGate(listener: SessionGateListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPendingSessionRoute(route: string) {
  if (isSafeReturnRoute(route)) {
    pendingRoute = route;
  }
}

export function consumePendingSessionRoute() {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

function notifyListeners() {
  for (const listener of listeners) {
    listener(sessionUnlocked);
  }
}

function isSafeReturnRoute(route: string) {
  return /^\/(patrol|camera|settings|work-accounting|all-points|profile)(\/|$)/.test(route);
}

