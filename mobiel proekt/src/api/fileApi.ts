import * as FileSystem from "expo-file-system/legacy";

import { refreshStoredAccessToken } from "@/api/httpClient";
import { MobileApiProtocolError } from "@/api/protocolValidation";
import { invalidateServerHealthCache, probeServerHealthCached } from "@/api/serverHealthApi";
import { MobileNetworkError, photoUploadTimeoutMs, serverUnavailableMessage, videoUploadTimeoutMs } from "@/api/networkTimeout";
import { shouldTryNextMobileServer } from "@/api/serverFailoverPolicy";
import { getAccessToken } from "@/auth/tokenStorage";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls } from "@/core/serverSettings";
import { LocalMobileFile, MobileFileUploadResponse } from "@/domain/files/fileTypes";
import { currentContourId } from "@/core/environments";
import { requiresClientFileHash } from "@/sync/fileHash";
import { FileUploadHttpError, PermanentFileUploadError } from "@/domain/files/fileUploadPolicy";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/domain/files/fileUploadLimits";
import { fileUploadResponseSchema } from "@/api/schemas";


export async function uploadMobileFile(file: LocalMobileFile) {
  await validateMobileFileBeforeUpload(file);

  const token = await getAccessToken();
  const runtimeConfig = await getMobileRuntimeConfig();
  let { apiBaseUrl, result } = await uploadFileWithFailover(runtimeConfig.apiBaseUrl, runtimeConfig.syncProtocolVersion, runtimeConfig.contourId, file, token);

  // Keep attachment upload consistent with JSON requests when only the
  // refresh token remains available.
  if (result.status === 401) {
    const refreshedToken = await refreshStoredAccessToken();
    ({ result } = await uploadFileWithFailover(apiBaseUrl, runtimeConfig.syncProtocolVersion, runtimeConfig.contourId, file, refreshedToken));
  }

  if (result.status === 401) {
    throw new Error(
      `Сервер временно не принял обновлённую сессию при загрузке файла. Файл и отчёт сохранены для автоматического повтора. Адрес: ${apiBaseUrl}`
    );
  }

  if (result.status < 200 || result.status >= 300) {
    throw new FileUploadHttpError(result.status, `Не удалось загрузить файл: ${result.status}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.body);
  } catch {
    throw new MobileApiProtocolError("Ответ загрузки файла не является корректным JSON версии мобильного API. Файл сохранён для повторной отправки.");
  }

  return validateFileUploadResponse(payload, file.clientFileId);
}

function validateFileUploadResponse(value: unknown, expectedClientFileId: string): MobileFileUploadResponse {
  if (typeof value !== "object" || value === null) {
    throw new MobileApiProtocolError("Ответ загрузки файла не соответствует версии мобильного API. Файл сохранён для повторной отправки.");
  }

  const parsed = fileUploadResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.clientFileId !== expectedClientFileId) {
    throw new MobileApiProtocolError("Ответ загрузки файла не соответствует версии мобильного API. Файл сохранён для повторной отправки.");
  }
  const response = parsed.data as Record<string, unknown>;
  if (response.clientFileId !== expectedClientFileId
    || typeof response.serverFileId !== "string"
    || response.serverFileId.trim().length === 0
    || (response.status !== "uploaded" && response.status !== "duplicate")
    || typeof response.uploadedAt !== "string") {
    throw new MobileApiProtocolError("Ответ загрузки файла не соответствует версии мобильного API. Файл сохранён для повторной отправки.");
  }

  return response as unknown as MobileFileUploadResponse;
}

export const uploadPatrolPhoto = uploadMobileFile;

async function validateMobileFileBeforeUpload(file: LocalMobileFile) {
  const rejectLocalFile = (message: string): never => {
    throw new PermanentFileUploadError(message, file.clientFileId || "unknown");
  };
  if (file.contourId && file.contourId !== currentContourId) {
    rejectLocalFile(`Вложение относится к другому серверному контуру (${file.contourId}) и не будет отправлено.`);
  }
  const hasPatrolPointScope = Boolean(file.assignmentId && file.pointId);
  const hasRemarkScope = Boolean(file.remarkId);
  const hasWorkTaskScope = Boolean(file.workTaskId);

  if (!hasPatrolPointScope && !hasRemarkScope && !hasWorkTaskScope) {
    rejectLocalFile("Файл не привязан к точке обхода, замечанию смены или работе.");
  }

  if (!file.clientFileId || !file.localPath || !file.sizeBytes) {
    rejectLocalFile("Локальные данные файла неполные.");
  }
  if (requiresClientFileHash(file) && !file.sha256) {
    rejectLocalFile("Локальные данные фото не содержат контрольную сумму.");
  }

  if (file.contentType !== "image/jpeg" && file.contentType !== "video/mp4") {
    rejectLocalFile("Можно отправлять только фото JPEG и видео MP4.");
  }

  const sizeBytes = file.sizeBytes;
  const maxSize = file.contentType === "video/mp4" || file.mediaKind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (sizeBytes === null || sizeBytes === undefined || sizeBytes <= 0 || sizeBytes > maxSize) {
    if (file.mediaKind !== "video" && file.contentType !== "video/mp4") {
      rejectLocalFile("Фото слишком большое. Максимум 6 МБ.");
    }
    rejectLocalFile(file.mediaKind === "video" ? "Видео слишком большое. Максимум 30 МБ." : "Фото слишком большое. Максимум 6 МБ.");
  }

  let fileInfo: Awaited<ReturnType<typeof FileSystem.getInfoAsync>> | null = null;
  try {
    fileInfo = await FileSystem.getInfoAsync(file.localPath);
  } catch {
    rejectLocalFile("Local file is unavailable. Replace the attachment.");
  }
  if (!fileInfo || !fileInfo.exists) {
    rejectLocalFile("Файл не найден на телефоне. Добавьте вложение повторно.");
  }
}

async function uploadFileWithFailover(
  preferredApiBaseUrl: string,
  syncProtocolVersion: string,
  contourId: string,
  file: LocalMobileFile,
  token: string | null
) {
  const apiBaseUrls = await getServerCandidateBaseUrls(preferredApiBaseUrl);
  let lastError: unknown = null;
  let lastResult: Awaited<ReturnType<typeof uploadFileWithToken>> | null = null;

  for (const apiBaseUrl of apiBaseUrls) {
    try {
      const health = await probeServerHealthCached(apiBaseUrl, contourId);
      if (!health.ok) {
        const message = health.message ?? "Сервер не прошёл проверку контура: " + apiBaseUrl;
        lastError = health.errorKind
          ? new MobileNetworkError(health.errorKind, undefined, message)
          : new Error(message);
        continue;
      }

      const result = await uploadFileWithToken(apiBaseUrl, syncProtocolVersion, contourId, file, token);
      if (shouldTryNextMobileServer(result.status, null, Boolean(result.body))
          && apiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResult = result;
        continue;
      }

      return { apiBaseUrl, result };
    } catch (error) {
      invalidateServerHealthCache(apiBaseUrl, contourId);
      lastError = error;
    }
  }

  if (lastResult) {
    return { apiBaseUrl: apiBaseUrls[apiBaseUrls.length - 1], result: lastResult };
  }

  if (lastError instanceof MobileNetworkError) {
    throw new MobileNetworkError(
      lastError.kind,
      lastError,
      `${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`
    );
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
}

async function uploadTaskWithCancellation(
  uploadTask: ReturnType<typeof FileSystem.createUploadTask>,
  timeoutMs: number
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  return new Promise<Awaited<ReturnType<typeof uploadTask.uploadAsync>>>((resolve, reject) => {
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      callback();
    };

    timeoutId = setTimeout(() => {
      void uploadTask.cancelAsync()
        .catch(() => undefined)
        .finally(() => settle(() => reject(new MobileNetworkError("timeout", new Error(serverUnavailableMessage), serverUnavailableMessage))));
    }, timeoutMs);

    void uploadTask.uploadAsync().then(
      (result) => settle(() => resolve(result)),
      (error) => settle(() => reject(error))
    );
  });
}
async function uploadFileWithToken(
  apiBaseUrl: string,
  syncProtocolVersion: string,
  contourId: string,
  file: LocalMobileFile,
  token: string | null
) {
  const contentType = file.contentType ?? "image/jpeg";
  const timeoutMs = file.mediaKind === "video" || contentType === "video/mp4" ? videoUploadTimeoutMs : photoUploadTimeoutMs;
  try {
    const uploadTask = FileSystem.createUploadTask(`${apiBaseUrl}/api/v1/mobile/files`, file.localPath, {
        fieldName: "file",
        headers: {
          Accept: "application/json",
          "X-Mobile-Sync-Protocol": syncProtocolVersion,
          "X-Patrol360-Client": "mobile-app",
          "X-Patrol360-Contour": contourId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        httpMethod: "POST",
        mimeType: contentType,
        parameters: {
          contourId,
          assignmentId: file.assignmentId ?? "",
          capturedAtLocal: file.createdAtLocal,
          clientFileId: file.clientFileId,
          pointId: file.pointId ?? "",
          remarkId: file.remarkId ?? "",
          workTaskId: file.workTaskId ?? "",
          sha256: file.sha256 ?? "",
          sizeBytes: String(file.sizeBytes ?? 0)
        },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART
      });
    const result = await uploadTaskWithCancellation(uploadTask, timeoutMs);
    if (!result) {
      throw new Error("Сервер не вернул ответ при загрузке файла. Файл сохранён для повторной отправки.");
    }

    return result;
  } catch (error) {
    if (error instanceof MobileNetworkError) {
      throw error;
    }

    throw new MobileNetworkError("network", error);
  }
}
