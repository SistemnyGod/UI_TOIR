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
export function getFileUploadFailureDisposition(error: unknown): FileUploadFailureDisposition {
  const status = error instanceof FileUploadHttpError
    ? error.status
    : getNumericStatus(error);

  if (status === 408 || status === 429 || (status !== null && status >= 500 && status <= 599)) {
    return "retryLater";
  }

  return "failed";
}

function getNumericStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}
