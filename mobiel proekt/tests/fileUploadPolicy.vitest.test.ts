import { describe, expect, it } from "vitest";

import { MobileApiProtocolError } from "@/api/protocolValidation";
import { FileUploadHttpError, MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS, PermanentFileUploadError, getFileUploadFailureDisposition } from "@/domain/files/fileUploadPolicy";

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

describe("file upload transient failures", () => {
  it.each([408, 429, 500, 503])("retries HTTP %i without an attempt cap", (status) => {
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(status), 50)).toBe("retryLater");
  });

  it.each([401, 404, 409])("retries HTTP %i until the attempt cap, then gives up", (status) => {
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(status), 1)).toBe("retryLater");
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(status), MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS - 1)).toBe("retryLater");
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(status), MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS)).toBe("failed");
  });

  it("treats a malformed upload response as a bounded transient failure", () => {
    const error = new MobileApiProtocolError("bad json");
    expect(getFileUploadFailureDisposition(error, 2)).toBe("retryLater");
    expect(getFileUploadFailureDisposition(error, MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS)).toBe("failed");
  });

  it("keeps other client errors permanent", () => {
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(400))).toBe("failed");
    expect(getFileUploadFailureDisposition(new FileUploadHttpError(403))).toBe("failed");
  });
});
