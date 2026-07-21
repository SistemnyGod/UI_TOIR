const retryableServerStatuses = new Set([404, 405, 501, 502, 503, 504]);

export function shouldTryNextMobileServer(status: number, contentType: string | null, hasBody = true) {
  const unexpectedOkResponse = status >= 200
    && status < 300
    && status !== 204
    && hasBody
    && !(contentType ?? "").includes("application/json");

  return unexpectedOkResponse || retryableServerStatuses.has(status);
}
