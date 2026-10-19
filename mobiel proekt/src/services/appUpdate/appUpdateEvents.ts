// Dependency-free bridge from the HTTP layer to the update controller, so
// httpClient does not import Expo file-system or installer modules.
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToServerAppUpdateRequired(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Called when the server answers 426 app_update_required. */
export function reportServerAppUpdateRequired() {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* a listener must not break the request path */ }
  }
}
