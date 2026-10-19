export type FileUploadFailureDisposition = "retryLater" | "failed";

export class FileUploadHttpError extends Error {
  readonly status: number;

  constructor(status: number, message = `File upload failed with HTTP ${status}`) {
    super(message);
    this.name = "FileUploadHttpError";
    this.status = status;
  }
}

export class PermanentFileUploadError extends Error {
  readonly clientFileId: string;

  constructor(message: string, clientFileId: string) {
    super(message);
    this.name = "PermanentFileUploadError";
    this.clientFileId = clientFileId;
  }
}
/**
 * Errors that are usually transient on a real server but could also mean the
 * upload will never succeed: a session rejected right after refresh, a 404 or
 * 409 while the server catches up with the report, or a malformed response.
 * They are retried automatically, but only for a bounded number of attempts.
 */
export const MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS = 5;
const ambiguousStatuses = new Set([401, 404, 409]);

/** `attemptNumber` is the 1-based number of the upload attempt that failed. */
export function getFileUploadFailureDisposition(error: unknown, attemptNumber = 1): FileUploadFailureDisposition {
  if (error instanceof PermanentFileUploadError) {
    return "failed";
  }

  const status = error instanceof FileUploadHttpError
    ? error.status
    : getNumericStatus(error);

  if (status === 408 || status === 429 || (status !== null && status >= 500 && status <= 599)) {
    return "retryLater";
  }

  const ambiguous = (status !== null && ambiguousStatuses.has(status)) || isProtocolError(error);
  if (ambiguous) {
    return attemptNumber < MAX_AMBIGUOUS_FILE_UPLOAD_ATTEMPTS ? "retryLater" : "failed";
  }

  return "failed";
}

function isProtocolError(error: unknown) {
  return error instanceof Error && (error.name === "MobileApiProtocolError"
    || (error as { code?: unknown }).code === "P360-API-PROTOCOL");
}

function getNumericStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}
