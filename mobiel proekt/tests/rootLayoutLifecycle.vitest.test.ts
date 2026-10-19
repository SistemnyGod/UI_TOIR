import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The root layout ties delivery to the app lifecycle: once startup is ready, and every time
// the app returns to the foreground, the mobile recovery cycle runs; going to the background
// hands pending reports to the background task.
const state = vi.hoisted(() => ({
  recovery: vi.fn(), background: vi.fn(), retry: vi.fn(), bootstrap: vi.fn(),
  maintenance: vi.fn(), registerSync: vi.fn(), registerPush: vi.fn(),
  appState: null as null | ((value: string) => void), removeAppState: vi.fn()
}));
vi.mock('react-native-gesture-handler', () => ({}));
vi.mock('react-native-reanimated', () => ({}));
vi.mock('expo-router', async () => {
  const R = await import('react');
  const Stack = Object.assign((p: any) => R.createElement('Stack', null, p.children), { Screen: 'StackScreen' });
  return { router: { replace: vi.fn(), push: vi.fn() }, Stack };
});
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s },
  AppState: { addEventListener: (_: string, listener: (value: string) => void) => { state.appState = listener; return { remove: state.removeAppState }; } }
}));
vi.mock('@expo-google-fonts/manrope', () => ({ useFonts: () => [true, null], Manrope_500Medium: 1, Manrope_600SemiBold: 2, Manrope_700Bold: 3, Manrope_800ExtraBold: 4 }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/BootSplash', () => ({ BootSplash: 'BootSplash' }));
vi.mock('@/ui/AppErrorBoundary', () => ({ AppErrorBoundary: (p: any) => p.children }));
vi.mock('@/core/connectionStatus', () => ({ startConnectionMonitor: vi.fn() }));
vi.mock('@/core/bootstrap', () => ({ bootstrapApplication: state.bootstrap, runDeferredStartupMaintenance: state.maintenance }));
vi.mock('@/core/startupState', () => ({ classifyStartupError: (error: unknown) => ({ status: 'recoverableError', error }) }));
vi.mock('@/auth/SessionGate', () => ({ SessionGateProvider: (p: any) => p.children, SessionGuard: (p: any) => p.children }));
vi.mock('@/features/appUpdate/AppUpdateGate', () => ({ AppUpdateGate: (p: any) => p.children }));
vi.mock('@/features/patrol/NfcGuardHost', () => ({ NfcGuardHost: () => null }));
vi.mock('@/auth/sessionGateState', () => ({ isSessionUnlocked: () => true, setPendingSessionRoute: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/features/settings/themePreference', () => ({ ThemeProvider: (p: any) => p.children, useAppTheme: () => ({ colors: {}, statusBarStyle: 'dark' }) }));
vi.mock('@/services/notificationService', () => ({ registerPushNotifications: state.registerPush, refreshPushRegistrationIfAllowed: async () => undefined, subscribeToMobilePushEvents: () => () => undefined }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/crashCapture', () => ({ installCrashCapture: vi.fn() }));
vi.mock('@/services/diagnosticReportPolicy', () => ({ sanitizeDiagnosticMessage: (value: string) => value }));
vi.mock('@/sync/backgroundSyncTask', () => ({ registerBackgroundSyncTask: state.registerSync, syncPendingReportsOnBackground: state.background }));
vi.mock('@/services/backgroundNotificationTask', () => ({ registerBackgroundNotificationTask: async () => undefined }));
vi.mock('@/sync/syncTriggers', () => ({ runMobileRecoveryCycle: state.recovery }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ startPatrolSyncCoordinator: () => () => undefined }));
vi.mock('@/services/reportAutoSubmitLifecycle', () => ({ startReportAutoSubmit: () => () => undefined }));
vi.mock('@/sync/outboxRetryScheduler', () => ({ cancelNextOutboxRetry: vi.fn(), scheduleNextOutboxRetry: state.retry }));
vi.mock('@/services/pushNavigationResolver', () => ({ resolvePushNavigationTarget: vi.fn() }));
import RootLayout from '../app/_layout';

let screen: ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.appState = null;
  state.bootstrap.mockResolvedValue(undefined); state.recovery.mockResolvedValue(undefined);
  state.background.mockResolvedValue(undefined); state.retry.mockResolvedValue(undefined);
  state.maintenance.mockResolvedValue(undefined); state.registerSync.mockResolvedValue(undefined); state.registerPush.mockResolvedValue(null);
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

it('runs the recovery cycle after startup and on every return to the foreground', async () => {
  await act(async () => { screen = create(React.createElement(RootLayout)); });
  expect(state.recovery).toHaveBeenCalledWith('appActive', 'normal');

  state.recovery.mockClear();
  await act(async () => state.appState!('active'));
  expect(state.recovery).toHaveBeenCalledExactlyOnceWith('appActive', 'normal');
  expect(state.retry).toHaveBeenCalledWith('alice');
  expect(state.background).not.toHaveBeenCalled();

  state.recovery.mockClear();
  await act(async () => state.appState!('background'));
  expect(state.background).toHaveBeenCalledOnce();
  expect(state.recovery).not.toHaveBeenCalled();
});

it('does not start recovery before the database is ready, and stops listening on unmount', async () => {
  state.bootstrap.mockReturnValue(new Promise(() => undefined));
  await act(async () => { screen = create(React.createElement(RootLayout)); });
  expect(state.recovery).not.toHaveBeenCalled();
  expect(state.appState).toBeNull();
  await act(async () => screen!.unmount()); screen = undefined;

  state.bootstrap.mockResolvedValue(undefined);
  await act(async () => { screen = create(React.createElement(RootLayout)); });
  await act(async () => screen!.unmount()); screen = undefined;
  expect(state.removeAppState).toHaveBeenCalledOnce();
});

it('starts registrations and housekeeping only after the first screen had time to draw', async () => {
  vi.useFakeTimers();
  try {
    await act(async () => { screen = create(React.createElement(RootLayout)); });
    expect(state.recovery).toHaveBeenCalledWith('appActive', 'normal');
    expect(state.maintenance).not.toHaveBeenCalled();
    expect(state.registerSync).not.toHaveBeenCalled();
    expect(state.registerPush).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(state.maintenance).toHaveBeenCalledOnce();
    expect(state.registerSync).toHaveBeenCalledOnce();
    expect(state.registerPush).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('drops deferred startup work when the root unmounts first', async () => {
  vi.useFakeTimers();
  try {
    await act(async () => { screen = create(React.createElement(RootLayout)); });
    await act(async () => screen!.unmount()); screen = undefined;
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.maintenance).not.toHaveBeenCalled();
    expect(state.registerPush).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
