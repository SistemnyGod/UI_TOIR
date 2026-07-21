/** Keep foreground work bounded while ensuring a long outbox does not wait for
 * an unrelated UI/network event after its first 100 operations. */
export function shouldContinueOutboxSync(processedBatches: number, maxBatches: number, hasUnprocessedCommands: boolean) {
  return processedBatches >= maxBatches && hasUnprocessedCommands;
}
