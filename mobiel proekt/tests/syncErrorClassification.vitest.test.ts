import { describe, expect, it } from 'vitest';

import { MobileNetworkError } from '@/api/networkTimeout';
import { FileUploadHttpError } from '@/domain/files/fileUploadPolicy';
import { classifyHttpStatus, classifySyncFailure, parseRetryAfterHeader, TransientSyncError } from '@/sync/syncErrorClassification';

// Failures are classified by HTTP status and error type, never by message text.
describe('sync failure classification', () => {
  it('treats a client error for the whole request as terminal', () => {
    for (const status of [400, 403, 404, 409, 410, 413, 422]) {
      expect(classifyHttpStatus(status)).toEqual({ kind: 'terminal', status });
    }
  });

  it('retries timeouts, rate limits and server errors with their reason', () => {
    expect(classifyHttpStatus(408)).toEqual({ kind: 'retry', reason: 'timeout', retryAfterSeconds: null });
    expect(classifyHttpStatus(429, 30)).toEqual({ kind: 'retry', reason: 'rateLimit', retryAfterSeconds: 30 });
    expect(classifyHttpStatus(425)).toMatchObject({ kind: 'retry', reason: 'rateLimit' });
    expect(classifyHttpStatus(500)).toMatchObject({ kind: 'retry', reason: 'server' });
    expect(classifyHttpStatus(503, 120)).toEqual({ kind: 'retry', reason: 'server', retryAfterSeconds: 120 });
  });

  it('leaves session and app-update statuses to their own flows', () => {
    expect(classifyHttpStatus(401)).toMatchObject({ kind: 'retry', reason: 'unknown' });
    expect(classifyHttpStatus(426)).toMatchObject({ kind: 'retry', reason: 'unknown' });
  });

  it('ignores misleading message text', () => {
    expect(classifySyncFailure(new Error('HTTP 429 too many requests'))).toEqual({ kind: 'retry', reason: 'unknown', retryAfterSeconds: null });
    expect(classifySyncFailure(new Error('Сервер ответил 400'))).toEqual({ kind: 'retry', reason: 'unknown', retryAfterSeconds: null });
  });

  it('reads the status and server hint from HTTP errors', () => {
    expect(classifySyncFailure(Object.assign(new Error('x'), { status: 400 }))).toEqual({ kind: 'terminal', status: 400 });
    expect(classifySyncFailure(Object.assign(new Error('x'), { status: 503, retryAfterSeconds: 90 })))
      .toEqual({ kind: 'retry', reason: 'server', retryAfterSeconds: 90 });
    expect(classifySyncFailure(new FileUploadHttpError(504))).toMatchObject({ kind: 'retry', reason: 'server' });
  });

  it('maps network errors and already-decided transient errors', () => {
    expect(classifySyncFailure(new MobileNetworkError('timeout'))).toMatchObject({ kind: 'retry', reason: 'timeout' });
    expect(classifySyncFailure(new MobileNetworkError('network'))).toMatchObject({ kind: 'retry', reason: 'network' });
    expect(classifySyncFailure(new TransientSyncError('file', 'server'))).toEqual({ kind: 'retry', reason: 'server', retryAfterSeconds: null });
    expect(classifySyncFailure('boom')).toMatchObject({ kind: 'retry', reason: 'unknown' });
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-19T08:00:00Z');
    expect(parseRetryAfterHeader('120', now)).toBe(120);
    expect(parseRetryAfterHeader('Mon, 19 Oct 2026 08:01:30 GMT', now)).toBe(90);
    expect(parseRetryAfterHeader('Mon, 19 Oct 2026 07:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfterHeader(null, now)).toBeNull();
    expect(parseRetryAfterHeader('soon', now)).toBeNull();
    expect(parseRetryAfterHeader('-5', now)).toBeNull();
  });
});
