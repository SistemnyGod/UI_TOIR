import { describe, expect, it } from "vitest";

import { getCompletionAttachmentFailure } from "@/domain/files/completionAttachmentPolicy";

describe("completion attachment preflight", () => {
  it("blocks completion when point_results references a file missing on device", () => {
    const failure = getCompletionAttachmentFailure(
      {
        clientFileId: "photo-1",
        ownerUserId: "user-1",
        contourId: "patrol360-local-enterprise",
        localPath: "file:///missing/photo-1.jpg",
        status: "localOnly",
        sha256: "abc123",
        sizeBytes: 1024,
        contentType: "image/jpeg",
        mediaKind: "photo",
        assignmentId: "assignment-1",
        pointId: "point-1"
      },
      { exists: false },
      {
        ownerUserId: "user-1",
        contourId: "patrol360-local-enterprise",
        assignmentId: "assignment-1",
        pointId: "point-1",
        requiredPhoto: true
      }
    );

    expect(failure).toBe("Файл вложения отсутствует или пуст на телефоне");
  });
});