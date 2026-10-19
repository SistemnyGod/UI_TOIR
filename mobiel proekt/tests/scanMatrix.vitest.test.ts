import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

vi.unmock('@/features/patrol/ScanMatrix');

const state = vi.hoisted(() => ({ reduced: false, start: vi.fn(), stop: vi.fn(), timing: vi.fn(), ranges: [] as unknown[] }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => state.reduced }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: { background: '#071426', card: '#0e1e34', cardBorder: '#1f324c', primary: '#9dbbff' } }) }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', StyleSheet: { create: (s: unknown) => s }, Platform: { select: (o: { default: unknown }) => o.default },
  Easing: { linear: 'linear' },
  Animated: { View: 'AnimatedView', Text: 'AnimatedText',
    Value: class { setValue = vi.fn(); interpolate = (range: unknown) => { state.ranges.push(range); return range; }; },
    timing: state.timing, loop: () => ({ start: state.start, stop: state.stop }) }
}));

import { ScanMatrix, ScanTerminalLine } from '@/features/patrol/ScanMatrix';
import { blinkRange, buildMatrix, cyclicRange } from '@/features/patrol/scanMatrixModel';

it('sawtooth ranges wrap at the right moments and are strictly ordered', () => {
  expect(cyclicRange(0, 1, -10, 100)).toEqual({ inputRange: [0, 1], outputRange: [-10, -10] });
  const half = cyclicRange(0.5, 1, 0, 100);
  expect(half.inputRange).toEqual([0, 0.5, 0.5001, 1]);
  expect(half.outputRange).toEqual([50, 100, 0, 50]);
  const fast = cyclicRange(0.25, 2, 0, 1);
  expect(fast.inputRange.every((value, index, all) => index === 0 || value > all[index - 1])).toBe(true);
  expect(fast.inputRange).toHaveLength(6);
  const blink = blinkRange(0.3, 0.9);
  expect(blink.inputRange[0]).toBe(0);
  expect(blink.inputRange.at(-1)).toBe(1);
  expect(Math.max(...blink.outputRange)).toBeCloseTo(0.9);
});

it('matrix layout is deterministic and capped for narrow and wide cards', () => {
  expect(buildMatrix(358, 480)).toEqual(buildMatrix(358, 480));
  expect(buildMatrix(358, 480).columns).toHaveLength(22);
  expect(buildMatrix(1000, 480).columns).toHaveLength(22);
  expect(buildMatrix(160, 480).columns).toHaveLength(10);
  expect(buildMatrix(0, 0).columns).toHaveLength(0);
  for (const column of buildMatrix(358, 480).columns) expect(column.tail.join('')).toMatch(/^[0-9A-F]+$/);
});

it('runs one native loop only while active, after layout, and renders nothing under reduced motion', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let screen!: ReturnType<typeof create>;
  const render = (active: boolean) => React.createElement(ScanMatrix, { active, centerY: 122, background: '#0e1e34' });
  await act(async () => { screen = create(render(true)); });
  expect(state.start).not.toHaveBeenCalled();
  const layer = screen.root.findByProps({ importantForAccessibility: 'no-hide-descendants' });
  await act(async () => layer.props.onLayout({ nativeEvent: { layout: { width: 358, height: 480 } } }));
  expect(state.start).toHaveBeenCalledTimes(1);
  expect(state.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: true, isInteraction: false }));
  expect(screen.root.findAllByType('AnimatedView' as any).length).toBeGreaterThan(20);
  await act(async () => screen.update(render(false)));
  expect(state.stop).toHaveBeenCalledTimes(1);
  expect(screen.toJSON()).toBeNull();
  state.reduced = true;
  await act(async () => screen.update(render(true)));
  expect(screen.toJSON()).toBeNull();
  expect(state.start).toHaveBeenCalledTimes(1);
  await act(async () => screen.unmount());
  state.reduced = false;
});

it('terminal line keeps its text and hides the decorative caret from accessibility', async () => {
  let screen!: ReturnType<typeof create>;
  await act(async () => { screen = create(React.createElement(ScanTerminalLine, { text: '> NFC 13,56 МГц · ожидание метки' })); });
  expect(screen.root.findByType('Text' as any).props.children).toBe('> NFC 13,56 МГц · ожидание метки');
  expect(screen.root.findByProps({ accessibilityElementsHidden: true })).toBeTruthy();
  await act(async () => screen.unmount());
});
