/** Text of the countdown shown while a finished report waits for manual sending. */
export function autoSubmitCountdownMessage(remainingMs: number) {
  if (remainingMs <= 0) {
    return "Все точки заполнены. Отчёт отправляется автоматически.";
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Все точки заполнены. Если не отправить вручную, отчёт отправится сам через ${minutes}:${String(seconds).padStart(2, "0")}. Любое изменение точки запускает отсчёт заново.`;
}
