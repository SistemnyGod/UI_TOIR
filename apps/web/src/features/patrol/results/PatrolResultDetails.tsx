import "./scoped-legacy.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, MapPin, MessageSquare, Paperclip, Search, AlertTriangle, PlusCircle } from "lucide-react";
import type { PatrolResult } from "../../../types";
import { Button, ModalShell, SectionTabs } from "../../../shared/ui";
import { ResultPointMedia } from "./ResultPointMedia";
import { getResultPointMeta, resultAttachmentCount, resultDateTime, resultHasIssue, usefulResultText } from "./resultPresentation";
import type { ResultGroup } from "./resultTypes";
import { usePhoneLayout } from "../../../hooks/usePhoneLayout";

export type ResultPointMode = "all" | "issues" | "photos" | "comments";
export type ResultReadingMode = "point" | "comments";

interface PatrolResultDetailsProps {
  initialResultId?: string;
  initialPointMode?: ResultPointMode;
  initialReadingMode?: ResultReadingMode;
  group: ResultGroup;
  onClose: () => void;
  onCreateRequest: () => void;
  onExport: () => void;
  onOpenRequest: () => void;
  onOpenAttachment: (result: PatrolResult, order?: number, attachmentIndex?: number) => void;
  onBeforeOpenAttachment?: (element: HTMLElement) => void;
  onSelectionChange?: () => void;
  photoLoadingResultId: string | null;
  exportInProgress?: boolean;
  canCreateRequest?: boolean;
  canOpenRequest?: boolean;
  loadErrors?: Record<string, string>;
  onRetryResult?: (result: PatrolResult) => void;
}

