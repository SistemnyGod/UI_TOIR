export const retryDelaysMs = [15_000, 60_000, 300_000, 900_000, 3_600_000] as const;
export const retryJitterRatio = 0.2;

/**
 * Returns a bounded retry delay. The injected random value makes the policy
 * deterministic in tests while production uses Math.random to avoid a
 * thundering herd when the server comes back online.
 */
export function getRetryDelayMs(attempt: number, random: number | (() => number) = Math.random) {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  const baseDelay = retryDelaysMs[Math.min(normalizedAttempt, retryDelaysMs.length - 1)];
  const randomValue = typeof random === "function" ? random() : random;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const jitterFactor = 1 - retryJitterRatio + boundedRandom * retryJitterRatio * 2;
  return Math.round(baseDelay * jitterFactor);
}