import { describe, expect, it } from "vitest";

import { getReleaseResponseResolution } from "@/domain/patrol/releaseResolutionPolicy";

describe("отклонённый возврат заявки", () => {
  it("сохраняет назначение и возвращает его в accepted", () => {
    expect(getReleaseResponseResolution("rejected")).toEqual({
      restoreAccepted: true,
      assignmentStatus: "accepted",
      preserveLocalData: true
    });
  });
});