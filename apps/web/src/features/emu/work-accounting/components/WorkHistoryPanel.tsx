import { useEffect, useMemo, useState } from "react";
import type { EmuAuditEventDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { Button, PaginationBar } from "../../../../shared/ui";
import { auditEventLabel } from "../../history/emuHistoryUtils";
import { formatDateTime } from "../workAccountingUtils";

export function WorkHistoryPanel({ workId, workspace }: { workId: string; workspace: EmuWorkspace }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ rows: EmuAuditEventDto[]; total: number }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(workspace.sourceMode === "api");
  const localEvents = useMemo(() => workspace.auditEvents.filter(event => event.workSessionId === workId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [workspace.auditEvents, workId]);
  const queryAudit = workspace.actions.getWorkSessionAudit;
  useEffect(() => {
    if (workspace.sourceMode !== "api") return;
    let active = true;
    setLoading(true);
    setError("");
    setResult(undefined);
    queryAudit(workId, { page, pageSize: 50 }).then(value => {
      if (active) setResult(value);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить историю работы.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, queryAudit, retry, workId, workspace.sourceMode]);
  const events = workspace.sourceMode === "api" ? result?.rows ?? [] : localEvents.slice((page - 1) * 50, page * 50);
  const total = workspace.sourceMode === "api" ? result?.total ?? 0 : localEvents.length;
  return <div className="emu-work-event-list" aria-busy={loading}>
    {loading ? <p role="status">Загружаем историю работы…</p> : null}
    {error ? <div className="emu-work-form-error" role="alert"><p>{error}</p><Button onClick={() => setRetry(value => value + 1)} variant="secondary">Повторить загрузку</Button></div> : null}
    {!loading && !error && events.length === 0 ? <p className="emu-work-detail-empty">В журнале нет событий этой карточки.</p> : null}
    {events.map(event => <article key={event.id}>
      <header><strong>{auditEventLabel(event.eventType)}</strong><time>{formatDateTime(event.createdAt)}</time></header>
      <small>{event.actor || "Автор не указан"}</small>
      {event.comment ? <p>{event.comment}</p> : null}
      {event.fromStatus !== event.toStatus && (event.fromStatus || event.toStatus) ? <span>{event.fromStatus || "—"} → {event.toStatus || "—"}</span> : null}
    </article>)}
    {!loading && !error && total > 50 ? <PaginationBar page={page} pageSize={50} pageSizeOptions={[50]} total={total} onPageChange={setPage} onPageSizeChange={() => setPage(1)} /> : null}
  </div>;
}
