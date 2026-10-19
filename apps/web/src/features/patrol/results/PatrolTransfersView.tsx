import { useEffect, useState } from "react";
import { ApiClient } from "../../../api/client";
import type { PatrolAssignmentTransferDto } from "../../../api/contracts";
import type { DataSourceMode } from "../../../types";

const client = new ApiClient();

const modeLabels: Record<string, string> = {
  sameDevice: "На том же телефоне",
  otherDevice: "На другой телефон",
};

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

/** Handovers of unfinished patrols between employees of a shift, newest first. */
export function PatrolTransfersView({ dataSourceMode }: { dataSourceMode: DataSourceMode }) {
  const [transfers, setTransfers] = useState<PatrolAssignmentTransferDto[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (dataSourceMode !== "api") return;
    const controller = new AbortController();
    setBusy(true); setError("");
    void client.get<PatrolAssignmentTransferDto[]>("/api/v1/patrol-transfers?limit=100", { signal: controller.signal })
      .then(setTransfers)
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить передачи обходов"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [dataSourceMode, reload]);

  if (dataSourceMode !== "api") return <p>История передач доступна при подключении к серверу.</p>;

  return <section aria-label="Передачи обходов между сотрудниками">
    <div className="toolbar">
      <p>Незаконченные обходы, переданные сотрудником коллеге по смене. Заполненные точки остаются за первым исполнителем.</p>
      <button type="button" className="button" onClick={() => setReload(n => n + 1)} disabled={busy}>Обновить</button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Загрузка…</p> : null}
    {!busy && !error && !transfers.length ? <p>Передач обходов пока не было.</p> : null}
    {transfers.length ? <div style={{ overflowX: "auto" }}><table>
      <thead><tr><th>Когда</th><th>Заявка и маршрут</th><th>Кто передал</th><th>Кому</th><th>Как</th><th>Выполнено точек</th><th>Причина</th><th>Сейчас</th></tr></thead>
      <tbody>{transfers.map(transfer => <tr key={transfer.id}>
        <td>{formatDateTime(transfer.transferredAtLocal)}<br /><small>получено: {formatDateTime(transfer.receivedAt)}</small></td>
        <td><strong>{transfer.requestNumber || "—"}</strong><br /><small>{transfer.routeName || "—"}</small></td>
        <td>{transfer.fromEmployeeName}<br /><small>аккаунт: {transfer.accountLogin || "—"}</small></td>
        <td>{transfer.toEmployeeName}</td>
        <td>{modeLabels[transfer.mode] ?? transfer.mode}<br /><small>{transfer.statusBefore} → {transfer.statusAfter}</small></td>
        <td>{transfer.carriedPointCount}</td>
        <td>{transfer.reason || "—"}</td>
        <td>{transfer.currentAssignmentStatus || "—"}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </section>;
}
