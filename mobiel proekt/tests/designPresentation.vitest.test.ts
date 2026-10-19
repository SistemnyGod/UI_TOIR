import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@/features/settings/themePreference', async () => {
  const { lightColors } = await import('@/ui/atomTheme');
  return { useAppTheme: () => ({ colors: lightColors }) };
});

import { deliveryStages } from '@/features/syncQueue/QueueDeliveryTimeline';
import { ReportSummaryDonut } from '@/features/patrol/ReportSummary';
import { RingChart } from '@/ui/RingChart';
import { gradientStops } from '@/ui/GradientFill';
import { darkColors, lightColors } from '@/ui/atomTheme';

const format = (value: string | null) => `t:${value}`;
const base = { resolutionStatus: null, createdAtLocal: 'saved', lastAttemptAt: null, nextAttemptAt: null, attemptCount: 0 };

it('queue timeline shows saved, sent and the server answer or the scheduled auto-send', () => {
  expect(deliveryStages({ ...base, status: 'pending' }, format)).toEqual([
    { label: 'Сохранено на телефоне', time: 't:saved', tone: 'done' },
    { label: 'Отправим автоматически', time: null, tone: 'waiting' }
  ]);
  expect(deliveryStages({ ...base, status: 'retryLater', attemptCount: 3, lastAttemptAt: 'sent', nextAttemptAt: 'next' }, format).slice(1)).toEqual([
    { label: 'Отправлено на сервер · попыток: 3', time: 't:sent', tone: 'done' },
    { label: 'Отправим автоматически', time: 't:next', tone: 'waiting' }
  ]);
  expect(deliveryStages({ ...base, status: 'rejected', attemptCount: 1, lastAttemptAt: 'sent' }, format).at(-1)).toEqual({ label: 'Сервер отклонил', time: null, tone: 'failed' });
  expect(deliveryStages({ ...base, status: 'conflict', resolutionStatus: 'dispatcher', attemptCount: 1 }, format).at(-1)?.label).toBe('Передано диспетчеру');
  expect(deliveryStages({ ...base, status: 'accepted', attemptCount: 1 }, format).at(-1)).toEqual({ label: 'Сервер принял', time: null, tone: 'done' });
  expect(deliveryStages({ ...base, status: 'sending' }, format).map(stage => stage.tone)).toEqual(['done', 'active']);
  expect(deliveryStages({ ...base, status: 'waiting_network' }, format).at(-1)?.label).toBe('Отправим, когда появится сеть');
});

it('report donut describes every result group to screen readers', async () => {
  let screen!: ReturnType<typeof create>;
  await act(async () => { screen = create(React.createElement(ReportSummaryDonut, { progress: { total: 20, inspected: 18, issues: 2, skipped: 1, deferred: 1 } })); });
  expect(screen.root.findByProps({ accessible: true }).props.accessibilityLabel)
    .toBe('Точек: 20. Исправно: 16. Замечания: 2. Не осмотрено: 1. Отложено: 1');
  await act(async () => screen.unmount());
});

it('ring arcs follow each other and skip empty segments', async () => {
  let screen!: ReturnType<typeof create>;
  await act(async () => { screen = create(React.createElement(RingChart, { size: 84, stroke: 10, track: 'track', total: 20,
    segments: [{ value: 10, color: 'a' }, { value: 0, color: 'b' }, { value: 5, color: 'c' }] })); });
  const circles = screen.root.findAllByType('SvgCircle' as any);
  // Track plus two non-empty arcs; the second starts where the first ends (half of the circle).
  expect(circles).toHaveLength(3);
  const circumference = 2 * Math.PI * 37;
  expect(circles[1].props.stroke).toBe('a');
  expect(circles[2].props.stroke).toBe('c');
  expect(circles[2].props.strokeDashoffset).toBeCloseTo(-(circumference / 2 + 5));
  await act(async () => screen.unmount());
});

it('gradients pick the palette from the active theme and fall back to light', () => {
  expect(gradientStops(darkColors, 'accent')).toEqual(['#4a82ff', '#2f62f5']);
  expect(gradientStops(lightColors, 'accent')).toEqual(['#2f6bff', '#1846d8']);
  expect(gradientStops({} as never, 'danger')).toEqual(gradientStops(lightColors, 'danger'));
});

it('work card avatar uses the first actual participant, then the assignee', async () => {
  const { participantInitials } = await import('@/features/emuTask/WorkTaskCard');
  const person = (fullName: string) => ({ employeeId: fullName, fullName, status: 'active', startedAt: null, finishedAt: null, isCurrentMobileEmployee: false });
  expect(participantInitials({ actualParticipants: [person('костарев иван сергеевич')], assignedEmployees: [person('Бурухин Н. С.')] })).toBe('КИ');
  expect(participantInitials({ actualParticipants: [], assignedEmployees: [person('Бурухин Н. С.')] })).toBe('БН');
  expect(participantInitials({ actualParticipants: [], assignedEmployees: [] })).toBeNull();
});
