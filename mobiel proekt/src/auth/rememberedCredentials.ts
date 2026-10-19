import * as SecureStore from 'expo-secure-store';
import { currentContourId } from '@/core/environments';

export type RememberedCredentials = { remember: boolean; login: string; password: string };
const legacyPreferenceKey = 'patrol360.rememberLogin';
const legacyLoginKey = 'patrol360.rememberedLogin';
const legacyPasswordKey = 'patrol360.rememberedPassword';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let storageQueue: Promise<void> = Promise.resolve();
let choiceRevision = 0;

function keyFor(contour: string) {
  const suffix = Array.from(contour, char => char.codePointAt(0)!.toString(16)).join('-');
  return `patrol360.rememberedCredentials.${suffix}`;
}

function enqueue<T>(operation: () => Promise<T>) {
  const result = storageQueue.then(operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function readRememberedCredentials(): Promise<RememberedCredentials> {
  const contour = currentContourId;
  return enqueue(async () => {
    const raw = await SecureStore.getItemAsync(keyFor(contour), options);
    if (raw !== null) {
      let record: unknown;
      try { record = JSON.parse(raw); }
      catch { throw new Error('Не удалось прочитать сохранённые данные для входа.'); }
      const value = record as { version?: number; contourId?: string; remember?: boolean; login?: string; password?: string } | null;
      if (!value || value.version !== 1 || value.contourId !== contour || typeof value.remember !== 'boolean') {
        throw new Error('Не удалось прочитать сохранённые данные для входа.');
      }
      if (!value.remember) return { remember: false, login: '', password: '' };
      if (typeof value.login !== 'string' || typeof value.password !== 'string') {
        throw new Error('Не удалось прочитать сохранённые данные для входа.');
      }
      return { remember: true, login: value.login, password: value.password };
    }
    const [preference, login, password] = await Promise.all([
      SecureStore.getItemAsync(legacyPreferenceKey), SecureStore.getItemAsync(legacyLoginKey), SecureStore.getItemAsync(legacyPasswordKey)
    ]);
    // Nothing saved yet (or an explicit legacy opt-out): remembering is opt-in.
    if (preference === 'false' || (preference !== 'true' && !login)) return { remember: false, login: '', password: '' };
    return { remember: true, login: login ?? '', password: preference === 'true' && login ? password ?? '' : '' };
  });
}

async function removeLegacyEntries() {
  // The new envelope is authoritative, including its disabled tombstone.
  // Legacy cleanup cannot undo an already committed choice if native deletion fails.
  await Promise.all([legacyPreferenceKey, legacyLoginKey, legacyPasswordKey].map(key => SecureStore.deleteItemAsync(key))).catch(() => undefined);
}

/** Capture user intent before HTTP; a later uncheck or login supersedes this save. */
export function prepareRememberedCredentialsSave() {
  const contour = currentContourId;
  const revision = ++choiceRevision;
  return (login: string, password: string) => enqueue(async () => {
    if (revision !== choiceRevision || contour !== currentContourId) return;
    // A single encrypted record cannot pair a new login with an old password.
    await SecureStore.setItemAsync(keyFor(contour), JSON.stringify({ version: 1, contourId: contour, remember: true, login, password }), options);
    await removeLegacyEntries();
  });
}

export function forgetRememberedCredentials() {
  ++choiceRevision;
  return wipeRememberedCredentials();
}

/**
 * Remove the saved pair on sign-out or account switch. Unlike an explicit
 * uncheck this does not supersede a login save prepared before the call:
 * that save is enqueued after the wipe and belongs to the new account.
 */
export function wipeRememberedCredentials() {
  const contour = currentContourId;
  return enqueue(async () => {
    await SecureStore.setItemAsync(keyFor(contour), JSON.stringify({ version: 1, contourId: contour, remember: false }), options);
    await removeLegacyEntries();
  });
}
