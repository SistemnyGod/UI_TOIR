export function pointSubmissionError(status: "ok" | "issue" | "skipped" | null, comment: string, _requiresPhoto: boolean, _hasPhoto: boolean): string | null {
  if (!status) return "Выберите результат осмотра.";
  if ((status === "issue" || status === "skipped") && !comment.trim()) return "Заполните результат осмотра.";
  return null;
}
