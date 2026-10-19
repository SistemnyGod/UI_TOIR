import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isSessionUnlocked, subscribeToSessionGate } from '@/auth/sessionGateState';
import { nfcGuard, nfcGuardMessages } from '@/services/nfcGuardService';
import { playScanFeedback } from '@/services/scanFeedback';
import { TransientNotice } from '@/ui/TransientNotice';

/** Runs the NFC guard for the signed-in app and shows its short hints. */
export function NfcGuardHost() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    void nfcGuard.setSignedIn(isSessionUnlocked());
    const unsubscribeSession = subscribeToSessionGate(unlocked => { void nfcGuard.setSignedIn(unlocked); });
    const appStateSubscription = AppState.addEventListener('change', state => { void nfcGuard.onAppStateChange(state); });
    const unsubscribeNotice = nfcGuard.subscribe(kind => {
      playScanFeedback('notice');
      setNotice(current => ({ id: (current?.id ?? 0) + 1, message: nfcGuardMessages[kind] }));
    });
    return () => {
      unsubscribeSession();
      appStateSubscription.remove();
      unsubscribeNotice();
      void nfcGuard.setSignedIn(false);
    };
  }, []);

  if (!notice) return null;
  return <View pointerEvents='box-none' style={{ position: 'absolute', top: insets.top + 8, right: 16, left: 16 }}>
    <TransientNotice key={notice.id} message={notice.message} />
  </View>;
}
