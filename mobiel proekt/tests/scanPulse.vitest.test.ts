import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { ScanPulse } from '@/features/patrol/ScanPulse';

const state = vi.hoisted(() => ({ reduced: false, start: vi.fn(), stop: vi.fn(), timing: vi.fn(), reset: vi.fn() }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => state.reduced }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native', () => ({
  View: 'View', StyleSheet: { create: (s: unknown) => s }, Easing: { out: (x: unknown) => x, quad: 'quad' },
  Animated: { View: 'AnimatedView', Value: class { setValue = state.reset; interpolate = (v: unknown) => v; },
    timing: state.timing, loop: () => ({ start: state.start, stop: state.stop }) }
}));

it('native pulse starts only while active, stops on inactivity, reduced motion and unmount', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let screen!: ReturnType<typeof create>;
  const render = (active: boolean) => React.createElement(ScanPulse, { active, color: 'blue', icon: 'radio-outline' });
  await act(async () => { screen = create(render(false)); });
  expect(state.start).not.toHaveBeenCalled();
  await act(async () => screen.update(render(true)));
  expect(state.start).toHaveBeenCalledTimes(1);
  expect(state.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: true, isInteraction: false }));
  await act(async () => screen.update(render(false)));
  expect(state.stop).toHaveBeenCalledTimes(1);
  expect(screen.root.findAllByType('AnimatedView' as any)).toHaveLength(0);
  state.reduced = true;
  await act(async () => screen.update(render(true)));
  expect(state.start).toHaveBeenCalledTimes(1);
  state.reduced = false;
  await act(async () => screen.update(render(true)));
  expect(state.start).toHaveBeenCalledTimes(2);
  await act(async () => screen.unmount());
  expect(state.stop).toHaveBeenCalledTimes(2);
});
