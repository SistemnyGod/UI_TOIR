import * as FileSystem from "expo-file-system/legacy";

import { refreshStoredAccessToken } from "@/api/httpClient";
import { photoUploadTimeoutMs, serverUnavailableMessage, withTimeout } from "@/api/networkTimeout";
import { getAccessToken } from "@/auth/tokenStorage";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls, setServerBaseUrl } from "@/core/serverSettings";
import { LocalMobileFile, MobileFileUploadResponse } from "@/domain/files/fileTypes";

export async function uploadPatrolPhoto(file: LocalMobileFile) {
  const hasPatrolPointScope = Boolean(file.assignmentId && file.pointId);
  const hasRemarkScope = Boolean(file.remarkId);
  if ((!hasPatrolPointScope && !hasRemarkScope) || !file.sha256 || !file.sizeBytes) {
    throw new Error("Локальные данные файла неполные.");
  }

  const token = await getAccessToken();
  const runtimeConfig = await getMobileRuntimeConfig();
  let { apiBaseUrl, result } = await uploadPhotoWithFailover(runtimeConfig.apiBaseUrl, runtimeConfig.syncProtocolVersion, file, token);

  if (result.status === 401 && token) {
    const refreshedToken = await refreshStoredAccessToken();
    ({ result } = await uploadPhotoWithFailover(apiBaseUrl, runtimeConfig.syncProtocolVersion, file, refreshedToken));
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Не удалось загрузить файл: ${result.status}`);
  }

  return JSON.parse(result.body) as MobileFileUploadResponse;
}

async function uploadPhotoWithFailover(
  preferredApiBaseUrl: string,
  syncProtocolVersion: string,
  file: LocalMobileFile,
  token: string | null
) {
  const apiBaseUrls = await getServerCandidateBaseUrls(preferredApiBaseUrl);
  let lastError: unknown = null;

  for (const apiBaseUrl of apiBaseUrls) {
    try {
      const result = await uploadPhotoWithToken(apiBaseUrl, syncProtocolVersion, file, token);
      await setServerBaseUrl(apiBaseUrl).catch(() => undefined);
      return { apiBaseUrl, result };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
}

async function uploadPhotoWithToken(
  apiBaseUrl: string,
  syncProtocolVersion: string,
  file: LocalMobileFile,
  token: string | null
) {
  const contentType = file.contentType ?? "image/jpeg";
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
          sha256: file.sha256 ?? "",
          sizeBytes: String(file.sizeBytes ?? 0)
        },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART
      }),
      photoUploadTimeoutMs
    );
  } catch {
    throw new Error(serverUnavailableMessage);
  }
}
