import { describe, expect, it } from "vitest";

import { parseOutboxPayloadRows } from "@/sync/outboxPayloadParser";

describe("outbox payload quarantine", () => {
  it("quarantines malformed JSON and keeps the next command available", async () => {
    const quarantined: Array<{ operationId: string; reason: string }> = [];
    const rows = [
      { client_operation_id: "operation-invalid", payload_json: "{broken" },
      { client_operation_id: "operation-valid", payload_json: '{"assignmentId":"assignment-1"}' }
    ];

    const commands = await parseOutboxPayloadRows(
      rows,
      (row) => ({ clientOperationId: row.client_operation_id, payload: JSON.parse(row.payload_json) }),
      async (row, reason) => {
        quarantined.push({ operationId: row.client_operation_id, reason });
      }
    );

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.operationId).toBe("operation-invalid");
    const sent = commands.map((command) => command.clientOperationId);

    expect(sent).toEqual(["operation-valid"]);
  });
});