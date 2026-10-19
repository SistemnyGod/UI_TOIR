import { describe, expect, it } from 'vitest';
import { inspectionChoices, needsManualInspectionReason } from '@/features/patrol/pointInspectionPresentation';
import { isPhotoEvidenceRequired } from '@/domain/patrol/photoEvidencePolicy';

describe('inspection choices preserve the three existing result types', () => {
  it('never treats manual confirmation as an inspection outcome', () => {
    expect(inspectionChoices.map(choice => choice.status)).toEqual(['ok', 'issue', 'skipped']);
    expect(new Set(inspectionChoices.map(choice => choice.status)).size).toBe(3);
    expect(isPhotoEvidenceRequired(true, inspectionChoices[2].status)).toBe(false);
  });
  it.each(['nfc', 'qr', 'manual'])('does not ask for a manual reason again after %s confirmation', confirmationType => {
    expect(needsManualInspectionReason({ confirmationType })).toBe(false);
  });
  it.each(['ok', 'issue', 'skipped'])('keeps legacy %s results editable without restarting inspection', status => {
    expect(needsManualInspectionReason({ confirmationType: null, status })).toBe(false);
  });
  it('requires the existing manual-confirmation step for an unscanned point opened directly', () => {
    expect(needsManualInspectionReason({ confirmationType: null })).toBe(true);
    expect(needsManualInspectionReason(null)).toBe(false);
  });
});
