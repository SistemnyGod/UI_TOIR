type DatedRequest = { plannedStartAt: string; requestId: string };

/** Compare instants, including server dates with different UTC offsets. */
export function compareRequestDatesNewestFirst(left: DatedRequest, right: DatedRequest) {
  const leftTime = Date.parse(left.plannedStartAt);
  const rightTime = Date.parse(right.plannedStartAt);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  return (leftValid ? rightTime - leftTime : 0) || left.requestId.localeCompare(right.requestId);
}
