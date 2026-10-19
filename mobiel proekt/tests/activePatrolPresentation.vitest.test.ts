import { expect, it } from 'vitest';
import { describeActivePatrol, primaryPatrolAction } from '@/features/patrol/activePatrol/activePatrolPresentation';

// What the active patrol screen offers follows the patrol status and how many points are filled.
const progress = (completed: number, total = 2) => ({ total, completed, inspected: completed, deferred: 0, issues: 0, skipped: 0 });

it('a patrol waiting on the server or the dispatcher is blocked; a filled route is ready for review', () => {
  for (const status of ['needsDispatcherDecision', 'cancelledServer', 'authRequired', 'syncError', 'conflict'] as const) {
    expect(describeActivePatrol(status, progress(0)).isBlocked).toBe(true);
  }
  expect(describeActivePatrol('inProgress', progress(1)).isBlocked).toBe(false);
  expect(describeActivePatrol('inProgress', progress(1)).isReadyForReview).toBe(false);
  expect(describeActivePatrol('inProgress', progress(2)).isReadyForReview).toBe(true);
  expect(describeActivePatrol('inProgress', progress(0, 0)).isReadyForReview).toBe(false);
});

it('the main action reviews a filled route, otherwise scans or lists the points', () => {
  expect(primaryPatrolAction('a', progress(2), true)).toEqual({ icon: 'document-text-outline', label: 'Отправить отчёт', path: '/patrol/assignment/a/submit' });
  expect(primaryPatrolAction('a', progress(1), true)).toEqual({ icon: 'scan-outline', label: 'Сканировать NFC', path: '/patrol/assignment/a/scan-nfc' });
  expect(primaryPatrolAction('a', progress(1), false)).toEqual({ icon: 'list-outline', label: 'Открыть все метки', path: '/patrol/assignment/a/all-points' });
  expect(primaryPatrolAction('a', progress(0, 0), true).label).toBe('Загружаем метки маршрута');
});
