import { z } from "zod";

import { MobileHttpError, mobileRequest } from "@/api/httpClient";
import { getMobileRuntimeConfig } from "@/core/serverSettings";
import { normalizeSha256, type AppUpdateManifest } from "@/domain/appUpdate/appUpdatePolicy";

const appUpdateManifestSchema = z.object({
  versionName: z.string().min(1).max(40),
  versionCode: z.number().int().positive(),
  minimumVersionCode: z.number().int().min(0),
  apkSizeBytes: z.number().int().positive(),
  sha256: z.string().refine((value) => normalizeSha256(value) !== null, { message: "Expected a SHA-256 hex digest" }),
  releaseNotes: z.string().max(2000).default(""),
  downloadUrl: z.string().min(1),
  publishedAt: z.string().nullable().optional()
});

export type AppUpdateManifestResponse = {
  manifest: AppUpdateManifest | null;
  /** Server address that answered, used to resolve the relative APK URL. */
  apiBaseUrl: string;
};

/**
 * Reads the build published on the Patrol360 server. Anonymous on purpose:
 * an outdated phone or one with an expired session must still update.
 * A server without a published release (or an older server without the
 * endpoint) answers 404, which means "nothing to install".
 */
export async function fetchAppUpdateManifest(): Promise<AppUpdateManifestResponse> {
  const { contourId } = await getMobileRuntimeConfig();
  try {
    const response = await mobileRequest(
      `/api/v1/mobile/app-update?contourId=${encodeURIComponent(contourId)}`,
      appUpdateManifestSchema,
      { accessToken: null, skipAuthRefresh: true }
    );
    // A successful request persists the address that answered.
    const { apiBaseUrl } = await getMobileRuntimeConfig();
    return {
      apiBaseUrl,
      manifest: {
        ...response,
        sha256: normalizeSha256(response.sha256)!,
        minimumVersionCode: Math.min(response.minimumVersionCode, response.versionCode),
        publishedAt: response.publishedAt ?? null
      }
    };
  } catch (error) {
    if (error instanceof MobileHttpError && error.status === 404) {
      const { apiBaseUrl } = await getMobileRuntimeConfig();
      return { apiBaseUrl, manifest: null };
    }
    throw error;
  }
}
