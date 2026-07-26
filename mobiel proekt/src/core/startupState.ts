export type StartupState =
  | { status: "initializing" }
  | { status: "ready" }
  | { status: "recoverableError"; error: unknown }
  | { status: "fatalDatabaseError"; error: unknown };

export function classifyStartupError(error: unknown): StartupState {
  const message = error instanceof Error ? error.message : String(error);
  const databaseFailure = /database|sqlite|sqlcipher|migration|schema|integrity|storage|encrypted/i.test(message);

  return databaseFailure
    ? { status: "fatalDatabaseError", error }
    : { status: "recoverableError", error };
}