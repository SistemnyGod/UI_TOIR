import { describe, expect, it } from "vitest";
import { orderServerCandidateBaseUrls } from "@/core/serverCandidatePolicy";

describe("mobile test contour", () => {
  it("runs a pure mobile policy without loading the Expo runtime", () => {
    expect(
      orderServerCandidateBaseUrls({
        primaryBaseUrl: "http://local",
        storedBaseUrl: "http://local",
        allowedBaseUrls: ["http://fallback"],
      }),
    ).toEqual(["http://local", "http://fallback"]);
  });
});