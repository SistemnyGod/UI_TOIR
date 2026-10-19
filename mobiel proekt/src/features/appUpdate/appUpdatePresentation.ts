import { formatMegabytes } from "@/domain/appUpdate/appUpdatePolicy";
import type { AppUpdateDownloadState } from "@/services/appUpdate/appUpdateController";

export type AppUpdateDownloadView = {
  /** Status line under the update text; null when nothing happens yet. */
  text: string | null;
  tone: "neutral" | "warning" | "danger";
  /** 0..1 for a progress bar, null when there is no measurable progress. */
  progress: number | null;
  busy: boolean;
  canCancel: boolean;
  startLabel: string | null;
  /** The installer returned: Android may need «Установка из этого источника». */
  showInstallPermission: boolean;
};

export function describeAppUpdateDownload(download: AppUpdateDownloadState): AppUpdateDownloadView {
  switch (download.status) {
    case "idle":
      return view({ startLabel: "Обновить" });
    case "preparing":
      return view({ text: "Подготовка загрузки…", busy: true });
    case "downloading": {
      const progress = ratio(download.bytesWritten, download.totalBytes);
      return view({
        text: `Загрузка: ${formatMegabytes(download.bytesWritten)} из ${formatMegabytes(download.totalBytes)} (${percent(progress)})`,
        progress,
        busy: true,
        canCancel: true
      });
    }
    case "verifying": {
      const progress = ratio(download.processedBytes, download.totalBytes);
      return view({ text: `Проверка файла (SHA-256): ${percent(progress)}`, progress, busy: true, canCancel: true });
    }
    case "installing":
      return view({ text: "Открываем установщик Android…", busy: true });
    case "installerClosed":
      return view({
        text: "Установка не завершена. Если Android попросил разрешить установку из этого источника, включите разрешение для Patrol360 и нажмите «Установить».",
        tone: "warning",
        startLabel: "Установить",
        showInstallPermission: true
      });
    case "cancelled":
      return view({ text: "Загрузка отменена. Файл удалён.", startLabel: "Обновить" });
    case "failed":
      return view({ text: download.message, tone: "danger", startLabel: "Повторить" });
  }
}

function view(partial: Partial<AppUpdateDownloadView>): AppUpdateDownloadView {
  return {
    text: null,
    tone: "neutral",
    progress: null,
    busy: false,
    canCancel: false,
    startLabel: null,
    showInstallPermission: false,
    ...partial
  };
}

function ratio(done: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
}

function percent(value: number) {
  return `${Math.floor(value * 100)}%`;
}

export function appUpdateTitle(versionName: string) {
  return `Доступна новая версия ${versionName}`;
}

export function shortSha256(sha256: string) {
  return `${sha256.slice(0, 12)}…${sha256.slice(-12)}`;
}

export function unsentDataSummary(count: number | null) {
  if (count === null) return "Не удалось посчитать неотправленные записи. Данные на телефоне сохранены.";
  if (count === 0) return "Все записи отправлены на сервер.";
  return `Неотправленных записей: ${count}. Их можно отправить сейчас — сервер принимает очередь и от старой версии.`;
}

export function describeQueueDeliveryResult(result: {
  sent: number;
  skipped: "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | "failed" | null;
}) {
  switch (result.skipped) {
    case "offline":
      return "Нет подключения. Данные сохранены на телефоне и будут отправлены, когда появится сеть.";
    case "serverUnavailable":
      return "Сервер временно недоступен. Данные сохранены на телефоне.";
    case "unauthenticated":
      return "Нужен повторный вход. Данные сохранены и будут отправлены после обновления и входа.";
    case "wrongContour":
      return "Телефон подключён к серверу другого контура. Данные сохранены на телефоне.";
    case "failed":
      return "Отправка прервалась. Данные не потеряны — повторите позже.";
    default:
      return result.sent > 0 ? `Отправлено записей: ${result.sent}.` : "Новых записей для отправки нет.";
  }
}
