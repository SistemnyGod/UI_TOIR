import { expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, MAX_VIDEO_CAPTURE_SECONDS, videoLimitHint, videoTooLargeMessage } from '@/domain/files/fileUploadLimits';

it('states the enforced video limits in the user-facing text', () => {
  expect(MAX_VIDEO_BYTES).toBe(30 * 1024 * 1024);
  expect(MAX_VIDEO_CAPTURE_SECONDS).toBe(12);
  expect(videoLimitHint).toBe('Запись с камеры останавливается через 12 секунд. Видео из галереи — не больше 30 МБ.');
  expect(videoTooLargeMessage).toContain('больше 30 МБ');
  expect(videoTooLargeMessage).toContain('до 12 секунд');
});
