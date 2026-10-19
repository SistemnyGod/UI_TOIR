import { Vibration } from 'react-native';

import type { ScanFeedbackKind } from '@/features/patrol/scanOutcome';

/**
 * Patterns that can be told apart through a glove or a pocket: one firm pulse for a
 * confirmed point, a light tick for "already done", two long buzzes for a wrong tag
 * and three short ones for a failed read. Android treats the first value as a delay.
 * No sound: playing one needs a new native audio module, and vibration needs no
 * runtime permission.
 */
export const scanVibrationPatterns: Record<ScanFeedbackKind, number[]> = {
  success: [0, 120],
  notice: [0, 40],
  wrongTag: [0, 260, 140, 260],
  readError: [0, 70, 80, 70, 80, 70]
};

export function playScanFeedback(kind: ScanFeedbackKind) {
  try {
    Vibration.vibrate(scanVibrationPatterns[kind]);
  } catch {
    // Feedback is best effort; a missing vibrator must not break the scan.
  }
}
