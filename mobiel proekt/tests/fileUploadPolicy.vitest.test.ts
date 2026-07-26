import { describe, expect, it } from "vitest";

import { FileUploadHttpError, getFileUploadFailureDisposition } from "@/domain/files/fileUploadPolicy";

describe("file upload permanent failures", () => {
  it("marks HTTP 413 as failed without scheduling an automatic retry", () => {
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(413))).toBe("failed");
  });
});
