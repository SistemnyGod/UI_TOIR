export type ConnectionStatus = 'offline' | 'checking' | 'connected' | 'serverUnavailable' | 'otherServer' | 'authorizationRequired';
type ProbeResult = { ok: boolean; failureKind?: string };

/** Owns freshness and result ordering independently of React screen lifetimes. */
export class ConnectionMonitor {
  status: ConnectionStatus = 'checking';
  private active = true;
  private online = false;
  private authRequired = false;
  private generation = 0;
  private contextGeneration = 0;
  private checkedAt = -Infinity;
  private pending: Promise<void> | null = null;

  constructor(private probe: () => Promise<ProbeResult>, private publish: (status: ConnectionStatus) => void,
    private now = () => Date.now()) {}

  private set(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.publish(status);
  }
  setContextGeneration(contextGeneration: number) {
    if (this.contextGeneration === contextGeneration) return;
    this.contextGeneration = contextGeneration;
    this.invalidate();
    this.checkedAt = -Infinity;
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.invalidate();
    else void this.check();
  }
  setNetwork(online: boolean, routeChanged = false) {
    if (this.online !== online || routeChanged) { this.invalidate(); this.checkedAt = -Infinity; }
    this.online = online;
    if (!online) this.set('offline');
    else {
      if (routeChanged) this.set('checking');
      void this.check();
    }
  }
  outcome(outcome: 'connected' | 'serverUnavailable' | 'authorizationRequired' | 'authorizationRecovered', requestContextGeneration = this.contextGeneration) {
    if (requestContextGeneration !== this.contextGeneration) return;
    this.invalidate();
    this.checkedAt = this.now();
    if (outcome === 'authorizationRequired') this.authRequired = true;
    if (outcome === 'authorizationRecovered') this.authRequired = false;
    // A response that was already in flight may finish after the OS reported
    // that the device is offline. Keep the explicit network state authoritative.
    if (!this.online) {
      this.set('offline');
      return;
    }
    // A public health check and an arbitrary successful request cannot prove
    // that a deliberately invalidated session is valid again.  Only the
    // refresh/login path emits authorizationRecovered for this generation.
    this.set(outcome === 'authorizationRequired' ? 'authorizationRequired'
      : outcome === 'authorizationRecovered' ? 'connected'
      : outcome === 'connected' && !this.authRequired ? 'connected'
      : this.authRequired ? 'authorizationRequired' : this.online ? 'serverUnavailable' : 'offline');
  }
  reset() {
    // Changing the server address invalidates the probe, but it cannot prove
    // that an expired session is valid. Only an explicit login/refresh outcome
    // clears authRequired.
    this.invalidate(); this.checkedAt = -Infinity;
    this.set(!this.online ? 'offline' : this.authRequired ? 'authorizationRequired' : 'checking');
    void this.check();
  }
  dispose() { this.active = false; this.invalidate(); }
  private invalidate() { this.generation++; this.pending = null; }

  check(): Promise<void> {
    if (!this.active || !this.online) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.now() - this.checkedAt < 30_000) return Promise.resolve();
    const generation = ++this.generation;
    this.checkedAt = this.now();
    // Retain the last result during routine probes. Only an explicit context
    // reset needs a visible "checking" state.
    this.pending = this.probe().then(result => {
      if (generation !== this.generation) return;
      this.set(result.ok ? this.authRequired ? 'authorizationRequired' : 'connected'
        : result.failureKind === 'wrongContour' ? 'otherServer' : 'serverUnavailable');
    }).catch(() => {
      if (generation === this.generation) this.set('serverUnavailable');
    }).finally(() => {
      if (generation === this.generation) this.pending = null;
    });
    return this.pending;
  }
}
