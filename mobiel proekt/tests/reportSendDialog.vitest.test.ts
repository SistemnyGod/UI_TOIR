import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportSendDialog, type ReportSendDialogProps } from '@/features/patrol/ReportSendDialog';

vi.mock('react-native', () => ({ Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));

let screen: ReactTestRenderer;
const onClose = vi.fn(); const onContinue = vi.fn();
const render = async (props: Partial<ReportSendDialogProps> = {}) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  onClose.mockClear(); onContinue.mockClear();
  await act(async () => { screen = create(React.createElement(ReportSendDialog, {
    visible: true, delivery: null, busy: true, error: null, onClose, onContinue, ...props
  })); });
};
const text = () => screen.root.findAllByType('Text' as any).map(n => n.children.join('')).join('\n');
afterEach(async () => { if (screen) await act(() => screen.unmount()); });

it('lets the user hide a local save without claiming it has been persisted', async () => {
  await render();
  expect(text()).toContain('Отправляем отчёт');
  const action = screen.root.findByType('PrimaryButton' as any);
  expect(action.props.label).toBe('Скрыть окно');
  await act(async () => action.props.onPress());
  expect(onClose).toHaveBeenCalledOnce(); expect(onContinue).not.toHaveBeenCalled();
});

it.each([
  ['sending', true, 'Отправляем отчёт', 'Продолжить работу'],
  ['waitingNetwork', true, 'Отчёт сохранён', 'Продолжить работу'],
  ['retryScheduled', false, 'Отчёт сохранён', 'Продолжить работу'],
  ['delivered', true, 'Отчёт отправлен', 'Готово']
] as const)('renders %s even while the surrounding request is still finishing', async (status, busy, title, label) => {
  await render({ delivery: { status, clientOperationId: 'receipt', lastError: null, deliveredAt: null, nextAttemptAt: null } as any, busy });
  expect(text()).toContain(title);
  expect(screen.root.findAllByType('ActivityIndicator' as any)).toHaveLength(status === 'sending' ? 1 : 0);
  const action = screen.root.findByType('PrimaryButton' as any);
  expect(action.props.label).toBe(label);
  await act(async () => action.props.onPress());
  expect(onContinue).toHaveBeenCalledOnce();
});

it('a save failure offers return to the report and never claims data is saved', async () => {
  await render({ busy: false, error: 'disk full' });
  expect(text()).toContain('Не удалось сохранить отчёт');
  expect(text()).not.toContain('Данные сохранены');
  expect(screen.root.findByType('PrimaryButton' as any).props.label).toBe('К отчёту');
});

it('a report needing authentication does not look like an endless upload', async () => {
  await render({ delivery: { status: 'waitingAuth', clientOperationId: 'receipt', lastError: 'expired' } });
  expect(text()).toContain('Нужно ваше внимание');
  expect(screen.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  expect(screen.root.findByType('Modal' as any).props.animationType).toBe('none');
  await act(async () => screen.root.findByType('Modal' as any).props.onRequestClose());
  expect(onClose).toHaveBeenCalledOnce();
});
