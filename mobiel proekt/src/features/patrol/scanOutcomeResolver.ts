import { findScanTagOwner, type ScanTagOwner } from '@/db/repositories/scanTagLookupRepository';

import { outcomeFromScanResult, type ScanMethod, type ScanOutcome, type ScanPointRef } from './scanOutcome';

type ScanResult =
  | { matched: false }
  | { matched: true; alreadyScanned?: boolean; alreadyCompleted?: boolean; point: ScanPointRef };

/**
 * Runs one repository scan and explains a code it did not accept. The explanation
 * is a read-only lookup, so a wrong or unknown code never confirms a point.
 * Errors other than a strict-order refusal are rethrown for the screen to report.
 */
export async function resolveScanOutcome(
  assignmentId: string,
  method: ScanMethod,
  codes: string[],
  scan: () => Promise<ScanResult>
): Promise<ScanOutcome> {
  try {
    const result = await scan();
    if (result.matched) return outcomeFromScanResult(result);
    return outcomeFromScanResult(result, await lookupOwner(assignmentId, method, codes));
  } catch (error) {
    const requiredPoint = getRequiredPoint(error);
    if (!requiredPoint) throw error;
    const owner = await lookupOwner(assignmentId, method, codes);
    return { kind: 'wrongOrder', point: owner?.kind === 'routePoint' ? owner.point : null, requiredPoint };
  }
}

async function lookupOwner(assignmentId: string, method: ScanMethod, codes: string[]): Promise<ScanTagOwner | null> {
  // The scan already refused the code; a failed explanation still reports "unknown".
  return findScanTagOwner(assignmentId, method, codes).catch(() => null);
}

/** PointOrderError from the patrol repository, matched by shape so screens need no class import. */
function getRequiredPoint(error: unknown): ScanPointRef | null {
  if (!(error instanceof Error) || error.name !== 'PointOrderError' || !('requiredPoint' in error)) return null;
  const point = (error as { requiredPoint?: Partial<ScanPointRef> }).requiredPoint;
  return point && typeof point.pointId === 'string' && typeof point.name === 'string' && typeof point.orderIndex === 'number'
    ? { pointId: point.pointId, name: point.name, orderIndex: point.orderIndex }
    : null;
}
