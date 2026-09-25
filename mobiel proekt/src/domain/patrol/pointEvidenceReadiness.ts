import { isPhotoEvidenceRequired } from './photoEvidencePolicy';
import { evaluateReportPointReadiness } from './reportReadinessPolicy';

export type EvidencePoint = {
  pointId: string; name: string; orderIndex: number; required: boolean; status: string;
  requiresPhoto: boolean; photoClientFileIds: string[]; comment?: string | null;
  issueTypeId?: string | null; confirmationType?: string | null; manualReason?: string | null;
};

/** Shared by the summary and the attention filter through getReportReadiness. */
export function evaluatePointEvidence(points: readonly EvidencePoint[]) {
  const result = evaluateReportPointReadiness(points.map(point => ({ ...point, pointName: point.name })));
  for (const point of points) {
    const add = (reason: string) => result.problems.push({ pointId: point.pointId, pointName: point.name, orderIndex: point.orderIndex, reason });
    if (point.status !== 'skipped' && point.confirmationType === 'manual' && !point.manualReason?.trim()) add('Укажите причину осмотра без NFC');
    if (point.status === 'issue' && !point.comment?.trim()) add('Для неисправности нужен комментарий');
    if (point.status === 'issue' && !point.issueTypeId?.trim()) add('Для неисправности нужно указать тип');
    if (point.status === 'skipped' && !point.comment?.trim()) add('Укажите причину, почему осмотр невозможен');
    const photoStatus = point.status === 'issue' || point.status === 'skipped' ? point.status : null;
    if (isPhotoEvidenceRequired(point.requiresPhoto, photoStatus) && !point.photoClientFileIds.length) add('Для метки требуется фотофиксация');
  }
  return { ...result, ready: result.ready && result.problems.length === 0 };
}
