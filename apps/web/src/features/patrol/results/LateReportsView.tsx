import { useEffect, useState } from "react";
import { ApiClient } from "../../../api/client";
import type { MobileDeviceHealthDto, PatrolLateReportDto } from "../../../api/contracts";
import type { DataSourceMode } from "../../../types";

const client = new ApiClient();
const reasonLabels: Record<string, string> = {
  assignmentClosed: "Обход уже был закрыт",
  assignmentCancelled: "Обход отменён диспетчером",
  assignmentNeedsDecision: "Обход ждал решения диспетчера",
};
const statusLabels: Record<string, string> = { pending: "Ждёт решения", applied: "Принят", dismissed: "Отклонён" };
const STUCK_QUEUE_SECONDS = 30 * 60;

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

export function formatAge(seconds?: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} ч ${minutes % 60} мин` : `${Math.floor(hours / 24)} дн`;
}

/** Late reports waiting for a dispatcher, plus the phones' unsent-queue pulse. */
export function LateReportsView({ dataSourceMode }: { dataSourceMode: DataSourceMode }) {
  const [reports, setReports] = useState<PatrolLateReportDto[]>([]);
  const [devices, setDevices] = useState<MobileDeviceHealthDto[]>([]);
  const [status, setStatus] = useState("pending");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState<Record<string, string>>({});

  useEffect(() => {
    if (dataSourceMode !== "api") return;
    const controller = new AbortController();
    setBusy(true); setError("");
    void Promise.all([
      client.get<PatrolLateReportDto[]>(`/api/v1/patrol-late-reports?status=${status}&limit=100`, { signal: controller.signal }),
      client.get<MobileDeviceHealthDto[]>("/api/v1/mobile-sync/device-health", { signal: controller.signal }).catch(() => [] as MobileDeviceHealthDto[]),
    ]).then(([lateReports, deviceHealth]) => { setReports(lateReports); setDevices(deviceHealth); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить поздние отчёты"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [dataSourceMode, status, reload]);

  async function resolve(report: PatrolLateReportDto, decision: "apply" | "dismiss") {
    setBusy(true); setError("");
    try {
      await client.post(`/api/v1/patrol-late-reports/${report.id}/resolution`, { decision, comment: comment[report.id] ?? "" });
      setReload(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить решение. Обновите список."); setBusy(false); }
  }

  if (dataSourceMode !== "api") return <p>Поздние отчёты доступны при подключении к серверу.</p>;
  const phonesWithQueue = devices
    .filter(device => (device.heartbeatPendingCount ?? 0) > 0)
    .sort((a, b) => (b.heartbeatOldestPendingAgeSeconds ?? 0) - (a.heartbeatOldestPendingAgeSeconds ?? 0));

  return <section aria-label="Поздние отчёты и неотправленные данные">
    <div className="toolbar"><label>Состояние <select value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>
      <option value="pending">Ждут решения</option><option value="applied">Принятые</option><option value="dismissed">Отклонённые</option><option value="">Все</option>
    </select></label><button type="button" className="button" onClick={() => setReload(n => n + 1)} disabled={busy}>Обновить</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Сохранение или загрузка…</p> : null}

    <h3>Отчёты, пришедшие после закрытия обхода</h3>
    {!busy && !reports.length ? <p>Поздних отчётов нет.</p> : null}
    {reports.map(report => <article key={report.id} className="panel" style={{ padding: 20, marginBlock: 12 }}>
      <h4>{report.routeName} · {report.employeeName}</h4>
      <p>{reasonLabels[report.reasonCode] ?? report.reasonCode} · сейчас: {report.currentAssignmentStatus || "—"} · <strong>{statusLabels[report.status] ?? report.status}</strong></p>
      <p>Завершён на телефоне: {formatDateTime(report.completedAtLocal)} · получен: {formatDateTime(report.receivedAt)}{report.submissionMode === "auto" ? " · отправлен автоматически" : ""}</p>
      <p>Точек: {report.pointCount} · с замечаниями или пропуском: {report.issueCount} · фото: {report.photoCount}{report.pendingPhotoCount ? ` (ещё не загружено: ${report.pendingPhotoCount})` : ""} · аккаунт: {report.accountLogin}</p>
      {report.resolutionComment ? <p>Комментарий: {report.resolutionComment}</p> : null}
      {report.resolvedAt ? <p>Решение: {report.resolvedBy ?? "—"}, {formatDateTime(report.resolvedAt)}</p> : null}
      {report.status === "pending" ? <div>
        <label>Комментарий<textarea aria-label={`Комментарий к позднему отчёту ${report.routeName}`} value={comment[report.id] ?? ""} onChange={e => setComment(values => ({ ...values, [report.id]: e.target.value }))} maxLength={2000} disabled={busy} rows={2} style={{ display: "block", width: "100%" }} /></label>
        {!report.canApply ? <p>По обходу уже есть принятый отчёт: поздний отчёт можно только отклонить.</p> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="button primary" disabled={busy || !report.canApply} onClick={() => void resolve(report, "apply")}>Принять отчёт и закрыть обход</button>
          <button className="button" disabled={busy} onClick={() => void resolve(report, "dismiss")}>Отклонить</button>
        </div>
      </div> : null}
    </article>)}

    <h3>Телефоны с неотправленными данными</h3>
    {!busy && !phonesWithQueue.length ? <p>Телефоны не сообщали о неотправленных командах.</p> : null}
    {phonesWithQueue.length ? <div style={{ overflowX: "auto" }}><table>
      <thead><tr><th>Аккаунт</th><th>Устройство</th><th>Не отправлено</th><th>Самой старой</th><th>С ошибкой</th><th>Последний сигнал</th></tr></thead>
      <tbody>{phonesWithQueue.map(device => <tr key={device.mobileAccountId}>
        <td>{device.login}</td><td>{device.deviceName ?? device.deviceId ?? "—"}{device.appVersion ? ` · ${device.appVersion}` : ""}</td>
        <td>{device.heartbeatPendingCount}</td>
        <td><strong style={{ color: (device.heartbeatOldestPendingAgeSeconds ?? 0) > STUCK_QUEUE_SECONDS ? "var(--danger, #b42318)" : undefined }}>{formatAge(device.heartbeatOldestPendingAgeSeconds)}</strong></td>
        <td>{device.heartbeatFailedCount ?? "—"}</td><td>{formatDateTime(device.heartbeatAt)}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </section>;
}
