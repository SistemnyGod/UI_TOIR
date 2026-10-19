import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Keeps the display on while a scan screen is focused, so it does not dim or lock
 * while the guard walks to the next tag. Released on blur and unmount; the tag is
 * per screen, so leaving one scanner cannot release another one's lock.
 */
export function useScanKeepAwake(tag: 'patrol-scan-nfc' | 'patrol-scan-qr') {
  useFocusEffect(useCallback(() => {
    void activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [tag]));
}
