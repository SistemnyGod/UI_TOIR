import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";

describe("ApiClient", () => {
  it("uses configured base url, credentials, headers, and auth token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const client = new ApiClient({
      baseUrl: "https://api.example.test/",
      defaultHeaders: { "X-Client": "patrol360" },
      fetcher,
      getAuthToken: () => "token-1",
    });

    await client.post("/api/v1/routes", { name: "North" }, { headers: { "X-Request": "req-1" } });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/routes",
      expect.objectContaining({
        body: JSON.stringify({ name: "North" }),
        credentials: "same-origin",
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          authorization: "Bearer token-1",
          "content-type": "application/json",
          "x-client": "patrol360",
          "x-request": "req-1",
        }),
      }),
    );
  });

  it("returns undefined for empty successful responses", async () => {
    const client = new ApiClient({
      fetcher: async () => new Response(null, { status: 204 }),
    });

    await expect(client.delete("/api/v1/routes/1")).resolves.toBeUndefined();
  });

  it("maps ProblemDetails errors and request id into ApiError", async () => {
    const problem = {
      title: "Validation failed",
      status: 400,
      errors: {
        name: ["Name is required"],
      },
    };
    const client = new ApiClient({
      fetcher: async () =>
        jsonResponse(problem, {
          headers: { "x-request-id": "req-42" },
          status: 400,
        }),
    });

    await expect(client.get("/api/v1/routes")).rejects.toMatchObject({
      errors: { name: ["Name is required"] },
      kind: "http",
      message: "Validation failed",
      path: "/api/v1/routes",
      requestId: "req-42",
      status: 400,
    });
  });

  it("notifies on unauthorized API responses", async () => {
    const onUnauthorized = vi.fn();
    const client = new ApiClient({
      fetcher: async () => jsonResponse({ title: "Unauthorized" }, { status: 401 }),
      onUnauthorized,
    });

    await expect(client.get("/api/v1/dashboard")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("converts request timeout to ApiError", async () => {
    vi.useFakeTimers();
    try {
      const client = new ApiClient({
        fetcher: (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
        timeoutMs: 5,
      });

      const expectation = expect(client.get("/api/v1/slow")).rejects.toMatchObject({
        kind: "timeout",
        path: "/api/v1/slow",
        status: 0,
      });

      await vi.advanceTimersByTimeAsync(5);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
    status: init.status ?? 200,
  });
}
