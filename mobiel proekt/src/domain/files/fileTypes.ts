export type LocalFileStatus =
  | "localOnly"
  | "queued"
  | "uploading"
  | "retryLater"
  | "uploaded"
  | "linked"
  | "failed"
  | "deletedAfterRetention";

export type LocalMobileFile = {
  clientFileId: string;
  ownerUserId: string;
  contourId?: string;
  localPath: string;
  previewPath?: string | null;
  serverFileId?: string | null;
  status: LocalFileStatus;
  sha256?: string | null;
  sizeBytes?: number | null;
  contentType?: "image/jpeg" | "video/mp4" | null;
  mediaKind?: "photo" | "video" | null;
  assignmentId?: string | null;
  pointId?: string | null;
  remarkId?: string | null;
  workTaskId?: string | null;
  createdAtLocal: string;
};

export type MobileFileUploadRequest = {
  clientFileId: string;
  sha256?: string | null;
  mimeType: "image/jpeg" | "video/mp4";
  sizeBytes: number;
  assignmentId?: string | null;
  pointId?: string | null;
  remarkId?: string | null;
  workTaskId?: string | null;
};

export type MobileFileUploadResponse = {
  clientFileId: string;
  serverFileId: string;
  status: "uploaded" | "duplicate";
  uploadedAt: string;
};
