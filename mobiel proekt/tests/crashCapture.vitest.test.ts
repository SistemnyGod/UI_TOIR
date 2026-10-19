import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles }, useColorScheme: () => 'dark'
}));

import {
  MAX_CRASH_RECORDS,
  buildCrashDiagnosticEntries,
  clearDeliveredCrashRecords,
  createFileCrashRecordStorage,
  describeCrash,
  readCrashRecords,
  recordCrash,
  sanitizeCrashText,
  setCrashRecordStorageForTests
} from '@/services/crashRecordStore';
import { installCrashCapture, resetCrashCaptureForTests } from '@/services/crashCapture';
import { AppErrorBoundary } from '@/ui/AppErrorBoundary';

// A fake of expo-file-system's synchronous File API over an in-memory disk.
const disk = new Map<string, string>();
class FakeFile {
  private readonly path: string;
  constructor(directory: { uri: string }, name: string) { this.path = `${directory.uri}/${name}`; }
  get exists() { return disk.has(this.path); }
  create() { disk.set(this.path, ''); }
  write(text: string) { if (!disk.has(this.path)) throw new Error('file does not exist'); disk.set(this.path, text); }
  textSync() { const text = disk.get(this.path); if (text === undefined) throw new Error('missing'); return text; }
  delete() { disk.delete(this.path); }
}
const fileSystem = { File: FakeFile, Paths: { document: { uri: 'file:///data/app/files' } } } as never;

