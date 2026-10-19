export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
// Must match MaxMobileVideoBytes on the server (EfMobileAppService).
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
/** Recording from the camera stops on its own after this many seconds. */
export const MAX_VIDEO_CAPTURE_SECONDS = 12;

const megabytes = (bytes: number) => Math.floor(bytes / (1024 * 1024));

/** Shown before the employee records or picks a video. */
export const videoLimitHint =
  `Запись с камеры останавливается через ${MAX_VIDEO_CAPTURE_SECONDS} секунд. Видео из галереи — не больше ${megabytes(MAX_VIDEO_BYTES)} МБ.`;

/** Shown when a picked video is larger than the server accepts. */
export const videoTooLargeMessage =
  `Видео больше ${megabytes(MAX_VIDEO_BYTES)} МБ, сервер его не примет. Выберите видео короче или снимите новое (до ${MAX_VIDEO_CAPTURE_SECONDS} секунд).`;
