import type { PatrolCompletionPhotoPayload, RouteDirectoryItem, RoutePoint } from "../../../types";

export interface PointCompletionDraft {
  routePointId: string;
  status: string;
  comment: string;
  issueType: string;
  severity: string;
  photos: number;
  photoAttachments: PatrolCompletionPhotoPayload[];
}

export function getCompletionRoutePoints(route?: RouteDirectoryItem): RoutePoint[] {
  return (route?.points ?? []).filter(point => {
    const status = String(point.status ?? "");
    return status !== "Черновик" && status !== "Draft";
  });
}

export async function readCompletionPhotos(files: File[], signal: AbortSignal): Promise<PatrolCompletionPhotoPayload[]> {
  if (files.some(file => !file.type.startsWith("image/"))) throw new Error("Выберите файлы фотографий. Предыдущие вложения сохранены.");
  return Promise.all(files.map(file => new Promise<PatrolCompletionPhotoPayload>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Чтение отменено", "AbortError")); return; }
    const reader = new FileReader();
    const abort = () => reader.abort();
    const finish = () => signal.removeEventListener("abort", abort);
    reader.onerror = () => { finish(); reject(reader.error ?? new Error(`Не удалось прочитать фото «${file.name}».`)); };
    reader.onabort = () => { finish(); reject(new DOMException("Чтение отменено", "AbortError")); };
    reader.onload = () => {
      finish();
      const value = typeof reader.result === "string" ? reader.result : "";
      const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : "";
      if (!base64) { reject(new Error(`Фото «${file.name}» пустое или не читается.`)); return; }
      resolve({ contentType: file.type, dataBase64: base64, fileName: file.name });
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  })));
}