beforeEach(() => {
  disk.clear();
  setCrashRecordStorageForTests(createFileCrashRecordStorage(fileSystem));
  resetCrashCaptureForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => setCrashRecordStorageForTests(null));

it('writes a crash to a file in the document directory and reads it back', () => {
  expect(readCrashRecords()).toEqual([]);
  expect(recordCrash('js.fatal', new TypeError('undefined is not a function'), { now: new Date('2026-10-19T08:00:00Z') })).toBe(true);

  expect([...disk.keys()]).toEqual(['file:///data/app/files/patrol360-crash-records.json']);
  expect(readCrashRecords()).toEqual([expect.objectContaining({
    kind: 'js.fatal', count: 1, firstSeenAt: '2026-10-19T08:00:00.000Z', lastSeenAt: '2026-10-19T08:00:00.000Z',
    message: expect.stringMatching(/^TypeError: undefined is not a function/)
  })]);
});

it('counts repeats of one crash and caps the number of distinct records', () => {
  const error = new Error('same failure');
  recordCrash('js.error', error, { now: new Date('2026-10-19T08:00:00Z') });
  recordCrash('js.error', error, { now: new Date('2026-10-19T08:05:00Z') });
  expect(readCrashRecords()).toEqual([expect.objectContaining({ count: 2, firstSeenAt: '2026-10-19T08:00:00.000Z', lastSeenAt: '2026-10-19T08:05:00.000Z' })]);

  for (let index = 0; index < MAX_CRASH_RECORDS + 5; index += 1) {
    recordCrash('js.error', new Error(`failure ${index}`), { now: new Date(Date.UTC(2026, 9, 19, 9, index)) });
  }
  const records = readCrashRecords();
  expect(records).toHaveLength(MAX_CRASH_RECORDS);
  expect(records.at(-1)?.message).toContain(`failure ${MAX_CRASH_RECORDS + 4}`);
  expect(records.some(record => record.message.includes('same failure'))).toBe(false);
  expect(disk.get('file:///data/app/files/patrol360-crash-records.json')!.length).toBeLessThan(MAX_CRASH_RECORDS * 700);
});

it('a corrupt crash file reads as empty and is replaced on the next crash', () => {
  disk.set('file:///data/app/files/patrol360-crash-records.json', '{not json');
  expect(readCrashRecords()).toEqual([]);
  recordCrash('render', new Error('boom'));
  expect(readCrashRecords()).toHaveLength(1);
});

it('removes tokens, passwords and full URLs from crash text', () => {
  const error = new Error(
    'Request failed Authorization: Bearer abc.def-123 password=hunter2 '
    + 'https://user:secret@patrol.example.local:8443/api/v1/mobile/bootstrap?access_token=xyz '
    + 'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  );
  error.stack = 'Error: Request failed\n    at load (http://10.0.0.5:8081/index.bundle?platform=android:1:2)\n    at PointFillScreen';

  const text = describeCrash(error);
  expect(text).not.toMatch(/hunter2|secret|abc\.def-123|xyz|eyJhbGci|10\.0\.0\.5|patrol\.example/);
  expect(text).toContain('Authorization: [redacted]');
  expect(text).toContain('password=[redacted]');
  expect(text).toContain('[url]/bootstrap');
  expect(text).toContain('load ([url]/index.bundle)');
  expect(text.length).toBeLessThanOrEqual(500);
  expect(sanitizeCrashText('see http://host.local')).toBe('see [url]');
  expect(sanitizeCrashText('at load (C:\\Users\\ivanov\\app\\screen.js:1:2) /data/user/0/ru.atom/files/a.db token: 42'))
    .toBe('at load (…/screen.js:1:2) …/a.db token: [redacted]');
  expect(describeCrash(new Error('x'.repeat(2000))).length).toBe(500);
});

it('the global handler records a fatal error before the previous handler runs', () => {
  const calls: string[] = [];
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const previous = vi.fn(() => { calls.push(`previous:${readCrashRecords().length}`); });
  installCrashCapture({
    errorUtils: { getGlobalHandler: () => previous, setGlobalHandler: (next) => { handler = next; } },
    isDevelopment: false
  });

  handler!(new Error('during bootstrap'), true);
  expect(calls).toEqual(['previous:1']);
  expect(previous).toHaveBeenCalledWith(expect.any(Error), true);
  expect(readCrashRecords()).toEqual([expect.objectContaining({ kind: 'js.fatal' })]);
  handler!('non-fatal string', false);
  expect(readCrashRecords().map(record => record.kind).sort()).toEqual(['js.error', 'js.fatal']);
});

it('unhandled promise rejections are recorded in release builds only', () => {
  const tracker = vi.fn();
  installCrashCapture({ hermes: { enablePromiseRejectionTracker: tracker }, isDevelopment: true });
  expect(tracker).not.toHaveBeenCalled();

  resetCrashCaptureForTests();
  installCrashCapture({ hermes: { enablePromiseRejectionTracker: tracker }, isDevelopment: false });
  expect(tracker).toHaveBeenCalledWith(expect.objectContaining({ allRejections: true }));
  tracker.mock.calls[0][0].onUnhandled(1, new Error('lost promise'));
  expect(readCrashRecords()).toEqual([expect.objectContaining({ kind: 'unhandledRejection', message: expect.stringContaining('lost promise') })]);
});

it('a render error shows the recovery screen, is recorded, and continue renders the app again', async () => {
  let fail = true;
  const onRecover = vi.fn();
  function Patrol() {
    if (fail) throw new Error('render failed');
    return React.createElement('Text', null, 'patrol');
  }
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let screen!: ReactTestRenderer;
  await act(() => { screen = create(React.createElement(AppErrorBoundary, { onRecover }, React.createElement(Patrol))); });

  expect(JSON.stringify(screen.toJSON())).toContain('Экран не открылся');
  expect(readCrashRecords()).toEqual([expect.objectContaining({ kind: 'render', message: expect.stringContaining('render failed') })]);

  fail = false;
  await act(() => screen.root.findByType('Pressable' as never).props.onPress());
  expect(onRecover).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(screen.toJSON())).toContain('patrol');
  await act(() => screen.unmount());
  consoleError.mockRestore();
});

it('only crashes carried by an accepted report are deleted', () => {
  recordCrash('js.fatal', new Error('first'), { now: new Date('2026-10-19T08:00:00Z') });
  recordCrash('render', new Error('second'), { now: new Date('2026-10-19T08:30:00Z') });
  const report = { periodEnd: '2026-10-19T09:00:00.000Z', entries: buildCrashDiagnosticEntries(readCrashRecords(), '2026-10-19T09:00:00.000Z') };
  expect(report.entries.map(entry => entry.eventType)).toEqual(['app.crash.js.fatal', 'app.crash.render']);

  // Crashes after the report was built: a repeat of "first" and a new one.
  recordCrash('js.fatal', new Error('first'), { now: new Date('2026-10-19T09:10:00Z') });
  recordCrash('js.error', new Error('third'), { now: new Date('2026-10-19T09:20:00Z') });

  clearDeliveredCrashRecords(report);
  expect(readCrashRecords().map(record => [record.kind, record.count])).toEqual([['js.fatal', 2], ['js.error', 1]]);

  clearDeliveredCrashRecords({ periodEnd: '2026-10-19T10:00:00.000Z', entries: buildCrashDiagnosticEntries(readCrashRecords(), '2026-10-19T10:00:00.000Z') });
  expect(disk.size).toBe(0);
});
