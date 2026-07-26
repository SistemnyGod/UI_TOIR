export type OutboxPayloadRow = {
  client_operation_id: string;
  payload_json: string;
};

export async function parseOutboxPayloadRows<T, TRow extends OutboxPayloadRow = OutboxPayloadRow>(
  rows: readonly TRow[],
  parse: (row: TRow) => T,
  quarantine: (row: TRow, reason: string) => Promise<void>
): Promise<T[]> {
  const parsed: T[] = [];

  for (const row of rows) {
    try {
      parsed.push(parse(row));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Некорректный JSON payload.";
      await quarantine(row, reason).catch(() => undefined);
    }
  }

  return parsed;
}