import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiGetCache } from "../api/client";
import { createApiPatrolDataRepository, emptyPatrolDataSnapshot } from "../repositories/patrolDataRepository";

afterEach(() => clearApiGetCache());

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

  it("requests only the directories required by the open workspace", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const repository = createApiPatrolDataRepository({ fetcher });

    await repository.getSnapshot({ routes: true });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/routes?includeArchived=true",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("reloads a requested directory after an explicit refresh", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const repository = createApiPatrolDataRepository({ fetcher });

    await repository.getSnapshot({ routes: true });
    await repository.getSnapshot({ routes: true });
    await repository.getSnapshot({ routes: true }, { reload: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
