import { describe, expect, it } from 'vitest';

import {
  autoSubmitEditGraceMs,
  defaultAutoSubmitDelayMs,
  digestText,
  evaluateAutoSubmit,
  reminderDelayMs,
  type AutoSubmitObservation,
  type AutoSubmitTimer
} from '@/domain/reporting/autoSubmitPolicy';
import { autoSubmitCountdownMessage } from '@/features/patrol/autoSubmitPresentation';

// The auto-submit timer counts elapsed time, never wall-clock deadlines: clock
// changes cannot send a report early in one process or postpone it forever.
const minute = 60_000;
const t0 = Date.parse('2026-10-19T08:00:00Z');
const observe = (overrides: Partial<AutoSubmitObservation> = {}): AutoSubmitObservation => ({
  assignmentId: 'a', ready: true, fingerprint: 'f1', nowWallMs: t0, monotonicDeltaMs: null, editing: false, ...overrides
});
function arm(): AutoSubmitTimer {
  const decision = evaluateAutoSubmit(null, observe());
  if (decision.action !== 'wait') throw new Error('expected an armed timer');
  return decision.timer;
}

describe('auto-submit timer', () => {
  it('arms with the full delay once every point is filled', () => {
    expect(evaluateAutoSubmit(null, observe())).toEqual({
      action: 'wait', armed: true, remainingMs: defaultAutoSubmitDelayMs,
      timer: { assignmentId: 'a', fingerprint: 'f1', delayMs: defaultAutoSubmitDelayMs, elapsedMs: 0, checkpointWallMs: t0 }
    });
  });

  it('never submits an incomplete patrol, even long after the deadline', () => {
    const timer = { ...arm(), elapsedMs: 10 * defaultAutoSubmitDelayMs };
    expect(evaluateAutoSubmit(timer, observe({ ready: false, monotonicDeltaMs: 60 * minute }))).toEqual({ action: 'disarm' });
    expect(evaluateAutoSubmit(null, observe({ ready: false }))).toEqual({ action: 'disarm' });
  });

  it('submits after the delay of monotonic time in one process', () => {
    let timer = arm();
    const step = evaluateAutoSubmit(timer, observe({ monotonicDeltaMs: 14 * minute, nowWallMs: t0 + 14 * minute }));
    expect(step).toMatchObject({ action: 'wait', remainingMs: minute, armed: false });
    if (step.action !== 'wait') return;
    timer = step.timer;
    expect(evaluateAutoSubmit(timer, observe({ monotonicDeltaMs: minute, nowWallMs: t0 + 15 * minute }))).toMatchObject({ action: 'submit' });
  });

  it('ignores the wall clock jumping forward or back while the app runs', () => {
    const timer = arm();
    // Clock moved a day ahead but only two minutes really passed.
    expect(evaluateAutoSubmit(timer, observe({ nowWallMs: t0 + 24 * 60 * minute, monotonicDeltaMs: 2 * minute })))
      .toMatchObject({ action: 'wait', remainingMs: 13 * minute });
    // Clock moved back an hour; the countdown still advances by real time.
    expect(evaluateAutoSubmit(timer, observe({ nowWallMs: t0 - 60 * minute, monotonicDeltaMs: 15 * minute })))
      .toMatchObject({ action: 'submit' });
  });

  it('after a restart a clock set back adds no time and is not a reason to wait forever', () => {
    const timer = { ...arm(), elapsedMs: 10 * minute };
    const back = evaluateAutoSubmit(timer, observe({ nowWallMs: t0 - 3 * 60 * minute }));
    expect(back).toMatchObject({ action: 'wait', remainingMs: 5 * minute });
    if (back.action !== 'wait') return;
    // The new checkpoint is the corrected clock: later progress counts again.
    expect(back.timer.checkpointWallMs).toBe(t0 - 3 * 60 * minute);
    expect(evaluateAutoSubmit(back.timer, observe({ nowWallMs: t0 - 3 * 60 * minute + 5 * minute }))).toMatchObject({ action: 'submit' });
  });

  it('after a restart counts the time the app was closed', () => {
    const timer = { ...arm(), elapsedMs: 4 * minute };
    expect(evaluateAutoSubmit(timer, observe({ nowWallMs: t0 + 11 * minute }))).toMatchObject({ action: 'submit' });
  });

  it('any point edit restarts the countdown from the full delay', () => {
    const timer = { ...arm(), elapsedMs: 14 * minute };
    expect(evaluateAutoSubmit(timer, observe({ fingerprint: 'f2', monotonicDeltaMs: 5 * minute, nowWallMs: t0 + 5 * minute })))
      .toEqual({
        action: 'wait', armed: true, remainingMs: defaultAutoSubmitDelayMs,
        timer: { assignmentId: 'a', fingerprint: 'f2', delayMs: defaultAutoSubmitDelayMs, elapsedMs: 0, checkpointWallMs: t0 + 5 * minute }
      });
  });

  it('waits while a point form is open and then leaves a grace minute', () => {
    const timer = { ...arm(), elapsedMs: 14 * minute };
    const held = evaluateAutoSubmit(timer, observe({ editing: true, monotonicDeltaMs: 30 * minute }));
    expect(held).toMatchObject({ action: 'wait', remainingMs: autoSubmitEditGraceMs });
    if (held.action !== 'wait') return;
    expect(evaluateAutoSubmit(held.timer, observe({ monotonicDeltaMs: 59_000 }))).toMatchObject({ action: 'wait', remainingMs: 1_000 });
    expect(evaluateAutoSubmit(held.timer, observe({ monotonicDeltaMs: autoSubmitEditGraceMs }))).toMatchObject({ action: 'submit' });
  });

  it('keeps the delay stored with the timer and rejects nonsensical values', () => {
    expect(evaluateAutoSubmit(null, observe(), 30 * minute)).toMatchObject({ remainingMs: 30 * minute });
    expect(evaluateAutoSubmit(null, observe(), Number.NaN)).toMatchObject({ remainingMs: defaultAutoSubmitDelayMs });
    expect(evaluateAutoSubmit(null, observe(), 0)).toMatchObject({ remainingMs: minute });
    const stored = { ...arm(), delayMs: 20 * minute };
    expect(evaluateAutoSubmit(stored, observe({ monotonicDeltaMs: 16 * minute }))).toMatchObject({ action: 'wait', remainingMs: 4 * minute });
  });

  it('schedules the reminder five minutes before sending', () => {
    expect(reminderDelayMs(15 * minute)).toBe(10 * minute);
    expect(reminderDelayMs(3 * minute)).toBe(0);
  });

  it('digests point data stably and distinguishes edits', () => {
    expect(digestText('[["p1","ok",null]]')).toBe(digestText('[["p1","ok",null]]'));
    expect(digestText('[["p1","ok",null]]')).not.toBe(digestText('[["p1","ok","comment"]]'));
  });

  it('formats the countdown for the report screen', () => {
    expect(autoSubmitCountdownMessage(12 * minute + 5_000)).toContain('через 12:05');
    expect(autoSubmitCountdownMessage(0)).toBe('Все точки заполнены. Отчёт отправляется автоматически.');
  });
});
