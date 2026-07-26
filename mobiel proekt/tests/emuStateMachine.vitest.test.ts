import { describe, expect, it } from "vitest";

import {
  canCompleteEmuTask,
  canEditEmuTask,
  canPauseEmuTask,
  canResumeEmuTask
} from "@/domain/emu/emuStateMachine";

describe("EMU state machine", () => {
  it.each([
    ["pause", canPauseEmuTask],
    ["resume", canResumeEmuTask],
    ["complete", canCompleteEmuTask],
    ["edit", canEditEmuTask]
  ])("completedServer does not allow %s", (_action, canAction) => {
    expect(canAction("completedServer")).toBe(false);
  });
});
