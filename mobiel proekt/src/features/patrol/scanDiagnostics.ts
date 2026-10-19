import { logMobileAction } from '@/db/repositories/mobileActionLogRepository';

import { nfcReadFailureEventType, type NfcReadFailureKind } from './nfcReadRetryPolicy';
import { scanMatchFailureEventType, type ScanMethod, type ScanOutcome } from './scanOutcome';

const readFailureMessages: Record<NfcReadFailureKind, string> = {
  unreadableTag: 'Не удалось прочитать код NFC-метки.',
  tagLost: 'Связь с NFC-меткой прервалась во время чтения.',
  readerStart: 'Не удалось включить чтение NFC.'
};

/** One row per failed attempt; the payload never carries tag codes. */
export function logNfcReadFailure(assignmentId: string, kind: NfcReadFailureKind, attempt: number, retried: boolean) {
  void logMobileAction({
    eventType: nfcReadFailureEventType(kind),
    entityType: 'patrolAssignment',
    entityId: assignmentId,
    message: readFailureMessages[kind],
    payload: { kind, attempt, retried }
  }).catch(() => undefined);
}

export function logScanMatchFailure(assignmentId: string, method: ScanMethod, outcome: ScanOutcome) {
  const eventType = scanMatchFailureEventType(outcome, method);
  if (!eventType) return;
  void logMobileAction({
    eventType,
    entityType: 'patrolAssignment',
    entityId: assignmentId,
    message: method === 'nfc' ? 'Отсканирована NFC-метка не той точки или маршрута.' : 'Отсканирован QR-код не той точки или маршрута.',
    payload: { method, outcome: outcome.kind }
  }).catch(() => undefined);
}
