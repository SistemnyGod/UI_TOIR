import { useEffect, useMemo, useRef, useState } from "react";
import type { InventoryPpeNormRowDto, PpeKitTemplateDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import type { DraftLine, KitTemplate } from "./documentWorkflow";
import { ppeErrorMessage } from "./ppeErrors";
import { writeDocumentStorage } from "./documentStorage";
import { legacyTemplatesKey, mergeTemplates, readImportedTemplates, readLegacyTemplates, templateDraftLines, templateLineInputs } from "./kitTemplateModel";
import { KitTemplateEntry } from "./KitTemplateEntry";
import { validateKitLines } from "./kitLineValidation";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import "../styles/ppe-kit-dialogs.css";

type Props = { userId: string; canManageShared: boolean; normSetId: string; rows: InventoryPpeNormRowDto[]; lines: DraftLine[]; date: string; onClose: () => void; onApply: (updater: (current: DraftLine[]) => DraftLine[]) => void };
type Intent = { kind: "apply" | "archive"; template: PpeKitTemplateDto };
export function KitTemplates(props: Props) {
  const repository = useInventoryRepository();
  const owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <TemplateWorkspace key={`${props.userId}:${props.normSetId}:${props.date}:${owner.current.revision}`} {...props} />;
}
function TemplateWorkspace({ userId, canManageShared, normSetId, rows, lines, date, onClose, onApply }: Props) {
  const repository = useInventoryRepository(), operation = usePpeDialogOperation();
  const [templates, setTemplates] = useState<PpeKitTemplateDto[]>([]), [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [name, setName] = useState(""), [shared, setShared] = useState(false), [query, setQuery] = useState(""), [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [reload, setReload] = useState(0), [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null), [importingId, setImportingId] = useState(""), [page, setPage] = useState(1);
  const writes = useRef(new Map<string, number>()), writeRevision = useRef(0);
  const legacy = useMemo(() => readLegacyTemplates(userId), [userId]);
  const importedKey = `${legacyTemplatesKey(userId)}.imported`;
  const [imported, setImported] = useState(() => readImportedTemplates(importedKey));
  const importedRef = useRef(imported); importedRef.current = imported;
  const editedNames = Object.entries(draftNames).filter(([id, value]) => templates.some(template => template.id === id && template.name !== value));
  const dirty = Boolean(name || shared || editedNames.length);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: operation.pending, onClose });
  useEffect(() => {
    let active = true;
    const startedAt = writeRevision.current;
    setLoading(true); setLoadError("");
    repository.getPpeKitTemplates().then(value => { if (active) setTemplates(current => mergeTemplates(current, value, new Set([...writes.current].filter(([, revision]) => revision > startedAt).map(([id]) => id)))); }, failure => { if (active) setLoadError(ppeErrorMessage(failure, "Не удалось загрузить шаблоны")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repository, reload]);
  function touch(id: string) { writes.current.set(id, ++writeRevision.current); }
  function commit(template: PpeKitTemplateDto) { touch(template.id); setTemplates(current => current.some(item => item.id === template.id) ? current.map(item => item.id === template.id ? template : item) : [template, ...current]); }
  function forgetName(id: string) { setDraftNames(current => { const next = { ...current }; delete next[id]; return next; }); }
  function create() {
    if (!name.trim()) { operation.setError("Укажите название шаблона."); return; }
    if (shared && !canManageShared) { operation.setError("Нет права сохранять общий шаблон."); return; }
    const invalid = validateKitLines(lines, false);
    if (invalid) { operation.setError(invalid); return; }
    if (!lines.length) { operation.setError("Добавьте позиции в комплект."); return; }
    void operation.execute(() => repository.createPpeKitTemplate({ name: name.trim(), normSetId, isShared: shared, lines: templateLineInputs(lines) }), saved => { commit(saved); setName(""); setShared(false); setNotice("Шаблон сохранён на сервере."); });
  }
  function importLegacy(template: KitTemplate) {
    const invalid = validateKitLines(template.lines, false);
    if (invalid) { operation.setError(invalid); return; }
    setImportingId(template.id);
    void operation.execute(() => repository.createPpeKitTemplate({ name: template.name, normSetId: template.normSetId, isShared: false, lines: templateLineInputs(template.lines) }), saved => {
      commit(saved);
      const next = new Set(importedRef.current).add(template.id); importedRef.current = next; setImported(next);
      const persisted = writeDocumentStorage("sessionStorage", importedKey, JSON.stringify([...next]));
      setNotice(persisted ? "Шаблон импортирован. Исходные данные браузера сохранены." : "Шаблон сохранён на сервере. Отметка импорта сохранена в памяти этого сеанса.");
      setImportingId("");
    });
  }
  function rename(template: PpeKitTemplateDto) {
    const next = (draftNames[template.id] ?? template.name).trim();
    if (!next) { operation.setError("Название шаблона не может быть пустым."); return; }
    void operation.execute(() => repository.renamePpeKitTemplate(template.id, template.version, next), saved => { commit(saved); forgetName(saved.id); setNotice("Имя шаблона сохранено."); });
  }
  function apply(template: PpeKitTemplateDto) {
    if (dirty || replace && lines.length) { operation.setError(""); setIntent({ kind: "apply", template }); return; }
    applyChecked(template);
  }
  function applyChecked(template: PpeKitTemplateDto) {
    void operation.execute(() => repository.validatePpeKitTemplate(template.id, normSetId), checked => { const next = templateDraftLines(checked, rows, date); onApply(current => replace ? next : [...current, ...next]); onClose(); });
  }
  function archive(template: PpeKitTemplateDto) {
    const allowed = template.isShared ? canManageShared : template.ownerUserId === userId;
    if (!allowed) { operation.setError("Нет права изменять этот шаблон."); return; }
    void operation.execute(() => repository.archivePpeKitTemplate(template.id, template.version), () => { touch(template.id); setTemplates(current => current.filter(item => item.id !== template.id)); forgetName(template.id); setIntent(null); setNotice("Шаблон перенесён в архив."); });
  }
  const visible = templates.filter(template => template.name.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const pages = Math.max(1, Math.ceil(visible.length / 20)), currentPage = Math.min(page, pages);
  return <><ModalShell title="Готовые комплекты" subtitle="Личные и общие шаблоны на сервере" className="ppe-kit-templates-dialog" onClose={requestClose} pending={operation.pending}
    actions={<>{editedNames.length ? <span className="ppe-kit-dialog-hint">Несохранённых имён: {editedNames.length}</span> : null}<Button disabled={operation.pending} variant="ghost" onClick={requestClose}>Закрыть просмотр</Button></>}>
    <p className="ppe-kit-dialog-hint">Сотрудник, размеры и даты выдачи в шаблон не входят.</p>
    {loading ? <p role="status" className="ppe-kit-dialog-hint">{templates.length ? "Обновляем шаблоны…" : "Загружаем шаблоны…"}</p> : null}
    {loadError ? <p role="alert" className="field-error">{loadError} <Button variant="ghost" disabled={operation.pending || loading} onClick={() => setReload(value => value + 1)}>Повторить загрузку</Button></p> : null}
    {operation.error ? <p role="alert" className="field-error">{operation.error}</p> : null}{notice ? <p role="status" className="ppe-kit-dialog-hint">{notice}</p> : null}
    <fieldset className="ppe-kit-template-workspace" disabled={operation.pending}>
      {legacy.length ? <details className="ppe-kit-template-legacy"><summary>Шаблоны этого браузера: {legacy.length}</summary><p>Проверьте состав перед импортом. Локальные данные останутся доступны.</p>{legacy.map(template => <details key={template.id}><summary>{template.name} · {template.lines.length} позиций {imported.has(template.id) ? "· импортирован" : ""}</summary><ul>{template.lines.map((line, index) => <li key={`${line.normRowId}:${line.itemId}:${index}`}>{line.itemName} · {line.quantity} {line.unitSymbol}</li>)}</ul><Button variant="ghost" disabled={operation.pending || imported.has(template.id)} onClick={() => importLegacy(template)}>{importingId === template.id && operation.pending ? "Импортируем…" : imported.has(template.id) ? "Импортирован" : "Импортировать этот шаблон"}</Button></details>)}</details> : null}
      <details className="ppe-kit-template-save"><summary>Сохранить комплект как новый шаблон</summary><form className="ppe-kit-template-create" onSubmit={event => { event.preventDefault(); create(); }}><label>Название нового шаблона<input maxLength={160} placeholder="Электромонтёр · зимний комплект" value={name} onChange={event => { setName(event.target.value); operation.setError(""); }} /></label><label className="ppe-kit-dialog-checkbox"><input type="checkbox" checked={shared} disabled={!canManageShared || operation.pending} onChange={event => setShared(event.target.checked)} /> Общий шаблон</label><Button variant="ghost" disabled={operation.pending || !name.trim() || !lines.length} type="submit">Сохранить текущий комплект</Button></form></details>
      <div className="ppe-kit-dialog-toolbar"><label>Найти шаблон<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><Button variant="ghost" disabled={loading || operation.pending} onClick={() => setReload(value => value + 1)}>Обновить список</Button></div>
      <fieldset className="ppe-kit-template-mode"><legend>Как применить шаблон</legend><label><input type="radio" name="template-apply-mode" checked={!replace} onChange={() => setReplace(false)} /> Добавить к текущему комплекту</label><label><input type="radio" name="template-apply-mode" checked={replace} onChange={() => setReplace(true)} /> Заменить комплект</label></fieldset>
      {visible.slice((currentPage - 1) * 20, currentPage * 20).map(template => <KitTemplateEntry key={template.id} template={template} name={draftNames[template.id] ?? template.name} disabled={operation.pending} canEdit={template.isShared ? canManageShared : template.ownerUserId === userId} compatible={template.normSetId === normSetId}
        onName={value => setDraftNames(current => ({ ...current, [template.id]: value }))} onRename={() => rename(template)} onApply={() => apply(template)} onCopy={() => { void operation.execute(() => repository.copyPpeKitTemplate(template.id), saved => { commit(saved); setNotice("Копия шаблона создана."); }); }} onArchive={() => { operation.setError(""); setIntent({ kind: "archive", template }); }} />)}
      {!loading && !visible.length ? <p className="ppe-kit-dialog-hint">{query ? "По запросу шаблонов нет." : "Сохраните комплект, чтобы использовать его повторно."}</p> : null}
      {visible.length > 20 ? <nav className="ppe-kit-dialog-pager" aria-label="Страницы шаблонов"><Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Назад</Button><span>{currentPage} / {pages}</span><Button size="sm" variant="ghost" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Вперёд</Button></nav> : null}
    </fieldset>
  </ModalShell>{discardDialog}
    {intent ? <ModalShell title={intent.kind === "archive" ? "Архивировать шаблон?" : "Применить шаблон?"} subtitle={intent.template.name} className="ppe-kit-template-confirm" pending={operation.pending} onClose={() => setIntent(null)}
      actions={<><Button disabled={operation.pending} variant="ghost" onClick={() => setIntent(null)}>Вернуться</Button><Button disabled={operation.pending} variant={intent.kind === "archive" || replace ? "danger" : "primary"} onClick={() => intent.kind === "archive" ? archive(intent.template) : applyChecked(intent.template)}>{operation.pending ? "Выполняем…" : intent.kind === "archive" ? "Архивировать" : replace ? "Заменить комплект" : "Добавить комплект"}</Button></>}>
      <p>{intent.kind === "archive" ? "Шаблон будет скрыт из активного списка. Состав уже сохранённых документов не изменится." : replace ? "Текущие позиции комплекта будут заменены после серверной проверки шаблона." : "Позиции шаблона будут добавлены после серверной проверки."}</p>
      {dirty && intent.kind === "apply" ? <p>Несохранённые изменения названий шаблонов не будут сохранены.</p> : null}{operation.error ? <p role="alert" className="field-error">{operation.error}</p> : null}
    </ModalShell> : null}
  </>;
}
