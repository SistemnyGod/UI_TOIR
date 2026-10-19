export type SelectedStatus = "ok" | "issue" | "skipped";

export type PointAttachment = {
  clientFileId: string;
  localPath: string;
  status: string;
  mediaKind?: "photo" | "video" | null;
};

