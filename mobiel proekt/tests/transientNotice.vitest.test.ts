import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TransientNotice } from '@/ui/TransientNotice';

vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
let screen: ReactTestRenderer;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); });
afterEach(async () => { await act(() => screen.unmount()); vi.useRealTimers(); });
const render = (message: string | null) => React.createElement(TransientNotice, { message });
it('dismisses automatically and cancels its timer on unmount', async () => {
  await act(() => { screen = create(render('Черновик сохранён')); });
  expect(screen.root.findAllByType('Pressable' as any)).toHaveLength(1);
  await act(() => vi.advanceTimersByTime(3500));
  expect(screen.toJSON()).toBeNull();
  await act(() => screen.update(render('Сохраняем…')));
  expect(vi.getTimerCount()).toBe(1);
  await act(() => screen.update(render(null)));
  expect(vi.getTimerCount()).toBe(0);
});
it('tap dismisses; a replacement message owns a fresh timeout', async () => {
  await act(() => { screen = create(render('Сохраняем…')); });
  await act(() => vi.advanceTimersByTime(3000));
  await act(() => screen.update(render('Черновик сохранён')));
  await act(() => vi.advanceTimersByTime(500));
  expect(screen.root.findAllByType('Pressable' as any)).toHaveLength(1);
  await act(() => screen.root.findByType('Pressable' as any).props.onPress());
  expect(screen.toJSON()).toBeNull();
});
