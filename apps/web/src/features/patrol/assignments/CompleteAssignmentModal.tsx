import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2 } from "./AssignmentIcons";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { formatAssignmentActionTime, toDateTimeInput } from "./assignmentDateUtils";
import { getCompletionRoutePoints, readCompletionPhotos, type PointCompletionDraft } from "./assignmentCompletion";
import type { ActivePatrol, CompleteAssignmentPayload, RouteDirectoryItem } from "../../../types";
import "./assignmentCommandDialogs.css";

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
  const [completionRoutePoints] = useState(() => getCompletionRoutePoints(route));
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
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState("");
  const [photoLoading, setPhotoLoading] = useState<Record<string, boolean>>({});
  const readers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const initialDraft = useRef(JSON.stringify({ actualAt, status, routePointId, comment, issueType, severity, photos, pointResults }));
  const formId = useId();
  const busy = Boolean(saving || pending);
  const readingPhotos = Object.values(photoLoading).some(Boolean);
  const { requestClose, discardDialog } = useDialogCloseGuard({
    dirty: () => readingPhotos || JSON.stringify({ actualAt, status, routePointId, comment, issueType, severity, photos, pointResults }) !== initialDraft.current,
    pending: busy,
    onClose,
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const reader of readers.current.values()) reader.abort(); readers.current.clear(); };
  }, []);

  async function loadPhotos(pointId: string, files: File[]) {
    if (busy || !files.length) return;
    readers.current.get(pointId)?.abort();
    const controller = new AbortController();
    readers.current.set(pointId, controller);
    setPhotoLoading(current => ({ ...current, [pointId]: true }));
    setLocalError("");
    const current = () => mounted.current && readers.current.get(pointId) === controller;
    try {
      const attachments = await readCompletionPhotos(files, controller.signal);
      if (current()) setPointResults(points => points.map(point => point.routePointId === pointId ? { ...point, photoAttachments: attachments, photos: point.photos === point.photoAttachments.length ? attachments.length : Math.max(point.photos, attachments.length) } : point));
    } catch (failure) {
      if (current() && !controller.signal.aborted) setLocalError(failure instanceof Error ? failure.message : "Не удалось прочитать фото. Предыдущие вложения сохранены.");
    } finally {
      if (current()) { controller.abort(); readers.current.delete(pointId); setPhotoLoading(value => ({ ...value, [pointId]: false })); }
    }
  }

  const formError =
    localError || errors.form ||
    errors.result ||
    errors.assignmentId ||
    errors.routeVersion ||
    errors.routeVersionNo ||
    errors.routePointId;

  const submit = async () => {
    if (busy || inFlight.current || readers.current.size > 0) return;
    inFlight.current = true;
    setPending(true);
    setLocalError("");
    const date = new Date(actualAt);
    try { await onSubmit({
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
    }); }
    catch (failure) { if (mounted.current) setLocalError(failure instanceof Error ? failure.message : "Не удалось сохранить результат. Повторите попытку."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };

  function updatePointResult(routePointId: string, patch: Partial<PointCompletionDraft>) {
    setPointResults((current) => current.map((point) => (point.routePointId === routePointId ? { ...point, ...patch } : point)));
  }

  function removePhoto(pointId: string, index: number) {
    setPointResults(points => points.map(point => {
      if (point.routePointId !== pointId) return point;
      const attachments = point.photoAttachments.filter((_, current) => current !== index);
      return { ...point, photoAttachments: attachments, photos: point.photos === point.photoAttachments.length ? attachments.length : point.photos };
    }));
  }

  return (
    <><ModalShell
      className="assign-am-complete-modal"
      pending={busy}
      onClose={() => { if (!inFlight.current) requestClose(); }}
      actions={<>
        <Button disabled={busy} onClick={requestClose} variant="ghost">Отмена</Button>
        <Button disabled={busy || readingPhotos} form={formId} type="submit" variant="primary"><CheckCircle2 size={17} />{busy ? "Сохранение..." : readingPhotos ? "Подготовка фото…" : "Завершить обход"}</Button>
      </>}
      subtitle={`${assignment.employee} · ${assignment.route}`}
      title="Завершить обход"
    >
      <form id={formId} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset className="assignment-command-fields" disabled={busy}>
        <div className="assign-am-complete-summary">
          <span>{assignment.status}</span>
          <strong>{assignment.progress}%</strong>
          <small>{formatAssignmentActionTime(assignment)}</small>
        </div>
        {formError ? <p className="field-error assign-am-modal-error" role="alert">{formError}</p> : null}
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
                <p>Заполните результаты точек. Фотографии можно приложить по необходимости.</p>
              </div>
              <strong>{pointResults.length} точек</strong>
            </header>
            <div className="assign-am-list routes">
              {pointResults.map((pointResult, index) => {
                const point = completionRoutePoints.find((item) => item.id === pointResult.routePointId);
                return (
                  <details className="assign-am-route assignment-complete-point" key={pointResult.routePointId} open={pointResults.length <= 2 || index === 0}>
                    <summary><strong>{index + 1}. {point?.name ?? pointResult.routePointId}</strong><small>{pointResult.status} · файлов: {pointResult.photoAttachments.length}</small></summary>
                    <div>
                      <div className="assign-am-tags">
                        <span className="assign-am-tag">{point?.tag || point?.type || "-"}</span>
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
                          <span className="assignment-photo-picker"><input
                            aria-label="Файлы фото"
                            accept="image/*"
                            multiple
                            onChange={(event) => {
                              const files = Array.from(event.currentTarget.files ?? []);
                              event.currentTarget.value = "";
                              void loadPhotos(pointResult.routePointId, files);
                            }}
                            type="file"
                          /><span aria-hidden="true">Выбрать фото…</span></span>
                          {photoLoading[pointResult.routePointId] ? <small className="assignment-photo-status" role="status">Подготовка фото…</small> : null}
                          {pointResult.photoAttachments.length > 0 ? <span className="assignment-prepared-photos">{pointResult.photoAttachments.map((file, index) => <button
                            aria-label={`Убрать фото ${file.fileName}`} disabled={busy || photoLoading[pointResult.routePointId]} key={`${index}:${file.fileName}`} type="button"
                            onClick={event => { event.preventDefault(); removePhoto(pointResult.routePointId, index); }}>{file.fileName}<span aria-hidden="true"> ×</span></button>)}</span> : null}
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
                  </details>
                );
              })}
            </div>
            {errors.pointResults ? <small className="field-error">{errors.pointResults}</small> : null}
            {errors.photos ? <small className="field-error">{errors.photos}</small> : null}
          </section>
        ) : null}
      </fieldset>
      </form>
    </ModalShell>{discardDialog}</>
  );
}

