const defaultAttempts = 6;
const defaultDelayMs = 140;

export async function withSqliteBusyRetry<T>(operation: () => Promise<T>, attempts = defaultAttempts): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isSqliteBusyError(error) || attempt === attempts - 1) {
        break;
      }

      await delay(defaultDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? new Error(normalizeSqliteBusyMessage(lastError))
    : lastError;
}

export function isSqliteBusyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return normalized.includes("database is locked")
    || normalized.includes("database table is locked")
    || normalized.includes("sqlite_busy");
}

function normalizeSqliteBusyMessage(error: Error) {
  return isSqliteBusyError(error)
    ? "База данных занята синхронизацией. Повторите действие через несколько секунд."
    : error.message;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
