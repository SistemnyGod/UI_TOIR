import { it, expect, vi } from 'vitest';
import { OperationDeadline } from '@/api/operationDeadline';
it('shares one budget across successive phases', () => {
  let now=0; const deadline=new OperationDeadline(100,()=>now);
  expect(deadline.remaining()).toBe(100);
  now=70; expect(deadline.remaining()).toBe(30);
  now=100; expect(()=>deadline.remaining()).toThrow();
});
it('aborts outstanding requests when the budget expires', async () => {
  vi.useFakeTimers();
  try {
    const deadline=new OperationDeadline(100);
    const result=deadline.wait(new Promise(()=>{}));
    const rejection=expect(result).rejects.toThrow('Превышено');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(deadline.signal.aborted).toBe(true);
    expect(()=>deadline.remaining()).toThrow();
  } finally { vi.useRealTimers(); }
});
