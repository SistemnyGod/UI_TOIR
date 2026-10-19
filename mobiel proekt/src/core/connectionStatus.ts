import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { checkServerConnection, invalidateServerHealthCache } from '@/api/serverHealthApi';
import { canAttemptServerConnection, networkRouteKey } from '@/core/networkPolicy';
import { getMobileConnectionContextGeneration, invalidateMobileConnectionContext, publishServerReachabilityRestored, subscribeToMobileConnectionContext, subscribeToMobileConnectionOutcomes } from '@/core/connectionStateEvents';
import { subscribeToServerSettings } from '@/core/serverSettings';
import { ConnectionMonitor, type ConnectionStatus } from '@/core/connectionMonitor';
export type { ConnectionStatus } from '@/core/connectionMonitor';

let status: ConnectionStatus = 'checking';
let lastSettledStatus: ConnectionStatus = 'checking';
let stop: (() => void) | undefined;
const listeners = new Set<() => void>();
function publish(value: ConnectionStatus) {
  if (status === value) return;
  status = value;
  if (value !== 'checking') {
    const restored = isServerReachabilityRestored(lastSettledStatus, value);
    lastSettledStatus = value;
    // Retries scheduled while the server was unreachable can run now instead
    // of waiting out a backoff of up to 15 minutes.
    if (restored) publishServerReachabilityRestored();
  }
  listeners.forEach(listener => listener());
}

/** `previous` is the last non-"checking" status. */
export function isServerReachabilityRestored(previous: ConnectionStatus, next: ConnectionStatus) {
  return next === 'connected' && (previous === 'serverUnavailable' || previous === 'otherServer');
}
export function startConnectionMonitor() {
  if (!stop) {
    const monitor = new ConnectionMonitor(() => checkServerConnection(undefined, { useCache: true }), publish);
    let contextGeneration = getMobileConnectionContextGeneration();
    monitor.setContextGeneration(contextGeneration);
    monitor.setActive(AppState.currentState === 'active');
    let lastRoute: string | null = null;
    let networkReadVersion = 0;
    let active = AppState.currentState === 'active';
    const applyNetwork = (state: Parameters<typeof networkRouteKey>[0], force = false) => {
      const nextOnline = canAttemptServerConnection(state);
      const route = networkRouteKey(state);
      if (!force && lastRoute === route) return;
      lastRoute = route;
      // A result started before a network transition belongs to the previous
      // context and must not make the current indicator look connected.
      invalidateServerHealthCache();
      contextGeneration = invalidateMobileConnectionContext();
      monitor.setContextGeneration(contextGeneration);
      monitor.setNetwork(nextOnline, true);
    };
    const unsubscribe = NetInfo.addEventListener(state => {
      networkReadVersion++;
      applyNetwork(state);
      monitor.setActive(active);
    });
    const refreshNetwork = async (force = false) => {
      const version = ++networkReadVersion;
      try {
        const state = await NetInfo.fetch();
        if (version === networkReadVersion && active) applyNetwork(state, force);
      } catch { /* Retain the last OS snapshot if NetInfo cannot read it. */ }
      if (version === networkReadVersion) monitor.setActive(active);
    };
    const unsubscribeContext = subscribeToMobileConnectionContext(generation => {
      contextGeneration = generation;
      monitor.setContextGeneration(generation);
    });
    const unsubscribeOutcome = subscribeToMobileConnectionOutcomes(event => monitor.outcome(event.outcome, event.contextGeneration));
    const unsubscribeSettings = subscribeToServerSettings(() => {
      invalidateServerHealthCache();
      contextGeneration = invalidateMobileConnectionContext();
      monitor.setContextGeneration(contextGeneration);
      monitor.reset();
    });
    const interval = setInterval(() => { if (active) void refreshNetwork(); }, 30_000);
    const appSubscription = AppState.addEventListener('change', state => {
      active = state === 'active';
      networkReadVersion++;
      monitor.setActive(false);
      if (active) void refreshNetwork(true);
    });
    stop = () => { active = false; networkReadVersion++; monitor.dispose(); unsubscribe(); unsubscribeContext(); unsubscribeOutcome(); unsubscribeSettings(); clearInterval(interval); appSubscription.remove(); };
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  startConnectionMonitor();
  return () => { listeners.delete(listener); };
}
export function useConnectionStatus() {
  return useSyncExternalStore(subscribe, () => status, () => 'checking' as ConnectionStatus);
}
