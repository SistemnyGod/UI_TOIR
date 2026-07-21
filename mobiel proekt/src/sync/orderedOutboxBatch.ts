export type OrderedBatchResult<T> = {
  succeeded: T[];
  failed: T[];
  blocked: T[];
  firstError: unknown | null;
};

export async function processOrderedOutboxBatch<T>(
  items: T[],
  options: {
    getDependencyKey: (item: T) => string;
    process: (item: T) => Promise<void>;
    isFatal: (error: unknown) => boolean;
  }
): Promise<OrderedBatchResult<T>> {
  const failedDependencies = new Set<string>();
  const result: OrderedBatchResult<T> = { succeeded: [], failed: [], blocked: [], firstError: null };

  for (const item of items) {
    const dependencyKey = options.getDependencyKey(item);
    if (failedDependencies.has(dependencyKey)) {
      result.blocked.push(item);
      continue;
    }

    try {
      await options.process(item);
      result.succeeded.push(item);
    } catch (error) {
      result.failed.push(item);
      result.firstError ??= error;
      failedDependencies.add(dependencyKey);
      if (options.isFatal(error)) {
        throw error;
      }
    }
  }

  return result;
}
