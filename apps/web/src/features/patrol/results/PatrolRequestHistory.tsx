import { useMemo, useState } from "react";
import { Button, Chip, CompactTable, Panel, type CompactTableColumn } from "../../../shared/ui";
import { cancellationReasonLabel } from "../../../domain/patrolCancellation";
import type { DataSourceStatus, ServiceRequest } from "../../../types";

export function PatrolRequestHistory({
  errorMessage,
  onOpenRequest,
  onOpenResult,
  onRetry,
  requests,
  status,
}: {
  errorMessage?: string;
  onOpenRequest?: (requestId: string) => void;
  onOpenResult?: (resultId: string) => void;
  onRetry?: () => Promise<void> | void;
  requests: ServiceRequest[];
  status: DataSourceStatus;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests.filter((request) => {
      const cancelled = isCancelledRequest(request);
      const completed = isCompletedRequest(request);
      const matchesStatus =
        statusFilter === "all"
        || (statusFilter === "cancelled" && cancelled)
        || (statusFilter === "completed" && completed)
        || request.status === statusFilter;
      const matchesQuery = !normalizedQuery || [request.title, request.employee, request.route, request.description].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, requests, statusFilter]);

  const columns: CompactTableColumn<ServiceRequest>[] = [
    { key: "request", header: "Заявка", render: (request) => <div className="patrol-request-history-primary"><strong>{request.title}</strong><small>{formatDate(request.createdAt)}</small></div> },
    { key: "route", header: "Маршрут", render: (request) => <div><strong>{request.route || "—"}</strong><small>{request.employee || "Сотрудник не указан"}</small></div> },
    { key: "plan", header: "План", render: (request) => <span>{request.scheduledDate} {request.scheduledTime}</span> },
    { key: "status", header: "Статус", render: (request) => <div><Chip>{request.status}</Chip>{isCancelledRequest(request) ? <small>{cancellationReasonLabel(request.cancellationReasonCode, request.cancellationReasonText)}</small> : null}</div> },
    { key: "finished", header: "Завершение", render: (request) => <span>{isCancelledRequest(request) && request.cancelledAt ? `Отменена: ${formatDate(request.cancelledAt)}` : isCompletedRequest(request) ? "Выполнена" : "—"}</span> },
    { key: "actions", header: "Действия", render: (request) => { const resultId = request.resultId || request.sourceResultId; return <div className="patrol-request-history-actions"><Button onClick={() => onOpenRequest?.(request.id)} size="sm" variant="ghost">Открыть заявку</Button>{isCompletedRequest(request) && resultId ? <Button onClick={() => onOpenResult?.(resultId)} size="sm" variant="primary">Результат</Button> : null}</div>; } },
  ];

  return (
    <Panel className="patrol-request-history-panel">
      <div className="patrol-request-history-head">
        <div><h2>История заявок</h2><p>Выполненные заявки открываются в результатах, отменённые сохраняют причину и автора.</p></div>
        <strong>{filteredRequests.length}</strong>
      </div>
      <div className="patrol-request-history-toolbar">
        <input aria-label="Поиск заявок" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Номер, сотрудник или маршрут" value={query} />
        <select aria-label="Статус заявки" onChange={(event) => setStatusFilter(event.currentTarget.value)} value={statusFilter}>
          <option value="all">Все статусы</option>
          <option value="Новая">Новая</option><option value="Назначена">Назначена</option><option value="В работе">В работе</option><option value="completed">Выполнена</option><option value="cancelled">Отменена</option>
        </select>
      </div>
      {status === "loading" ? <div className="patrol-request-history-empty">Заявки загружаются…</div> : status === "error" ? <div className="patrol-request-history-empty"><strong>Не удалось загрузить историю заявок</strong><span>{errorMessage}</span>{onRetry ? <Button onClick={() => void onRetry()} variant="ghost">Повторить</Button> : null}</div> : filteredRequests.length ? <CompactTable columns={columns} getRowKey={(request) => request.id} rows={filteredRequests} /> : <div className="patrol-request-history-empty"><strong>Заявок пока нет</strong><span>Созданные, выполненные и отменённые заявки появятся здесь.</span></div>}
    </Panel>
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function isCancelledRequest(request: ServiceRequest) {
  return request.isCancelled === true || String(request.status).toLowerCase().includes("отмен");
}

function isCompletedRequest(request: ServiceRequest) {
  return !isCancelledRequest(request) && String(request.status).toLowerCase().includes("закры");
}
