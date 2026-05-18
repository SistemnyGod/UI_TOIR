import { patrolResults } from "../data";
import type { PatrolResult, ResultMode } from "../types";

export const patrolResultsFallback = patrolResults;

export interface ResultMetrics {
  total: number;
  issues: number;
  late: number;
  withoutPhotos: number;
}

export function filterPatrolResults(results: PatrolResult[], mode: ResultMode) {
  return results.filter((result) => {
    if (mode === "issues") return result.status === "Замечание" || result.status === "Не подтверждено";
    if (mode === "late") return result.status === "Просрочено";
    if (mode === "photos") return result.photos > 0;
    return true;
  });
}

export function getResultMetrics(results: PatrolResult[]): ResultMetrics {
  return {
    total: results.length,
    issues: results.filter((item) => item.status === "Замечание").length,
    late: results.filter((item) => item.status === "Просрочено").length,
    withoutPhotos: results.filter((item) => item.photos === 0).length,
  };
}

export function findPatrolResult(results: PatrolResult[], resultId: string) {
  return results.find((result) => result.id === resultId) ?? results[0];
}
