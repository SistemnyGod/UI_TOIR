import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMobileNetworkError,
  fetchWithTimeout,
  withTimeout,
  MobileNetworkError
} from "../src/api/networkTimeout.ts";

test("upload timeout keeps the timeout cause and invokes cancellation", async () => {
  let cancelled = false;
  await assert.rejects(
    withTimeout(new Promise<never>(() => undefined), 1, undefined, () => {
      cancelled = true;
    }),
    (error: unknown) => {
      assert.ok(error instanceof MobileNetworkError);
      assert.equal(error.kind, "timeout");
      assert.match(error.message, /Сервер недоступен/);
      return true;
    }
  );

  assert.equal(cancelled, true);
});

test("network errors preserve timeout, offline and caller cancellation causes", async () => {
  const timeoutError = classifyMobileNetworkError(
    new MobileNetworkError("timeout"),
    { networkAvailable: false, context: "Адрес: http://192.168.2.194:5173" }
  );
  assert.equal(timeoutError.kind, "timeout");
  assert.match(timeoutError.message, /Превышено время ожидания/);

  const offlineError = classifyMobileNetworkError(
    new MobileNetworkError("network"),
    { networkAvailable: false }
  );
  assert.equal(offlineError.kind, "offline");
  assert.match(offlineError.message, /Нет подключения к сети/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true }
      );
    })) as typeof fetch;

  try {
    const controller = new AbortController();
    const request = fetchWithTimeout("http://localhost/health", { signal: controller.signal }, 1_000);
    controller.abort();

    await assert.rejects(request, (error: unknown) => {
      assert.ok(error instanceof MobileNetworkError);
      assert.equal(error.kind, "cancelled");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
