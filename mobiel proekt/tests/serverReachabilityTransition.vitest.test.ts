import { expect, it, vi } from 'vitest';
vi.mock('@react-native-community/netinfo', () => ({ default: {} }));
vi.mock('react-native', () => ({ AppState: {} }));
vi.mock('@/api/serverHealthApi', () => ({}));
vi.mock('@/core/serverSettings', () => ({}));
import { isServerReachabilityRestored } from '@/core/connectionStatus';

it('only a return from an unreachable server counts as restored reachability', () => {
  expect(isServerReachabilityRestored('serverUnavailable', 'connected')).toBe(true);
  expect(isServerReachabilityRestored('otherServer', 'connected')).toBe(true);
  // The OS network event already covers offline -> online.
  expect(isServerReachabilityRestored('offline', 'connected')).toBe(false);
  expect(isServerReachabilityRestored('connected', 'connected')).toBe(false);
  expect(isServerReachabilityRestored('serverUnavailable', 'authorizationRequired')).toBe(false);
});
