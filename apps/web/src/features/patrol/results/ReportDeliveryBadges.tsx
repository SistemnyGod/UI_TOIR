import { Clock3, Send, UploadCloud } from "lucide-react";
import type { PatrolResult } from "../../../types";

/** How the patrol report reached the server: auto-sent, late, photos still uploading. */
export function ReportDeliveryBadges({ results }: { results: PatrolResult[] }) {
  const autoSent = results.some(result => result.submissionMode === "auto");
  const late = results.some(result => result.lateReport);
  const pendingPhotos = results.reduce((total, result) => total + (result.pendingPhotos ?? 0), 0);
  if (!autoSent && !late && pendingPhotos === 0) return null;
  return <>
    {autoSent ? <span title="Сотрудник не нажал «Отправить», телефон отправил готовый отчёт сам"><Send size={18} />Отправлен <strong>автоматически</strong></span> : null}
    {late ? <span title="Отчёт пришёл после закрытия обхода и принят диспетчером"><Clock3 size={18} />Поздний <strong>отчёт</strong></span> : null}
    {pendingPhotos > 0 ? <span title="Фото указаны в отчёте, телефон ещё загружает их"><UploadCloud size={18} />Фото догружаются <strong>{pendingPhotos}</strong></span> : null}
  </>;
}
