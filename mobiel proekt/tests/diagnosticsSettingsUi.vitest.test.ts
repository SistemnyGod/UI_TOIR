import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Manual diagnostic upload: every outcome, including a thrown error, is told to the employee.
// Queueing and forcing the upload itself are tested in diagnosticUploadQueue.vitest.test.ts.
const state = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useFocusEffect: (cb: () => void) => R.useEffect(() => cb(), [cb]) }; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', ActivityIndicator: 'ActivityIndicator', Alert: { alert: vi.fn() }, StyleSheet: { create: (s: any) => s } }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ listMobileActionLog: async () => [] }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({
  getDiagnosticSettingsSnapshot: async () => ({ automaticUploadEnabled: true, recentReports: [] }),
  runSafeDiagnosticTest: vi.fn(), setAutomaticDiagnosticUploadEnabled: vi.fn(), triggerManualDiagnosticReportUpload: state.upload
}));
vi.mock('@/ui/Screen', () => ({ Screen: 'Screen' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
import { DiagnosticsSettingsScreen } from '@/features/settings/DiagnosticsSettingsScreen';

let screen: ReactTestRenderer | undefined;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; state.upload.mockReset(); });
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

async function sendAndRead() {
  await act(async () => { screen = create(React.createElement(DiagnosticsSettingsScreen)); });
  const send = screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === 'Отправить отчёт сейчас')!;
  await act(async () => send.props.onPress());
  return screen!.root.findAllByType('Text' as any).filter(node => node.props.accessibilityLiveRegion === 'polite').map(node => node.props.children).join(' ');
}

it.each([
  [{ status: 'unauthenticated' }, 'Нужно войти в приложение'],
  [{ status: 'queued' }, 'будет отправлен автоматически'],
  [{ status: 'offline' }, 'Нет подключения'],
  [{ status: 'sent' }, 'отправлен на сервер'],
  [{ status: 'failed', message: 'HTTP 500' }, 'Не удалось отправить отчёт: HTTP 500']
])('a manual upload result %o is explained to the employee', async (result, expected) => {
  state.upload.mockResolvedValue(result);
  expect(await sendAndRead()).toContain(expected);
});

it('a manual upload that throws is reported as a failure, not swallowed', async () => {
  state.upload.mockRejectedValue(new Error('SQLite занята'));
  expect(await sendAndRead()).toBe('Не удалось отправить отчёт: SQLite занята');
});
