/**
 * What a scanned NFC/QR code meant for the open patrol, and how the scan screen
 * reports it. Pure: the screens map repository results to an outcome and render
 * the presentation, so the wording never shows raw tag codes or hashes.
 */
export type ScanMethod = 'nfc' | 'qr';

export type ScanPointRef = { pointId: string; name: string; orderIndex: number };

export type ScanOutcome =
  | { kind: 'confirmed'; point: ScanPointRef }
  | { kind: 'alreadyScanned'; point: ScanPointRef }
  | { kind: 'alreadyCompleted'; point: ScanPointRef }
  | { kind: 'wrongOrder'; point: ScanPointRef | null; requiredPoint: ScanPointRef }
  | { kind: 'otherRoute'; routeName: string | null }
  | { kind: 'unknown' };

export type ScanFeedbackKind = 'success' | 'notice' | 'wrongTag' | 'readError';

export type ScanOutcomeAction = { label: string; pointId: string; target: 'fill' | 'detail' };

export type ScanOutcomePresentation = {
  message: string;
  hint: string | null;
  tone: 'success' | 'neutral' | 'error';
  feedback: ScanFeedbackKind;
  action: ScanOutcomeAction | null;
  /** Only a confirmed scan opens the point form; every other outcome leaves the route unchanged. */
  confirmsPoint: boolean;
};

export const holdStillHint = 'Держите телефон ближе к метке и не двигайте 1–2 секунды';

type ScanResultLike =
  | { matched: false }
  | { matched: true; alreadyScanned?: boolean; alreadyCompleted?: boolean; point: ScanPointRef };

export type ScanTagOwnerLike =
  | { kind: 'routePoint'; point: ScanPointRef }
  | { kind: 'otherRoute'; routeName: string | null }
  | { kind: 'unknown' };

/** Maps a repository scan result; an unmatched code needs the tag owner lookup. */
export function outcomeFromScanResult(result: ScanResultLike, owner?: ScanTagOwnerLike | null): ScanOutcome {
  if (result.matched) {
    const point = toPointRef(result.point);
    if (result.alreadyCompleted) return { kind: 'alreadyCompleted', point };
    if (result.alreadyScanned) return { kind: 'alreadyScanned', point };
    return { kind: 'confirmed', point };
  }
  if (owner?.kind === 'otherRoute') return { kind: 'otherRoute', routeName: owner.routeName };
  return { kind: 'unknown' };
}

export function presentScanOutcome(outcome: ScanOutcome, method: ScanMethod): ScanOutcomePresentation {
  const tag = method === 'nfc' ? 'метка' : 'QR-код';
  switch (outcome.kind) {
    case 'confirmed':
      return {
        message: `${method === 'nfc' ? 'Метка подтверждена' : 'QR-код подтверждён'}: точка ${formatPoint(outcome.point)}`,
        hint: null, tone: 'success', feedback: 'success', action: null, confirmsPoint: true
      };
    case 'alreadyScanned':
      return {
        message: `Точка ${formatPoint(outcome.point)} уже отмечена`,
        hint: 'Повторно отмечать не нужно. Можно продолжить заполнение этой точки.',
        tone: 'neutral', feedback: 'notice', confirmsPoint: false,
        action: { label: `Продолжить точку ${outcome.point.orderIndex}`, pointId: outcome.point.pointId, target: 'fill' }
      };
    case 'alreadyCompleted':
      return {
        message: `Точка ${formatPoint(outcome.point)} уже заполнена`,
        hint: 'Поднесите телефон к метке следующей точки.',
        tone: 'neutral', feedback: 'notice', confirmsPoint: false,
        action: { label: `Открыть точку ${outcome.point.orderIndex}`, pointId: outcome.point.pointId, target: 'detail' }
      };
    case 'wrongOrder':
      return {
        message: outcome.point
          ? `Это ${tag} точки ${formatPoint(outcome.point)}. Сначала нужна точка ${formatPoint(outcome.requiredPoint)}`
          : `Это ${tag} другой точки маршрута. Сначала нужна точка ${formatPoint(outcome.requiredPoint)}`,
        hint: `Точка не отмечена. Подойдите к точке ${outcome.requiredPoint.orderIndex} и отсканируйте её ${method === 'nfc' ? 'метку' : 'QR-код'}.`,
        tone: 'error', feedback: 'wrongTag', confirmsPoint: false,
        action: { label: `Перейти к точке ${outcome.requiredPoint.orderIndex}`, pointId: outcome.requiredPoint.pointId, target: 'detail' }
      };
    case 'otherRoute':
      return {
        message: `${method === 'nfc' ? 'Эта метка' : 'Этот QR-код'} относится к другому маршруту${outcome.routeName ? `: «${outcome.routeName}»` : ''}`,
        hint: 'Точка не отмечена. Проверьте, что открыт нужный обход. Сменить обход можно в меню «Ещё».',
        tone: 'error', feedback: 'wrongTag', action: null, confirmsPoint: false
      };
    case 'unknown':
      return {
        message: method === 'nfc' ? 'Эта метка не найдена в маршрутах на телефоне' : 'Этот QR-код не найден в маршрутах на телефоне',
        hint: 'Точка не отмечена. Возможно, метку заменили или маршрут на телефоне устарел. Если метка точки на месте, но не подходит, нажмите «Метка недоступна».',
        tone: 'error', feedback: 'wrongTag', action: null, confirmsPoint: false
      };
  }
}

export function scanOutcomeRoute(assignmentId: string, action: ScanOutcomeAction) {
  return action.target === 'fill'
    ? `/patrol/assignment/${assignmentId}/point/${action.pointId}/fill`
    : `/patrol/assignment/${assignmentId}/point/${action.pointId}`;
}

/** Event type for the daily diagnostic report, which collects types containing "failed". */
export function scanMatchFailureEventType(outcome: ScanOutcome, method: ScanMethod) {
  switch (outcome.kind) {
    case 'wrongOrder': return `patrol.${method}.match_failed.wrong_order`;
    case 'otherRoute': return `patrol.${method}.match_failed.other_route`;
    case 'unknown': return `patrol.${method}.match_failed.unknown_tag`;
    default: return null;
  }
}

function formatPoint(point: ScanPointRef) {
  return `${point.orderIndex} «${point.name}»`;
}

function toPointRef(point: ScanPointRef): ScanPointRef {
  return { pointId: point.pointId, name: point.name, orderIndex: point.orderIndex };
}
