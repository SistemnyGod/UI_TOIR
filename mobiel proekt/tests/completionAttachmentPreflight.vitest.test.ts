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

  it("explains every refused attachment to the employee in Russian, without technical English", () => {
    const file = {
      clientFileId: "photo-1", ownerUserId: "user-1", contourId: "c", localPath: "file:///photo-1.jpg", status: "localOnly",
      sha256: "abc123", sizeBytes: 1024, contentType: "image/jpeg" as const, mediaKind: "photo" as const, assignmentId: "a", pointId: "p"
    };
    const present = { exists: true, size: 1024 };
    const context = { ownerUserId: "user-1", contourId: "c", assignmentId: "a", pointId: "p", requiredPhoto: true };
    const video = { ...file, contentType: "video/mp4" as const, mediaKind: "video" as const };
    const failures = [
      getCompletionAttachmentFailure(null, present, context),
      getCompletionAttachmentFailure({ ...file, ownerUserId: "other" }, present, context),
      getCompletionAttachmentFailure({ ...file, contourId: "other" }, present, context),
      getCompletionAttachmentFailure({ ...file, pointId: "other" }, present, context),
      getCompletionAttachmentFailure({ ...file, status: "failed" }, present, context),
      getCompletionAttachmentFailure(file, { exists: true, size: 0 }, context),
      getCompletionAttachmentFailure({ ...file, sizeBytes: null }, present, context),
      getCompletionAttachmentFailure({ ...file, sizeBytes: 50 * 1024 * 1024 }, present, context),
      getCompletionAttachmentFailure({ ...video, sizeBytes: 500 * 1024 * 1024 }, present, { ...context, requiredPhoto: false }),
      getCompletionAttachmentFailure({ ...file, sha256: " " }, present, context),
      getCompletionAttachmentFailure({ ...file, contentType: "video/mp4" }, present, context),
      getCompletionAttachmentFailure(video, present, context)
    ];

    expect(getCompletionAttachmentFailure(file, present, context)).toBeNull();
    expect(new Set(failures).size).toBe(failures.length);
    for (const failure of failures) {
      expect(failure).toMatch(/[А-Яа-яЁё]/);
      expect(failure).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});
