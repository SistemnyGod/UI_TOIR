import { describe, expect, it } from "vitest";

import { applyWorkTaskServerRevision } from "@/domain/emu/workTaskRevisionPolicy";

describe("EMU work-task revision chain", () => {
  it("uses the accepted pause revision for the next resume command", () => {
    const [resume] = applyWorkTaskServerRevision([
      {
        commandType: "resumeWorkTask",
        status: "pending",
        entityServerId: "local-task-1",
        payload: { taskId: "local-task-1", baseRevision: 5 }
      }
    ], 6, "server-task-1");

    expect(resume.payload.baseRevision).toBe(6);
    expect(resume.payload.taskId).toBe("server-task-1");
    expect(resume.entityServerId).toBe("server-task-1");
  });
});
