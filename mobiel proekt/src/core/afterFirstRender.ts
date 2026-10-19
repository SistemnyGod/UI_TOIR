/** How long the first screen gets to draw and read its own data before background startup work. */
export const afterFirstRenderDelayMs = 1200;

/**
 * Runs non-critical startup work (registrations, housekeeping, update checks)
 * once the first screen has had time to draw. Returns a cancel function for
 * effect cleanup; a cancelled task never runs.
 */
export function runAfterFirstRender(task: () => void, delayMs = afterFirstRenderDelayMs): () => void {
  const timer = setTimeout(task, delayMs);
  return () => clearTimeout(timer);
}
