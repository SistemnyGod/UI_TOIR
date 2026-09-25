import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiGetCache } from "../api/client";
import { createInventoryRepository } from "../repositories/inventoryRepository";

afterEach(() => { clearApiGetCache(); vi.unstubAllGlobals(); });

describe("PPE kit template repository", () => {
  it("uses server validation before applying a template", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "template-1", lines: [] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await createInventoryRepository({ baseUrl: "https://example.test" }).validatePpeKitTemplate("template-1", "norm-1");
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/v1/inventory/ppe/kit-templates/template-1/apply", expect.objectContaining({ method: "POST", body: JSON.stringify({ normSetId: "norm-1" }) }));
  });

  it("archives with the optimistic version", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "template-1" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await createInventoryRepository({ baseUrl: "https://example.test" }).archivePpeKitTemplate("template-1", 7);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/v1/inventory/ppe/kit-templates/template-1/archive", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedVersion: 7 }) }));
  });
});
