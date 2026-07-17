import * as FileSystem from "expo-file-system/legacy";

import { refreshStoredAccessToken } from "@/api/httpClient";
import { photoUploadTimeoutMs, serverUnavailableMessage, videoUploadTimeoutMs, withTimeout } from "@/api/networkTimeout";
import { shouldTryNextMobileServer } from "@/api/serverFailoverPolicy";
import { clearAuthTokens, getAccessToken } from "@/auth/tokenStorage";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls, setServerBaseUrl } from "@/core/serverSettings";
import { LocalMobileFile, MobileFileUploadResponse } from "@/domain/files/fileTypes";

const maxPhotoBytes = 6 * 1024 * 1024;
const maxVideoBytes = 25 * 1024 * 1024;

export async function uploadMobileFile(file: LocalMobileFile) {
  await validateMobileFileBeforeUpload(file);

  const token = await getAccessToken();
  const runtimeConfig = await getMobileRuntimeConfig();
  let { apiBaseUrl, result } = await uploadFileWithFailover(runtimeConfig.apiBaseUrl, runtimeConfig.syncProtocolVersion, file, token);

  // Keep attachment upload consistent with JSON requests when only the
  // refresh token remains available.
  if (result.status === 401) {
    const refreshedToken = await refreshStoredAccessToken();
    ({ result } = await uploadFileWithFailover(apiBaseUrl, runtimeConfig.syncProtocolVersion, file, refreshedToken));
  }

  if (result.status === 401) {
    // The retry used a refreshed token and was rejected again. Stop the
    // attachment retry loop; local file/outbox data remains available after
    // an explicit sign-in.
    await clearAuthTokens();
    throw new Error(
      `Сессия не восстановлена при загрузке файла. Войдите в аккаунт повторно. Файл и отчёт сохранены. Адрес: ${apiBaseUrl}`
    );
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Не удалось загрузить файл: ${result.status}`);
  }

  return validateFileUploadResponse(JSON.parse(result.body), file.clientFileId);
}

function validateFileUploadResponse(value: unknown, expectedClientFileId: string): MobileFileUploadResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("Сервер вернул некорректный ответ вложения. Файл сохранён для повторной отправки.");
  }

  const response = value as Record<string, unknown>;
  if (response.clientFileId !== expectedClientFileId
    || typeof response.serverFileId !== "string"
    || response.serverFileId.trim().length === 0
    || (response.status !== "uploaded" && response.status !== "duplicate")
    || typeof response.uploadedAt !== "string") {
    throw new Error("Сервер вернул неполный ответ вложения. Файл сохранён для повторной отправки.");
  }

  return response as unknown as MobileFileUploadResponse;
}

export const uploadPatrolPhoto = uploadMobileFile;

async function validateMobileFileBeforeUpload(file: LocalMobileFile) {
  const hasPatrolPointScope = Boolean(file.assignmentId && file.pointId);
  const hasRemarkScope = Boolean(file.remarkId);
  const hasWorkTaskScope = Boolean(file.workTaskId);

  if (!hasPatrolPointScope && !hasRemarkScope && !hasWorkTaskScope) {
    throw new Error("Файл не привязан к точке обхода, замечанию смены или работе.");
  }

  if (!file.clientFileId || !file.localPath || !file.sha256 || !file.sizeBytes) {
    throw new Error("Локальные данные файла неполные.");
  }

  if (file.contentType !== "image/jpeg" && file.contentType !== "video/mp4") {
    throw new Error("Можно отправлять только фото JPEG и видео MP4.");
  }

  const maxSize = file.contentType === "video/mp4" || file.mediaKind === "video" ? maxVideoBytes : maxPhotoBytes;
  if (file.sizeBytes <= 0 || file.sizeBytes > maxSize) {
    if (file.mediaKind !== "video" && file.contentType !== "video/mp4") {
      throw new Error("Фото слишком большое. Максимум 6 МБ.");
    }
    throw new Error(file.mediaKind === "video" ? "Видео слишком большое. Максимум 25 МБ." : "Фото слишком большое. Максимум 8 МБ.");
  }

  const fileInfo = await FileSystem.getInfoAsync(file.localPath);
  if (!fileInfo.exists) {
    throw new Error("Файл не найден на телефоне. Добавьте вложение повторно.");
  }
}

async function uploadFileWithFailover(
  preferredApiBaseUrl: string,
  syncProtocolVersion: string,
  file: LocalMobileFile,
  token: string | null
) {
  const apiBaseUrls = await getServerCandidateBaseUrls(preferredApiBaseUrl);
  let lastError: unknown = null;
  let lastResult: Awaited<ReturnType<typeof uploadFileWithToken>> | null = null;

  for (const apiBaseUrl of apiBaseUrls) {
    try {
      const result = await uploadFileWithToken(apiBaseUrl, syncProtocolVersion, file, token);
      if (shouldTryNextMobileServer(result.status, null, Boolean(result.body))
          && apiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResult = result;
        continue;
      }

      await setServerBaseUrl(apiBaseUrl).catch(() => undefined);
      return { apiBaseUrl, result };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResult) {
    return { apiBaseUrl: apiBaseUrls[apiBaseUrls.length - 1], result: lastResult };
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
}

async function uploadFileWithToken(
  apiBaseUrl: string,
  syncProtocolVersion: string,
  file: LocalMobileFile,
  token: string | null
) {
  const contentType = file.contentType ?? "image/jpeg";
  const timeoutMs = file.mediaKind === "video" || contentType === "video/mp4" ? videoUploadTimeoutMs : photoUploadTimeoutMs;
  try {
    return await withTimeout(
      FileSystem.uploadAsync(`${apiBaseUrl}/api/v1/mobile/files`, file.localPath, {
        fieldName: "file",
        headers: {
          Accept: "application/json",
          "X-Mobile-Sync-Protocol": syncProtocolVersion,
          "X-Patrol360-Client": "mobile-app",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        httpMethod: "POST",
        mimeType: contentType,
        parameters: {
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
      }),
      timeoutMs
    );
  } catch {
    throw new Error(serverUnavailableMessage);
  }
}
