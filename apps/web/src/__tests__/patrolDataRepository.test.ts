import { describe, expect, it, vi } from "vitest";
import { createApiPatrolDataRepository, emptyPatrolDataSnapshot } from "../repositories/patrolDataRepository";

describe("patrol data repository permissions", () => {
  it("does not request patrol endpoints when the session has no patrol permissions", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repository = createApiPatrolDataRepository({
      access: {
        dashboard: false,
        employees: false,
        routes: false,
      },
      fetcher,
    });

    await expect(repository.getSnapshot()).resolves.toEqual(emptyPatrolDataSnapshot());
    expect(fetcher).not.toHaveBeenCalled();
  });
});