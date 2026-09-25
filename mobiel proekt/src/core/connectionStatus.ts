import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { checkServerConnection, invalidateServerHealthCache } from '@/api/serverHealthApi';
import { canAttemptServerConnection } from '@/core/networkPolicy';
import { getMobileConnectionContextGeneration, invalidateMobileConnectionContext, subscribeToMobileConnectionContext, subscribeToMobileConnectionOutcomes } from '@/core/connectionStateEvents';
import { subscribeToServerSettings } from '@/core/serverSettings';
import { ConnectionMonitor, type ConnectionStatus } from '@/core/connectionMonitor';
export type { ConnectionStatus } from '@/core/connectionMonitor';

let status: ConnectionStatus = 'checking';
let stop: (() => void) | undefined;
const listeners = new Set<() => void>();
function publish(value: ConnectionStatus) {
  if (status === value) return;
  status = value;
  listeners.forEach(listener => listener());
}
export function startConnectionMonitor() {
  if (!stop) {
    const monitor = new ConnectionMonitor(() => checkServerConnection(undefined, { useCache: true }), publish);
    let contextGeneration = getMobileConnectionContextGeneration();
    monitor.setContextGeneration(contextGeneration);
    monitor.setActive(AppState.currentState === 'active');
    let lastOnline: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener(state => {
      const nextOnline = canAttemptServerConnection(state);
      if (lastOnline === nextOnline) return;
      lastOnline = nextOnline;
      // A result started before a network transition belongs to the previous
      // context and must not make the current indicator look connected.
      contextGeneration = invalidateMobileConnectionContext();
      monitor.setContextGeneration(contextGeneration);
      monitor.setNetwork(nextOnline);
    });
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
    const interval = setInterval(() => { void monitor.check(); }, 30_000);
    const appSubscription = AppState.addEventListener('change', state => monitor.setActive(state === 'active'));
    stop = () => { monitor.dispose(); unsubscribe(); unsubscribeContext(); unsubscribeOutcome(); unsubscribeSettings(); clearInterval(interval); appSubscription.remove(); };
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
