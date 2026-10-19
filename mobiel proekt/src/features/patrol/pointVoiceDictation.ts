/** Rules and Russian texts for dictating the point description. No native calls here. */

export const dictationLocale = "ru-RU";

export const dictationHints = {
  listening: "Говорите. Текст добавится в конец описания.",
  unavailable: "Голосовой ввод недоступен: на телефоне нет службы распознавания речи. Введите текст с клавиатуры.",
  permissionDenied: "Нет доступа к микрофону. Разрешите его, чтобы диктовать описание.",
  permissionBlocked: "Доступ к микрофону запрещён. Включите его в настройках телефона: Приложения → Patrol360 → Разрешения.",
  offline: "Без интернета диктовка работает только с офлайн-пакетом русского языка. Установите его в настройках голосового ввода Google или введите текст с клавиатуры.",
  noSpeech: "Речь не распознана. Нажмите на микрофон и повторите.",
  busy: "Распознавание речи занято. Повторите через несколько секунд.",
  microphone: "Не удалось включить микрофон. Повторите попытку.",
  failed: "Не удалось распознать речь. Введите текст с клавиатуры.",
} as const;

/** Appends dictated words to the description, separated by one space. */
export function appendDictatedText(current: string, addition: string) {
  const text = addition.trim();
  if (!text) return current;
  if (!current.trim()) return text;
  return /\s$/.test(current) ? `${current}${text}` : `${current} ${text}`;
}

/** Maps a recognizer error code (Web Speech API names) to a hint; `null` means stay silent. */
export function dictationErrorHint(code: string) {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return dictationHints.permissionDenied;
    case "service-not-allowed":
      return dictationHints.unavailable;
    case "network":
    case "language-not-supported":
      return dictationHints.offline;
    case "no-speech":
    case "speech-timeout":
      return dictationHints.noSpeech;
    case "busy":
      return dictationHints.busy;
    case "audio-capture":
      return dictationHints.microphone;
    default:
      return dictationHints.failed;
  }
}

/** On-device locales come back as "ru-RU", "ru_RU" or "ru". */
export function hasRussianLocale(locales: readonly string[]) {
  return locales.some(locale => /^ru(?:[-_]|$)/i.test(locale));
}
