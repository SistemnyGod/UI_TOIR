/**
 * What the app recently read from NFC tags, shared by the scan screen and the
 * background guard. Phones often report one touch twice (a jittery tag, the
 * reader handing over from scan to guard), so a tag whose codes overlap the
 * last read inside the window is a duplicate and is not processed again.
 * Tags that the current patrol already marked are remembered so a later touch
 * outside the scan screen says so instead of asking to open the scan.
 */
export const nfcDuplicateReadWindowMs = 3000;
const maxMarkedTags = 200;

export type NfcReadMemory = ReturnType<typeof createNfcReadMemory>;

export function createNfcReadMemory(windowMs = nfcDuplicateReadWindowMs) {
  let lastRead: { codes: Set<string>; at: number } | null = null;
  let markedScope: string | null = null;
  const marked = new Set<string>();

  return {
    /** True when the codes overlap the previous read and it was less than the window ago. */
    isDuplicate(codes: string[], now = Date.now()) {
      return !!lastRead && now - lastRead.at < windowMs && codes.some(code => lastRead!.codes.has(code));
    },
    recordRead(codes: string[], now = Date.now()) {
      lastRead = { codes: new Set(codes), at: now };
    },
    /** A newly opened scan screen processes the next touch even if the guard just saw it. */
    clearRecentRead() {
      lastRead = null;
    },
    /** Lets the same tag be read again at once, e.g. after a half-read. */
    forget(codes: string[]) {
      if (lastRead && codes.some(code => lastRead!.codes.has(code))) lastRead = null;
    },
    /** Marks are kept per patrol; opening another assignment drops the old ones. */
    setScope(scope: string) {
      if (markedScope === scope) return;
      markedScope = scope;
      marked.clear();
    },
    markTag(codes: string[]) {
      for (const code of codes) {
        if (marked.size >= maxMarkedTags) marked.delete(marked.values().next().value!);
        marked.add(code);
      }
    },
    isMarked(codes: string[]) {
      return codes.some(code => marked.has(code));
    },
    clear() {
      lastRead = null;
      markedScope = null;
      marked.clear();
    }
  };
}

export const nfcReadMemory = createNfcReadMemory();
