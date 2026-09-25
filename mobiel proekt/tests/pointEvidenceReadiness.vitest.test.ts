import { expect, it } from 'vitest';
import { evaluatePointEvidence, type EvidencePoint } from '@/domain/patrol/pointEvidenceReadiness';
const point: EvidencePoint = { pointId: 'p', name: 'Pump', orderIndex: 1, required: true, status: 'ok', requiresPhoto: false, photoClientFileIds: [], confirmationType: 'nfc' };
it('proper manual inspection, fault and allowed skip do not require corrections', () => {
  for (const value of [
    { ...point, confirmationType: 'manual', manualReason: 'Сломана метка' },
    { ...point, status: 'issue', comment: 'Шум', issueTypeId: 'noise', photoClientFileIds: ['photo'] },
    { ...point, status: 'skipped', confirmationType: 'manual', comment: 'Оборудование недоступно', photoClientFileIds: ['photo'] }
  ]) expect(evaluatePointEvidence([value])).toMatchObject({ ready: true, problems: [] });
});
it('attention exposes all missing fields and photos and identifies their point', () => {
  const result = evaluatePointEvidence([{ ...point, status: 'issue', requiresPhoto: true, confirmationType: 'manual' }]);
  expect(result.ready).toBe(false); expect(result.problems).toHaveLength(4);
  expect(result.problems.every(problem => problem.pointId === 'p')).toBe(true);
});
it('an unfilled point requires attention even if its tag was scanned', () => {
  expect(evaluatePointEvidence([{ ...point, status: 'scanned' }])).toMatchObject({ ready: false, problems: [{ pointId: 'p' }] });
});
