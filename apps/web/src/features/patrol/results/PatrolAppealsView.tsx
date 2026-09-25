import { useEffect, useState } from "react";
import { ApiClient } from "../../../api/client";
import type { DataSourceMode } from "../../../types";

type Appeal = { id: string; assignmentId: string; routeName: string; employeeName: string; deviceId: string; kind: string; message: string; status: string; reply: string; createdAt: string; version: number; assignmentVersion: number };
const client = new ApiClient();
const labels: Record<string, string> = { open: "Открыто", closed: "Закрыто", approved: "Отмена одобрена", rejected: "Отмена отклонена", obsolete: "Неактуально", needsDispatcherDecision: "Нужно решение: отчёт или отмена", reportAccepted: "Отчёт принят", cancellationSaved: "Отмена сохранена" };
export function PatrolAppealsView({ dataSourceMode }: { dataSourceMode: DataSourceMode }) {
  const [items, setItems] = useState<Appeal[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  useEffect(() => {
    if (dataSourceMode !== "api") return;
    const controller = new AbortController();
    setBusy(true); setError("");
    void client.get<Appeal[]>(`/api/v1/patrol-appeals?page=${page}&pageSize=25&status=${status}`, { signal: controller.signal }).then(setItems)
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить обращения"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [dataSourceMode, page, status, reload]);
  async function resolve(item: Appeal, decision: string) {
    setBusy(true); setError("");
    try {
      await client.post(`/api/v1/patrol-appeals/${item.id}/resolve`, { decision, reply: reply[item.id] ?? "", expectedVersion: item.version, expectedAssignmentVersion: item.assignmentVersion });
      setReload(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить решение. Обновите список."); setBusy(false); }
  }
  if (dataSourceMode !== "api") return <p>Обращения сотрудников доступны при подключении к серверу.</p>;
  return <section aria-label="Обращения диспетчеру">
    <div className="toolbar"><label>Состояние <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} disabled={busy}>
      <option value="">Все обращения</option><option value="open">Открытые</option><option value="needsDispatcherDecision">Нужно решение</option><option value="approved">Отмена одобрена</option><option value="rejected">Отмена отклонена</option>
    </select></label><button type="button" className="button" onClick={() => setReload(n => n + 1)} disabled={busy}>Обновить</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Сохранение или загрузка…</p> : null}
    {!busy && !items.length ? <p>Обращений нет.</p> : null}
    {items.map(item => <article key={item.id} className="panel" style={{ padding: 20, marginBlock: 12 }}>
      <h3>{item.kind === "cancel" ? "Запрос отмены" : "Сообщение"} · {item.routeName}</h3>
      <p>{item.employeeName} · Устройство: {item.deviceId} · {new Date(item.createdAt).toLocaleString("ru-RU")}</p>
      <p><strong>{labels[item.status] ?? item.status}</strong></p><p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
      {item.reply ? <p>Ответ: {item.reply}</p> : null}
      {item.status === "open" ? <div>
        <label>Ответ сотруднику<textarea aria-label={`Ответ по обращению ${item.routeName}`} value={reply[item.id] ?? ""} onChange={e => setReply(values => ({ ...values, [item.id]: e.target.value }))} maxLength={2000} disabled={busy} rows={3} style={{ display: "block", width: "100%" }} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="button primary" disabled={busy || !reply[item.id]?.trim()} onClick={() => void resolve(item, "reply")}>Ответить</button>
          {item.kind === "cancel" ? <><button className="button" disabled={busy} onClick={() => void resolve(item, "approve")}>Одобрить отмену</button><button className="button" disabled={busy} onClick={() => void resolve(item, "reject")}>Отклонить отмену</button></> : null}
          <button className="button" disabled={busy} onClick={() => void resolve(item, "close")}>Закрыть обращение</button>
        </div>
      </div> : null}
      {item.status === "needsDispatcherDecision" ? <div>
        <p>Проверьте состояние обхода. Уже принятый отчёт нельзя отменить задним числом; закрытие такого запроса отметит его неактуальным.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="button" disabled={busy} onClick={() => void resolve(item, "close")}>Закрыть неактуальный запрос</button>
        </div>
      </div> : null}
    </article>)}
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="button" disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>Назад</button><span>Страница {page}</span><button className="button" disabled={busy || items.length < 25} onClick={() => setPage(p => p + 1)}>Далее</button></div>
  </section>;
}
