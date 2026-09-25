import { ApiError } from "../../../api/client";

export function ppeErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError) {
    const details = Object.values(reason.errors ?? {}).flat().filter(Boolean);
    if (details.length) return [...new Set(details)].join(" ");
  }
  return reason instanceof Error ? reason.message : fallback;
}
