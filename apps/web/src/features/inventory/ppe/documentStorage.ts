// Storage is only a convenience for reopening; a browser failure must not undo a DB success.
const memory = new Map<string, string | null>();
export function readDocumentStorage(storage: "localStorage" | "sessionStorage", key: string) {
  const scopedKey = `${storage}:${key}`;
  if (memory.has(scopedKey)) return memory.get(scopedKey) ?? null;
  try { return window[storage].getItem(key); } catch { return null; }
}
export function writeDocumentStorage(storage: "localStorage" | "sessionStorage", key: string, value?: string) {
  const scopedKey = `${storage}:${key}`;
  try { if (value === undefined) window[storage].removeItem(key); else window[storage].setItem(key, value); memory.delete(scopedKey); return true; }
  catch { memory.set(scopedKey, value ?? null); return false; }
}
