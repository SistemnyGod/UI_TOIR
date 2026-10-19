import { useEffect, useState } from "react";
import type { ApiFileResponse } from "../../../api/client";
import { downloadResultAttachment } from "../../../repositories/resultsRepository";
import type { PatrolResultAttachment } from "../../../types";
import { isImageAttachment, isVideoAttachment } from "./resultMedia";

/** Only the displayed file is fetched. Its URL belongs to this mounted preview. */
export function useAttachmentPreview(attachment?: PatrolResultAttachment) {
  const key = attachment ? JSON.stringify([attachment.id, attachment.downloadUrl, attachment.contentType, attachment.fileName]) : "";
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([key, attempt]);
  const [preview, setPreview] = useState<{ key: string; url: string; error: string; file?: ApiFileResponse }>({ key: "", url: "", error: "" });
  const supported = Boolean(attachment && (isImageAttachment(attachment) || isVideoAttachment(attachment)));
  useEffect(() => {
    let cancelled = false;
    let url = "";
    const controller = new AbortController();
    setPreview({ key: requestKey, url: "", error: "" });
    if (!attachment || !supported) return;
    void downloadResultAttachment(attachment, { signal: controller.signal }).then(file => {
      if (cancelled) return;
      url = URL.createObjectURL(file.blob);
      setPreview({ key: requestKey, url, error: "", file });
    }).catch(() => {
      if (!cancelled) setPreview({ key: requestKey, url: "", error: "Не удалось загрузить вложение. Повторите попытку." });
    });
    return () => { cancelled = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [requestKey, supported]);
  return {
    url: preview.key === requestKey ? preview.url : "",
    error: preview.key === requestKey ? preview.error : "",
    file: preview.key === requestKey ? preview.file : undefined,
    retry: () => setAttempt(value => value + 1),
    // A decoder event from a removed image must not clear the next preview.
    fail: (message: string) => setPreview(current => current === preview && current.key === requestKey ? { ...current, url: "", error: message } : current),
  };
}
