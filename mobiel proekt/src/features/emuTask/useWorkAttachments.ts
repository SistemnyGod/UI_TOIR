import { useState } from "react";

import { WorkItemDto } from "@/domain/emu/emuTypes";
import type { MediaSource, RemarkAttachmentTarget, WorkStatusSetters } from "@/features/emuTask/workAccountingModel";
import { attachRemarkMediaFromGallery, attachRemarkPhotoFromCamera, attachRemarkVideoFromCamera, attachWorkMediaFromGallery, attachWorkPhotoFromCamera, attachWorkVideoFromCamera } from "@/services/mediaAttachmentService";

/** Photo / video / gallery attachments for a started work or a saved remark. */
export function useWorkAttachments({ reloadLocal, setLoading, setMessage }: { reloadLocal: () => Promise<void> } & WorkStatusSetters) {
  const [workTarget, setWorkTarget] = useState<WorkItemDto | null>(null);
  const [remarkTarget, setRemarkTarget] = useState<RemarkAttachmentTarget>(null);

  async function attachToWork(kind: MediaSource) {
    const workTaskId = workTarget?.workSessionId ?? workTarget?.itemId ?? null;
    if (!workTaskId || workTarget?.kind === "planTask") {
      setMessage("Сначала начните работу, затем добавьте вложения.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (kind === "photo") {
        await attachWorkPhotoFromCamera(workTaskId);
        setMessage("Фото сохранено на телефоне и будет отправлено в ЭМУ.");
      } else if (kind === "video") {
        await attachWorkVideoFromCamera(workTaskId);
        setMessage("Видео сохранено на телефоне и будет отправлено в ЭМУ.");
      } else {
        const result = await attachWorkMediaFromGallery(workTaskId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` Отклонено: ${result.errors.join("; ")}` : "";
          setMessage(`Добавлено вложений: ${result.attachedCount}. Фото: ${result.photoCount}, видео: ${result.videoCount}.${suffix}`);
        }
      }
      setWorkTarget(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить вложение к работе.");
    } finally {
      setLoading(false);
    }
  }

  async function attachToRemark(kind: MediaSource) {
    if (!remarkTarget) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (kind === "photo") {
        await attachRemarkPhotoFromCamera(remarkTarget.remarkId);
        setMessage("Фото замечания сохранено на телефоне и будет отправлено на сервер.");
      } else if (kind === "video") {
        await attachRemarkVideoFromCamera(remarkTarget.remarkId);
        setMessage("Видео замечания сохранено на телефоне и будет отправлено на сервер.");
      } else {
        const result = await attachRemarkMediaFromGallery(remarkTarget.remarkId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` Отклонено: ${result.errors.join("; ")}` : "";
          setMessage(`Добавлено вложений к замечанию: ${result.attachedCount}. Фото: ${result.photoCount}, видео: ${result.videoCount}.${suffix}`);
        }
      }
      setRemarkTarget(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить вложение к замечанию.");
    } finally {
      setLoading(false);
    }
  }

  return {
    work: { target: workTarget, open: setWorkTarget, close: () => setWorkTarget(null), attach: attachToWork },
    remark: { target: remarkTarget, open: setRemarkTarget, close: () => setRemarkTarget(null), attach: attachToRemark }
  };
}
