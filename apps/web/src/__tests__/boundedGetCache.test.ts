import { BoundedGetCache } from "../api/boundedGetCache";
import { it, expect } from "vitest";

it("evicts the least recently used completed document and prunes expired responses", () => {
  let now = 0;
  const cache = new BoundedGetCache(2, () => now);
  cache.set("a", { inFlight: false, expiresAt: 10 });
  cache.set("b", { inFlight: false, expiresAt: 10 });
  cache.get("a");
  cache.set("c", { inFlight: false, expiresAt: 10 });
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toBeDefined();
  now = 11;
  expect(cache.size).toBe(0);
});
it("bounds the cache even when all slots are occupied by in-flight requests", () => {
  const cache = new BoundedGetCache(2, () => 100);
  cache.set("a", { inFlight: true, expiresAt: 0 });
  cache.set("b", { inFlight: true, expiresAt: 0 });
  expect(cache.set("c", { inFlight: true, expiresAt: 0 })).toBe(false);
  expect(cache.size).toBe(2);
  expect(cache.get("a")).toBeDefined();
});
