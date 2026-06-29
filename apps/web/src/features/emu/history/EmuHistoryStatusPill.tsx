import { normalizeEmuText } from "../../../domain/emuWorkBoard";

export function EmuHistoryStatusPill({ value }: { value: string }) {
  const normalized = normalizeEmuText(value);
  const className = normalized === "Завершено" || normalized === "Выполнено"
    ? "ok"
    : normalized === "В работе" || normalized === "Работает"
      ? "work"
      : normalized === "На паузе" || normalized === "В ожидании"
        ? "pause"
        : normalized === "Удалено" || normalized === "Не выполнено" || normalized === "Отменено" || normalized === "Проблемный"
          ? "danger"
          : "neutral";
  return <span className={`emu-history-status ${className}`}>{normalized === "В ожидании" ? "На паузе" : normalized}</span>;
}
