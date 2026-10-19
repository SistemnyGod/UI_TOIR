import assert from "node:assert/strict";
import test from "node:test";

import { ServerHealthCache, serverHealthFailureTtlMs } from "../src/api/serverHealthCache.ts";

test("health cache reuses a successful probe within its short TTL", async () => {
  const cache = new ServerHealthCache<{ ok: boolean; status: number }>();
  let probes = 0;

  const probe = async () => {
    probes += 1;
    return { ok: true, status: 200 };
  };

  const first = await cache.getOrProbe("contour\u0000http://192.168.2.194:5173", probe);
  const second = await cache.getOrProbe("contour\u0000http://192.168.2.194:5173", probe);

  assert.deepEqual(second, first);
  assert.equal(probes, 1);
});

test("parallel health probes for the same address share one request", async () => {
  const cache = new ServerHealthCache<{ ok: boolean }>();
  let probes = 0;
  let releaseProbe!: () => void;
  const probe = () => {
    probes += 1;
    return new Promise<{ ok: boolean }>((resolve) => {
      releaseProbe = () => resolve({ ok: true });
    });
  };

  const first = cache.getOrProbe("same", probe);
  const second = cache.getOrProbe("same", probe);
  releaseProbe();

  await Promise.all([first, second]);
  assert.equal(probes, 1);
});

test("invalidating a server health entry forces the next probe", async () => {
  const cache = new ServerHealthCache<{ ok: boolean }>();
  let probes = 0;
  const probe = async () => {
    probes += 1;
    return { ok: true };
  };

  await cache.getOrProbe("server", probe);
  cache.invalidate("server");
  await cache.getOrProbe("server", probe);

  assert.equal(probes, 2);
});

test("a failed probe is remembered for at most five seconds", async () => {
  assert.equal(serverHealthFailureTtlMs, 5_000);
  const cache = new ServerHealthCache<{ ok: boolean }>();
  let probes = 0;
  const probe = async () => { probes += 1; return { ok: false }; };

  await cache.getOrProbe("server", probe);
  await cache.getOrProbe("server", probe);
  assert.equal(probes, 1);
  await cache.getOrProbe("server", probe, Date.now() + serverHealthFailureTtlMs + 1);
  assert.equal(probes, 2);
});

test("a reconnect drops cached failures but keeps fresh successes", async () => {
  const cache = new ServerHealthCache<{ ok: boolean }>();
  let probes = 0;
  await cache.getOrProbe("down", async () => { probes += 1; return { ok: false }; });
  await cache.getOrProbe("up", async () => { probes += 1; return { ok: true }; });

  cache.invalidateFailures();

  assert.equal(cache.get("down"), undefined);
  assert.deepEqual(cache.get("up"), { ok: true });
  assert.equal(probes, 2);
});
