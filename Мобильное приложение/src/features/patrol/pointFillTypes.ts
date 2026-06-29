export type SelectedStatus = "ok" | "issue" | "skipped";

export type FillPhase = "status" | "details";

export type PointAttachment = {
  clientFileId: string;
  localPath: string;
  status: string;
  mediaKind?: "photo" | "video" | null;
};

