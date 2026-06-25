import type { PatrolResult } from "../../../types";

export interface ResultGroup {
  id: string;
  status: string;
  route: string;
  routeId?: string;
  territory: string;
  employee: string;
  employeeId: string;
  shift: string;
  plannedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  firstScanAt?: string;
  lastScanAt?: string;
  duration: DurationSummary;
  photos: number;
  issues: number;
  points: number;
  okPoints: number;
  issuePoints: number;
  comment?: string;
  results: PatrolResult[];
}

export interface DurationSummary {
  label: string;
  hint: string;
  tone: "ok" | "warning" | "muted";
  minutes?: number;
}
