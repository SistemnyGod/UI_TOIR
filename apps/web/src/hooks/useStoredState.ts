import { useEffect, useState } from "react";
import { readStoredState, writeStoredState, type StoredStateOptions } from "../repositories/browserStorageRepository";

export function useStoredState<T>(key: string, fallback: T, options: StoredStateOptions<T> = {}) {
  const version = options.version ?? 1;
  const [value, setValue] = useState<T>(() => readStoredState(key, fallback, options));

  useEffect(() => {
    writeStoredState(key, value, version);
  }, [key, value, version]);

  return [value, setValue] as const;
}
