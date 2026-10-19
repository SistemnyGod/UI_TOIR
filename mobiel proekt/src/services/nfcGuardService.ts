import { enableNfcGuard, getNfcCodes, refreshNfcGuard } from '@/services/nfcService';
import { nfcReadMemory, type NfcReadMemory } from '@/services/nfcReadMemory';

export type NfcGuardNotice = 'alreadyMarked' | 'openScan';

export const nfcGuardMessages: Record<NfcGuardNotice, string> = {
  alreadyMarked: 'Метка уже отмечена',
  openScan: 'Откройте сканирование, чтобы отметить точку'
};

let scanScreenClaims = 0;

/** Held while the NFC scan screen is focused: tags the guard sees then are the screen's own retries. */
export function claimNfcScanScreen() {
  scanScreenClaims++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scanScreenClaims--;
  };
}

export function isNfcScanScreenActive() {
  return scanScreenClaims > 0;
}

/** What the guard tells the user about a tag it swallowed; null means stay silent. */
export function decideGuardTag(tag: unknown, memory: NfcReadMemory, scanScreenActive: boolean, now = Date.now()): NfcGuardNotice | null {
  // The scan screen is between two reader sessions and re-arms by itself.
  if (scanScreenActive) return null;
  const codes = getNfcCodes(tag);
  if (codes.length === 0 || memory.isDuplicate(codes, now)) return null;
  memory.recordRead(codes, now);
  return memory.isMarked(codes) ? 'alreadyMarked' : 'openScan';
}

type GuardDeps = {
  enable: typeof enableNfcGuard;
  refresh: typeof refreshNfcGuard;
  memory: NfcReadMemory;
  isScanScreenActive: () => boolean;
  now: () => number;
};

/**
 * Keeps the guard reader on while a user is signed in. It is not dropped in the
 * background: the native module pauses reader mode with the activity and turns it
 * back on at resume, before JavaScript could re-register it.
 */
export function createNfcGuardController(deps: GuardDeps = {
  enable: onTag => enableNfcGuard(onTag),
  refresh: () => refreshNfcGuard(),
  memory: nfcReadMemory,
  isScanScreenActive: isNfcScanScreenActive,
  now: () => Date.now()
}) {
  let wanted = false;
  let disableGuard: (() => Promise<void>) | null = null;
  let chain: Promise<void> = Promise.resolve();
  const listeners = new Set<(notice: NfcGuardNotice) => void>();

  const handleTag = (tag: unknown) => {
    if (!wanted) return;
    const notice = decideGuardTag(tag, deps.memory, deps.isScanScreenActive(), deps.now());
    if (notice) for (const listener of listeners) listener(notice);
  };

  const sync = () => {
    chain = chain.then(async () => {
      if (wanted && !disableGuard) {
        disableGuard = await deps.enable(handleTag);
      } else if (!wanted && disableGuard) {
        const disable = disableGuard;
        disableGuard = null;
        deps.memory.clear();
        await disable();
      }
    }).catch(() => undefined);
    return chain;
  };

  return {
    setSignedIn(signedIn: boolean) {
      wanted = signedIn;
      return sync();
    },
    onAppStateChange(state: string) {
      if (state !== 'active') return chain;
      chain = chain.then(async () => {
        if (wanted && disableGuard) await deps.refresh();
      }).catch(() => undefined);
      return chain;
    },
    subscribe(listener: (notice: NfcGuardNotice) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

export const nfcGuard = createNfcGuardController();
