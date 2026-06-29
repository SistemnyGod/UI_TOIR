import { beforeEach, describe, expect, it } from "vitest";
import { readStoredState, writeStoredState } from "../repositories/browserStorageRepository";

describe("browserStorageRepository", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
  });

  it("can ignore a persisted value when runtime configuration is authoritative", () => {
    writeStoredState("patrol360.dataSourceMode", "api", 1);

    const value = readStoredState("patrol360.dataSourceMode", "mock", {
      ignoreStoredValue: true,
      validate: (next): next is "api" | "mock" => next === "api" || next === "mock",
    });

    expect(value).toBe("mock");
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
