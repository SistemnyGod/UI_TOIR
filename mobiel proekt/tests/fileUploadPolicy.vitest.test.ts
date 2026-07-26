import { describe, expect, it } from "vitest";

import { FileUploadHttpError, PermanentFileUploadError, getFileUploadFailureDisposition } from "@/domain/files/fileUploadPolicy";

describe("file upload permanent failures", () => {
  it("marks HTTP 413 as failed without scheduling an automatic retry", () => {
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(413))).toBe("failed");
  });
  it("keeps local file integrity errors permanent", () => {
    const error = new PermanentFileUploadError("local file is missing", "file-1");

    expect(error.clientFileId).toBe("file-1");
    expect(getFileUploadFailureDisposition(error)).toBe("failed");
  });
});