export function PatrolResultDetails({ group, initialResultId, initialPointMode = "all", initialReadingMode = "point", onClose, onCreateRequest, onExport, onOpenRequest, onOpenAttachment, onBeforeOpenAttachment,
  photoLoadingResultId, exportInProgress = false, canCreateRequest = true, canOpenRequest = true, loadErrors = {}, onRetryResult, onSelectionChange }: PatrolResultDetailsProps) {
  const [pointMode, setPointMode] = useState<ResultPointMode>(initialPointMode);
  const [pointQuery, setPointQuery] = useState("");
  const [readingMode, setReadingMode] = useState<ResultReadingMode>(initialReadingMode);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(() => new Set());
  const phone = usePhoneLayout("(max-width: 760px)");
  const [pointListExpanded, setPointListExpanded] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState(() => group.results.find(result => result.id === initialResultId)?.id ?? group.results.find(result => resultAttachmentCount(result) > 0)?.id ?? group.results[0]?.id);
  const selectedPanelRef = useRef<HTMLElement>(null);
  const orderById = useMemo(() => new Map(group.results.map((result, index) => [result.id, index + 1])), [group.results]);
  const issueCount = group.results.filter(resultHasIssue).length;
  const mediaCount = group.results.filter(result => resultAttachmentCount(result) > 0).length;
  const commentCount = group.results.filter(result => usefulResultText(result.comment)).length;
  const filtered = useMemo(() => group.results.filter(result => {
    const matchesMode = pointMode === "all" || (pointMode === "issues" ? resultHasIssue(result) : pointMode === "comments" ? usefulResultText(result.comment) : resultAttachmentCount(result) > 0);
    return matchesMode && [result.point, result.comment, result.issueType].join(" ").toLocaleLowerCase("ru-RU").includes(pointQuery.trim().toLocaleLowerCase("ru-RU"));
  }), [group.results, pointMode, pointQuery]);
  const selected = filtered.find(result => result.id === selectedPointId) ?? filtered[0];
  const selectedIndex = selected ? filtered.findIndex(result => result.id === selected.id) : -1;
  const selectedOrder = selected ? orderById.get(selected.id) ?? 0 : 0;
  const status = selected ? getResultPointMeta(selected) : undefined;
  const comments = filtered.filter(result => usefulResultText(result.comment));
  const started = resultDateTime(group.startedAt ?? group.firstScanAt);
  const finished = resultDateTime(group.finishedAt ?? group.lastScanAt);
  useEffect(() => { onSelectionChange?.(); }, [selected?.id, onSelectionChange]);

  function selectPoint(id: string) {
    setSelectedPointId(id);
    setReadingMode("point");
    setPointListExpanded(false);
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      requestAnimationFrame(() => selectedPanelRef.current?.scrollIntoView?.({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    }
  }

  function openMedia(result: PatrolResult, element: HTMLElement) {
    onBeforeOpenAttachment?.(element);
    onOpenAttachment(result, orderById.get(result.id), 0);
  }

  return <ModalShell className={`results-review-modal patrol-result-detail-v2 patrol-result-readable ${readingMode === "comments" ? "is-comments-view" : ""}`} title={`Обход «${group.route}»`}
    titleBadge={<span className={`patrol-detail-overall-status ${issueCount ? "has-issues" : "is-clean"}`}>{issueCount ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{issueCount ? "Есть замечания" : "Без замечаний"}</span>}
    subtitle={`${group.employee} · ${started.date}`} onClose={onClose}
    actions={<>
      <div className="patrol-detail-related-actions"><Button variant="ghost" disabled={!canOpenRequest} onClick={onOpenRequest}><ExternalLink size={17} />Открыть связанную заявку</Button>
        {canCreateRequest ? <Button variant="ghost" aria-label="Создать заявку" title="Создать заявку" onClick={onCreateRequest}><PlusCircle size={17} /></Button> : null}</div>
      <div className="patrol-detail-primary-actions"><Button variant="ghost" onClick={onClose}>Закрыть</Button><Button variant="primary" disabled={exportInProgress} onClick={onExport}><Download size={17} />{exportInProgress ? "Экспорт…" : "Экспорт отчёта"}</Button></div>
    </>}>
    <div className="patrol-detail-summary">
      <span><CalendarDays size={18} />Начало <strong>{started.time}</strong></span><span title={`${finished.date}, ${finished.time}`}><Clock3 size={18} />Окончание <strong>{finished.time}{finished.date !== started.date ? <small> · {finished.date}</small> : null}</strong></span>
      <span><MapPin size={18} />Проверено <strong>{group.okPoints + group.issuePoints} из {group.points}</strong></span><span><Paperclip size={18} />Вложения <strong>{group.photos}</strong></span>
    </div>
    <div className="patrol-detail-toolbar">
      <label className="patrol-detail-search"><Search size={18} /><input aria-label="Поиск точки обхода" value={pointQuery} onChange={event => setPointQuery(event.currentTarget.value)} placeholder="Точка, комментарий или замечание…" /></label>
      <div className="patrol-detail-reading-switch" aria-label="Способ просмотра отчёта">
        <button type="button" aria-pressed={readingMode === "point"} onClick={() => setReadingMode("point")}><MapPin size={17} />По точкам</button>
        <button type="button" aria-pressed={readingMode === "comments"} onClick={() => setReadingMode("comments")}><MessageSquare size={17} />Все комментарии <small>{commentCount}</small></button>
      </div>
      <SectionTabs ariaLabel="Фильтр точек обхода" value={pointMode} onChange={value => setPointMode(value as ResultPointMode)} tabs={[{ id: "all", label: "Все", count: group.results.length }, { id: "issues", label: "Замечания", count: issueCount }, { id: "comments", label: "С комментариями", count: commentCount }, { id: "photos", label: "С медиа", count: mediaCount }]} />
    </div>
    <div className={`patrol-detail-layout ${readingMode === "comments" ? "is-reading" : ""}`}>
      {readingMode === "point" ? <section className="patrol-detail-points" aria-label="Точки обхода">
        {phone ? <button className="patrol-detail-points-toggle" type="button" aria-expanded={pointListExpanded} onClick={() => setPointListExpanded(value => !value)}>Выбрать точку <span>{selectedOrder} из {group.results.length} · {pointListExpanded ? "Свернуть" : "Показать"}</span></button> : <div className="patrol-detail-points-caption"><h3>Точки обхода</h3><span>{filtered.length} из {group.results.length}</span></div>}
        <div className="patrol-detail-point-list" hidden={phone && !pointListExpanded}>
          {filtered.map(result => {
            const meta = getResultPointMeta(result);
            const order = orderById.get(result.id) ?? 0;
            return <button key={result.id} type="button" aria-label={`${order} ${result.point || `Точка ${order}`}, ${meta.label}, ${resultDateTime(result.actualAt).time}`} aria-pressed={selected?.id === result.id} className="patrol-detail-point" onClick={() => selectPoint(result.id)}>
              <span className="patrol-detail-point-order">{order}</span><div><strong>{result.point || `Точка ${order}`}</strong><div className="patrol-detail-point-meta"><time>{resultDateTime(result.actualAt).time}</time><PointStatus state={meta} /></div>
                {usefulResultText(result.comment) ? <p className="patrol-detail-point-note">{result.comment}</p> : null}</div>
              {resultAttachmentCount(result) > 0 ? <span className="patrol-detail-point-attachments"><Paperclip size={16} />{resultAttachmentCount(result)}</span> : null}
            </button>;
          })}
          {!filtered.length ? <p className="patrol-detail-empty">Точки по выбранному фильтру не найдены.</p> : null}
        </div>
      </section> : null}
      <section className="patrol-detail-selected" aria-label={readingMode === "comments" ? "Комментарии по точкам" : "Выбранная точка обхода"} ref={selectedPanelRef}>
        {readingMode === "comments" ? <>
          <div className="patrol-comments-heading"><h3>Комментарии по точкам</h3><p>Комментариев по фильтру: {comments.length}</p></div>
          <div className="patrol-comments-scroll" tabIndex={0} aria-label="Список комментариев точек">
          <div className="patrol-comments-columns" aria-hidden="true"><span>Метка / фиксация</span><span>Комментарий сотрудника</span><span>Вложения / просмотр</span></div>
          <div className="patrol-comments-list">{comments.map(result => {
            const expandable = result.comment.length > 240 || result.comment.split("\n").length > 3;
            const expanded = expandedComments.has(result.id);
            return <article className="patrol-comment-card" key={result.id}>
            <header><div><span>Точка {orderById.get(result.id)} · {resultDateTime(result.actualAt).time}</span><h4>{result.point}</h4></div><PointStatus state={getResultPointMeta(result)} /></header>
            <div className="patrol-comment-text"><p id={`patrol-comment-${result.id}`} className={expandable && !expanded ? "is-collapsed" : ""}>{result.comment}</p>
              {expandable ? <button type="button" className="patrol-comment-expand" aria-expanded={expanded} aria-controls={`patrol-comment-${result.id}`} onClick={() => setExpandedComments(current => {
                const next = new Set(current); if (next.has(result.id)) next.delete(result.id); else next.add(result.id); return next;
              })}>{expanded ? "Свернуть комментарий" : "Читать полностью"}</button> : null}</div>
            <footer><Button variant="ghost" onClick={() => selectPoint(result.id)}>Открыть точку</Button>
              {resultAttachmentCount(result) > 0 ? <Button disabled={photoLoadingResultId === result.id} onClick={event => openMedia(result, event.currentTarget)} variant="secondary"><Paperclip size={17} />Просмотреть вложения · {resultAttachmentCount(result)}</Button> : <span className="patrol-comment-no-media">Без вложений</span>}</footer>
          </article>; })}</div>
          {!comments.length ? <p className="patrol-detail-empty">По текущему фильтру комментариев нет. Выберите «Все» или измените поиск.</p> : null}
          </div>
        </> : selected && status ? <>
          <div className="patrol-detail-point-navigation"><span>Точка {selectedOrder} из {group.results.length}</span><div>
            <button aria-label="Предыдущая точка" disabled={selectedIndex <= 0} type="button" onClick={() => selectPoint(filtered[selectedIndex - 1].id)}><ChevronLeft size={19} /></button>
            <button aria-label="Следующая точка" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} type="button" onClick={() => selectPoint(filtered[selectedIndex + 1].id)}><ChevronRight size={19} /></button>
          </div></div>
          <div className="patrol-detail-selected-title"><h3>{selected.point || `Точка ${selectedOrder}`}</h3><PointStatus state={status} /></div>
          <div className="patrol-detail-point-fixation"><CalendarDays size={18} /><span>Фиксация</span><strong>{resultDateTime(selected.actualAt).date}, {resultDateTime(selected.actualAt).time}</strong></div>
          {usefulResultText(selected.issueType) ? <p className="patrol-detail-issue"><AlertTriangle size={18} />{selected.issueType}</p> : null}
          <div className={`patrol-detail-comment ${usefulResultText(selected.comment) ? "" : "is-empty"}`}><MessageSquare size={20} /><div><span>Комментарий сотрудника</span><p>{usefulResultText(selected.comment) ? selected.comment : "Комментарий не добавлен."}</p></div></div>
          {/manual|вручную|без сканирования/i.test([selected.status, selected.comment].join(" ")) ? <p className="patrol-detail-manual">Заполнено вручную без сканирования</p> : null}
          {loadErrors[selected.id] && resultAttachmentCount(selected) === 0 ? <div className="patrol-detail-load-error" role="alert"><p>{loadErrors[selected.id]}</p><Button variant="secondary" onClick={() => onRetryResult?.(selected)}>Повторить загрузку точки</Button></div> : null}
          <ResultPointMedia key={selected.id} pointName={selected.point} attachments={selected.attachments} expectedCount={resultAttachmentCount(selected)} metadataError={loadErrors[selected.id]} onRetryMetadata={() => onRetryResult?.(selected)} onEnlarge={(element, index) => { onBeforeOpenAttachment?.(element); onOpenAttachment(selected, selectedOrder, index); }} />
        </> : <p className="patrol-detail-empty">Выберите другой фильтр или измените поиск.</p>}
      </section>
    </div>
  </ModalShell>;
}

function PointStatus({ state }: { state: ReturnType<typeof getResultPointMeta> }) {
  return <span className={`patrol-point-status is-${state.key}`}>{state.key === "ok" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{state.label}</span>;
}
