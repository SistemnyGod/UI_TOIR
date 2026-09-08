import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "./assignments/AssignmentIcons";
import type { AssignmentIconComponent } from "./assignments/AssignmentIcons";
import { shouldCreateAssignmentAfterRequest } from "./assignments/assignmentUtils";
import { formatAssignmentActionTime, toDateTimeInput } from "./assignments/assignmentDateUtils";
import { Button, ModalShell } from "../../shared/ui";
import type { ActivePatrol, CancelAssignmentPayload, CompleteAssignmentPayload, PatrolCompletionPhotoPayload, RoutePoint, RouteDirectoryItem } from "../../types";

export interface LocalDraft {
  id: string;
  title: string;
  employeeId: string;
  employeeName: string;
  routeId: string;
  routeName: string;
  plannedDate: string;
  plannedStart: string;
  priority: "high" | "medium" | "low";
  comment: string;
  requestId?: string;
  changedAt: string;
}

export const ASSIGNMENT_DRAFTS_STORAGE_KEY = "patrol360.assignment-drafts.v1";
export interface PointCompletionDraft {
  routePointId: string;
  status: string;
  comment: string;
  issueType: string;
  severity: string;
  photos: number;
  photoAttachments: PatrolCompletionPhotoPayload[];
}


export function CompleteAssignmentModal({
  assignment,
  errors,
  onClose,
  onSubmit,
  route,
  saving,
}: {
  assignment: ActivePatrol;
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CompleteAssignmentPayload) => void | Promise<void>;
  route?: RouteDirectoryItem;
  saving?: boolean;
}) {
  const completionRoutePoints = getCompletionRoutePoints(route);
  const [actualAt, setActualAt] = useState(() => toDateTimeInput(new Date()));
  const [status, setStatus] = useState<CompleteAssignmentPayload["status"]>("Подтверждено");
  const [routePointId, setRoutePointId] = useState(() => completionRoutePoints[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState<CompleteAssignmentPayload["severity"]>("Средняя");
  const [photos, setPhotos] = useState(0);
  const [pointResults, setPointResults] = useState<PointCompletionDraft[]>(() =>
    completionRoutePoints.map((point) => ({
      routePointId: point.id,
      status: "Подтверждено",
      comment: "",
      issueType: "",
      severity: "Средняя",
      photos: 0,
      photoAttachments: [],
    })),
  );
  const formError =
    errors.form ||
    errors.result ||
    errors.assignmentId ||
    errors.routeVersion ||
    errors.routeVersionNo ||
    errors.routePointId;

  const submit = async () => {
    const date = new Date(actualAt);
    void onSubmit({
      actualAt: Number.isNaN(date.getTime()) ? undefined : date.toISOString(),
      comment,
      issueType,
      pointResults: pointResults.length ? pointResults.map((point) => ({
        comment: point.comment || comment,
        issueType: point.issueType || (point.status === "Замечание" ? issueType : undefined),
        photoAttachments: point.photoAttachments,
        photos: Math.max(point.photos, point.photoAttachments.length),
        routePointId: point.routePointId,
        severity: point.severity || (point.status === "Замечание" ? severity : "-"),
        status: point.status || status,
      })) : undefined,
      photos,
      routePointId: routePointId || undefined,
      severity,
      status,
    });
  };

  function updatePointResult(routePointId: string, patch: Partial<PointCompletionDraft>) {
    setPointResults((current) => current.map((point) => (point.routePointId === routePointId ? { ...point, ...patch } : point)));
  }

  return (
    <ModalShell
      className="assign-am-complete-modal"
      onClose={onClose}
      subtitle={`${assignment.employee} · ${assignment.route}`}
      title="Завершить обход"
    >
        <div className="assign-am-complete-summary">
          <span>{assignment.status}</span>
          <strong>{assignment.progress}%</strong>
          <small>{formatAssignmentActionTime(assignment)}</small>
        </div>
        {formError ? <p className="field-error assign-am-modal-error">{formError}</p> : null}
        <div className="assign-am-modal-grid">
          <label className="assign-am-field">
            <span>Фактическое время</span>
            <input onChange={(event) => setActualAt(event.currentTarget.value)} type="datetime-local" value={actualAt} />
            {errors.actualAt ? <small className="field-error">{errors.actualAt}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Статус результата</span>
            <select onChange={(event) => setStatus(event.currentTarget.value as CompleteAssignmentPayload["status"])} value={status}>
              <option value="Подтверждено">Подтверждено</option>
              <option value="Замечание">Замечание</option>
              <option value="Просрочено">Просрочено</option>
              <option value="Не подтверждено">Не подтверждено</option>
            </select>
            {errors.status ? <small className="field-error">{errors.status}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Точка маршрута</span>
            <select onChange={(event) => setRoutePointId(event.currentTarget.value)} value={routePointId}>
              {completionRoutePoints.map((point) => (
                <option key={point.id} value={point.id}>{point.name}</option>
              ))}
              {completionRoutePoints.length ? null : <option value="">Первая точка маршрута</option>}
            </select>
          </label>
          <label className="assign-am-field">
            <span>Фото</span>
            <input min={0} onChange={(event) => setPhotos(Number(event.currentTarget.value) || 0)} type="number" value={photos} />
          </label>
          <label className="assign-am-field">
            <span>Тип замечания</span>
            <input onChange={(event) => setIssueType(event.currentTarget.value)} placeholder="Например: повреждение, нарушение SLA" value={issueType} />
            {errors.issueType ? <small className="field-error">{errors.issueType}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Серьезность</span>
            <select onChange={(event) => setSeverity(event.currentTarget.value as CompleteAssignmentPayload["severity"])} value={severity}>
              <option value="-">-</option>
              <option value="Низкая">Низкая</option>
              <option value="Средняя">Средняя</option>
              <option value="Высокая">Высокая</option>
            </select>
          </label>
          <label className="assign-am-field wide">
            <span>Комментарий</span>
            <textarea onChange={(event) => setComment(event.currentTarget.value)} placeholder="Что проверили, что обнаружили, итог обхода" value={comment} />
            {errors.comment ? <small className="field-error">{errors.comment}</small> : null}
          </label>
        </div>
        {pointResults.length ? (
          <section className="assign-am-complete-checklist">
            <header>
              <div>
                <h3>Чек-лист точек маршрута</h3>
                <p>Заполните фото и комментарии по обязательным точкам перед закрытием обхода.</p>
              </div>
              <strong>{pointResults.length} точек</strong>
            </header>
            <div className="assign-am-list routes">
              {pointResults.map((pointResult, index) => {
                const point = completionRoutePoints.find((item) => item.id === pointResult.routePointId);
                return (
                  <div className="assign-am-route" key={pointResult.routePointId}>
                    <div>
                      <strong>{index + 1}. {point?.name ?? pointResult.routePointId}</strong>
                      <div className="assign-am-tags">
                        <Tag>{point?.tag || point?.type || "-"}</Tag>
                        {point?.requiresPhoto ? <Tag>фото обязательно</Tag> : null}
                      </div>
                      <div className="assign-am-point-grid">
                        <label className="assign-am-field">
                          <span>Статус точки</span>
                          <select
                            onChange={(event) => updatePointResult(pointResult.routePointId, { status: event.currentTarget.value })}
                            value={pointResult.status}
                          >
                            <option value="Подтверждено">Подтверждено</option>
                            <option value="Замечание">Замечание</option>
                            <option value="Просрочено">Просрочено</option>
                            <option value="Не подтверждено">Не подтверждено</option>
                          </select>
                        </label>
                        <label className="assign-am-field">
                          <span>Фото</span>
                          <input
                            min={0}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { photos: Number(event.currentTarget.value) || 0 })}
                            type="number"
                            value={Math.max(pointResult.photos, pointResult.photoAttachments.length)}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Файлы фото</span>
                          <input
                            accept="image/*"
                            multiple
                            onChange={(event) => {
                              const files = event.currentTarget.files;
                              void readPhotoFiles(files).then((photoAttachments) => {
                                updatePointResult(pointResult.routePointId, {
                                  photoAttachments,
                                  photos: Math.max(pointResult.photos, photoAttachments.length),
                                });
                              });
                            }}
                            type="file"
                          />
                          {pointResult.photoAttachments.length > 0 ? <small>{pointResult.photoAttachments.length} файл(ов)</small> : null}
                        </label>
                        <label className="assign-am-field">
                          <span>Комментарий</span>
                          <input
                            onChange={(event) => updatePointResult(pointResult.routePointId, { comment: event.currentTarget.value })}
                            value={pointResult.comment}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Тип замечания</span>
                          <input
                            disabled={pointResult.status !== "Замечание"}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { issueType: event.currentTarget.value })}
                            placeholder="Например: повреждение"
                            value={pointResult.issueType}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Серьезность</span>
                          <select
                            disabled={pointResult.status !== "Замечание"}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { severity: event.currentTarget.value })}
                            value={pointResult.severity}
                          >
                            <option value="-">-</option>
                            <option value="Низкая">Низкая</option>
                            <option value="Средняя">Средняя</option>
                            <option value="Высокая">Высокая</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {errors.pointResults ? <small className="field-error">{errors.pointResults}</small> : null}
            {errors.photos ? <small className="field-error">{errors.photos}</small> : null}
          </section>
        ) : null}
        <footer>
          <Button onClick={onClose} variant="ghost">Отмена</Button>
          <Button disabled={saving} onClick={submit} variant="primary">
            <CheckCircle2 size={17} />
            {saving ? "Сохранение..." : "Завершить обход"}
          </Button>
        </footer>
    </ModalShell>
  );
}

export function CancelAssignmentModal({
  assignment,
  errors,
  onClose,
  onSubmit,
  saving = false,
}: {
  assignment: ActivePatrol;
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CancelAssignmentPayload) => void | Promise<void>;
  saving?: boolean;
}) {
  const [reasonCode, setReasonCode] = useState<CancelAssignmentPayload["reasonCode"]>("urgent_work");
  const [reasonText, setReasonText] = useState("");
  const requiresText = reasonCode === "other";
  const reasonOptions: Array<{ value: CancelAssignmentPayload["reasonCode"]; label: string }> = [
    { value: "urgent_work", label: "Ушел на другую срочную работу" },
    { value: "ppr", label: "ППР" },
    { value: "employee_absent", label: "Сотрудник отсутствует" },
    { value: "route_unavailable", label: "Маршрут временно недоступен" },
    { value: "duplicate", label: "Заявка создана повторно" },
    { value: "created_by_error", label: "Ошибка при создании" },
    { value: "other", label: "Прочее" },
  ];

  async function submit() {
    if (requiresText && !reasonText.trim()) return;
    await onSubmit({ reasonCode, reasonText: reasonText.trim() || undefined });
  }

  return (
    <ModalShell
      actions={(
        <>
          <Button onClick={onClose} variant="ghost">Не отменять</Button>
          <Button className="danger-outline" disabled={saving || (requiresText && !reasonText.trim())} onClick={() => void submit()} variant="danger">
            {saving ? "Сохранение..." : "Отменить заявку"}
          </Button>
        </>
      )}
      className="assign-am-cancel-modal"
      onClose={onClose}
      subtitle="Заявка останется в истории с причиной и временем отмены."
      title="Отмена заявки на обход"
    >
      <div className="patrol-cancel-modal-summary">
        <div><span>Сотрудник</span><strong>{assignment.employee}</strong></div>
        <div><span>Маршрут</span><strong>{assignment.route}</strong></div>
        <div><span>Плановый старт</span><strong>{assignment.plannedAt || "Не указан"}</strong></div>
        <div><span>Текущий статус</span><strong>{assignment.status}</strong></div>
      </div>
      <label className="assign-am-field patrol-cancel-modal-field">
        <span>Причина отмены</span>
        <select aria-label="Причина отмены" onChange={(event) => setReasonCode(event.currentTarget.value as CancelAssignmentPayload["reasonCode"])} value={reasonCode}>
          {reasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {errors.reasonCode ? <small className="field-error">{errors.reasonCode}</small> : null}
      </label>
      <label className="assign-am-field patrol-cancel-modal-field">
        <span>{requiresText ? "Комментарий (обязательно)" : "Комментарий"}</span>
        <textarea onChange={(event) => setReasonText(event.currentTarget.value)} placeholder="При необходимости добавьте пояснение" rows={3} value={reasonText} />
        {errors.reasonText ? <small className="field-error">{errors.reasonText}</small> : null}
      </label>
      <div className="patrol-cancel-modal-warning" role="status">
        Уведомление сотруднику об отмене будет отправлено автоматически.
      </div>
      {errors.form ? <p className="field-error assign-am-modal-error">{errors.form}</p> : null}
    </ModalShell>
  );
}

export function DraftsCard({ drafts, onDelete, onOpen }: { drafts: LocalDraft[]; onDelete: (draftId: string) => void; onOpen: (draft: LocalDraft) => void }) {
  return (
    <section className="assign-am-card">
      <PanelHeader count={drafts.length} icon={FileText} title="Черновики" />
      {drafts.length ? (
        <div className="assign-am-drafts">
          {drafts.map((draft) => (
            <div key={draft.id}>
              <button className="assign-am-draft-main" onClick={() => onOpen(draft)} type="button">
                <strong>{draft.title}</strong>
                <span>{draft.employeeName}</span>
                <span>{draft.routeName}</span>
                <small>{draft.changedAt}</small>
              </button>
              <button className="assign-am-draft-delete" onClick={() => onDelete(draft.id)} type="button">Удалить</button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel description="Сохраненные черновики текущей сессии появятся здесь." title="Черновиков нет" />
      )}
    </section>
  );
}

export function mergeAssignmentSources(historyAssignments: ActivePatrol[], liveAssignments: ActivePatrol[]) {
  const merged = new Map<string, ActivePatrol>();
  historyAssignments.forEach((assignment) => merged.set(assignment.id, assignment));
  liveAssignments.forEach((assignment) => merged.set(assignment.id, assignment));
  return Array.from(merged.values());
}

export function loadAssignmentDrafts(): LocalDraft[] {
  try {
    const value = localStorage.getItem(ASSIGNMENT_DRAFTS_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as LocalDraft[];
    return Array.isArray(parsed) ? parsed.filter((draft) => draft?.id && draft.employeeId && draft.routeId).slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function createLocalDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ConflictsCard({ conflicts }: { conflicts: Array<{ id: string; type: "danger" | "warning" | "info"; title: string; description: string; time: string }> }) {
  return (
    <section className="assign-am-card">
      <PanelHeader count={conflicts.length} icon={AlertTriangle} title="Конфликты и уведомления" />
      {conflicts.length ? (
        <div className="assign-am-conflicts">
          {conflicts.map((conflict) => (
            <div key={conflict.id}>
              <span className={conflict.type}><AlertTriangle size={16} /></span>
              <div>
                <strong>{conflict.title}</strong>
                <small>{conflict.description}</small>
              </div>
              <em>{conflict.time}</em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel description="Предупреждения появятся при пересечении смен, нехватке сотрудников или потере связи." title="Конфликтов нет" />
      )}
    </section>
  );
}

export function PanelHeader({
  actionLabel,
  count,
  icon: Icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  count?: number;
  icon: AssignmentIconComponent;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="assign-am-panel-head">
      <h2>{title}{typeof count === "number" ? <span>{count}</span> : null}</h2>
      {onAction ? (
        <button className="assign-am-panel-action" onClick={onAction} title={actionLabel} type="button">
          <Icon size={19} />
        </button>
      ) : (
        <Icon size={19} />
      )}
    </div>
  );
}

export function EmptyPanel({ actionLabel, description, onAction, title }: { actionLabel?: string; description: string; onAction?: () => void | Promise<void>; title: string }) {
  return (
    <div className="assign-am-empty">
      <strong>{title}</strong>
      <span>{description}</span>
      {actionLabel ? <Button onClick={() => void onAction?.()} variant="ghost">{actionLabel}</Button> : null}
    </div>
  );
}

export function SummaryBlock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="assign-am-summary-block">
      <small>{label}</small>
      <div>{children}</div>
    </div>
  );
}

export function DateTimeField({
  dateValue,
  label,
  onDateChange,
  onTimeChange,
  timeValue,
}: {
  dateValue: string;
  label: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  timeValue: string;
}) {
  return (
    <label className="assign-am-time-row">
      <span>{label}</span>
      <input aria-label={`${label}: дата`} onChange={(event) => onDateChange(event.currentTarget.value)} type="date" value={dateValue} />
      <input aria-label={`${label}: время`} onChange={(event) => onTimeChange(event.currentTarget.value)} type="time" value={timeValue} />
    </label>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="assign-am-avatar">{getInitials(name)}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="assign-am-tag">{children}</span>;
}

export function getCompletionRoutePoints(route?: RouteDirectoryItem): RoutePoint[] {
  return (route?.points ?? []).filter((point) => {
    const status = String(point.status);
    return status !== "Черновик" && status !== "Draft";
  });
}

export function flattenServerFieldErrors(errors?: Record<string, string[]>): Record<string, string> {
  if (!errors) return {};

  return Object.fromEntries(
    Object.entries(errors)
      .map(([field, messages]) => [field, messages.find(Boolean) ?? "Validation error"] as const)
      .filter(([, message]) => message.length > 0),
  );
}

export function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "С";
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

async function readPhotoFiles(files: FileList | null): Promise<PatrolCompletionPhotoPayload[]> {
  if (!files?.length) return [];

  const selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    selectedFiles.map(
      (file) =>
        new Promise<PatrolCompletionPhotoPayload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл фото."));
          reader.onload = () => {
            const value = typeof reader.result === "string" ? reader.result : "";
            resolve({
              contentType: file.type || "application/octet-stream",
              dataBase64: value.includes(",") ? value.slice(value.indexOf(",") + 1) : value,
              fileName: file.name,
            });
          };
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export { shouldCreateAssignmentAfterRequest };
