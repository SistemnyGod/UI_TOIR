export type ReportProblemItem = {
  pointId: string;
  pointName: string;
  orderIndex: number;
  reason: string;
};

export type ReportProblemGroup = Omit<ReportProblemItem, "reason"> & {
  reasons: string[];
};

export function groupReportProblems(problems: ReportProblemItem[]): ReportProblemGroup[] {
  const groups = new Map<string, ReportProblemGroup>();

  for (const problem of problems) {
    const existing = groups.get(problem.pointId);
    if (existing) {
      if (!existing.reasons.includes(problem.reason)) {
        existing.reasons.push(problem.reason);
      }
      continue;
    }

    groups.set(problem.pointId, {
      pointId: problem.pointId,
      pointName: problem.pointName,
      orderIndex: problem.orderIndex,
      reasons: [problem.reason]
    });
  }

  return [...groups.values()].sort((left, right) => left.orderIndex - right.orderIndex);
}
