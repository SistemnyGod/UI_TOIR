import { expect, it } from 'vitest';
import { PrioritySyncQueue } from '@/sync/prioritySyncQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it('finishes the active command, runs a manual report, then resumes ordinary work', async () => {
  const queue = new PrioritySyncQueue<void>();
  const active = deferred();
  const order: string[] = [];
  const ordinary = queue.run(async checkpoint => {
    order.push('command-start');
    await active.promise;
    order.push('command-committed');
    await checkpoint();
    order.push('next-command');
  });
  const other = queue.run(async () => { order.push('other-pass'); });
  const report = queue.run(async () => { order.push('report'); }, true);
  expect(order).toEqual(['command-start']);
  active.resolve();
  await Promise.all([ordinary, other, report]);
  expect(order).toEqual(['command-start', 'command-committed', 'report', 'next-command', 'other-pass']);
});

it('a failed priority request does not poison a suspended pass or later requests', async () => {
  const queue = new PrioritySyncQueue<void>();
  const active = deferred();
  let resumed = false;
  const ordinary = queue.run(async checkpoint => { await active.promise; await checkpoint(); resumed = true; });
  const failed = queue.run(async () => { throw Error('session changed'); }, true);
  const rejection = expect(failed).rejects.toThrow('session changed');
  active.resolve();
  await Promise.all([ordinary, rejection]);
  expect(resumed).toBe(true);
  await expect(queue.run(async () => {})).resolves.toBeUndefined();
});

it('priority requests retain FIFO order and cannot preempt each other', async () => {
  const queue = new PrioritySyncQueue<void>();
  const active = deferred();
  const order: string[] = [];
  const first = queue.run(async checkpoint => { await active.promise; order.push('first-start'); await checkpoint(); order.push('first-end'); }, true);
  const second = queue.run(async () => { order.push('second'); }, true);
  active.resolve();
  await Promise.all([first, second]);
  expect(order).toEqual(['first-start', 'first-end', 'second']);
});
