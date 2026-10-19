import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { Button } from "../../../../shared/ui";
import type { EmuDialogSession } from "../useEmuDialogSession";

export type TemplateDraft = { name: string; description: string; sectionId: string; search: string };
export function TemplateBlock({ workspace, draft, onChange, session }: { workspace: EmuWorkspace; draft: TemplateDraft; onChange: (draft: TemplateDraft) => void; session: EmuDialogSession }) {
  const { name, description, sectionId, search } = draft;
  const templates = workspace.settings.workTemplates;
  const filtered = templates.filter(item => [item.name, item.description, item.sectionName].some(value => value.toLowerCase().includes(search.trim().toLowerCase())));
  return <section className="emu-reference-block emu-template-block">
    <div className="emu-reference-heading"><div><h4>Типовые работы</h4><span>{templates.filter(item => item.isActive).length} активно · {templates.filter(item => !item.isActive).length} скрыто</span></div><em>{templates.length}</em></div>
    <div className="emu-template-form-grid">
      <label>Название работы<input value={name} onChange={event => onChange({ ...draft, name: event.target.value })} placeholder="Например, осмотр оборудования" /></label>
      <label>Участок<select value={sectionId} onChange={event => onChange({ ...draft, sectionId: event.target.value })}><option value="">Любой участок</option>{workspace.settings.sections.filter(item => item.isActive || item.id === sectionId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <label>Описание и ожидаемый результат<textarea rows={3} value={description} onChange={event => onChange({ ...draft, description: event.target.value })} placeholder="Что нужно сделать и какой результат получить" /></label>
    <Button disabled={!name.trim()} onClick={() => void session.run(() => workspace.actions.createWorkTemplate({ description, name: name.trim(), sectionId: sectionId || null }), "Типовая работа добавлена", () => onChange({ ...draft, name: "", description: "", sectionId: "" }))} variant="primary">Добавить типовую работу</Button>
    <label>Поиск по типовым работам<input value={search} onChange={event => onChange({ ...draft, search: event.target.value })} placeholder="Название, описание или участок" /></label>
    <div className="emu-reference-list">{filtered.map(item => <div className={`emu-reference-row emu-template-row ${item.isActive ? "is-active" : "is-hidden"}`} key={item.id}>
      <span><strong>{item.name}</strong><small>{item.sectionName || "Любой участок"}</small>{item.description ? <small>{item.description}</small> : null}</span>
      <em className={`emu-reference-state ${item.isActive ? "is-active" : "is-hidden"}`}>{item.isActive ? "активно" : "скрыто"}</em>
      <button onClick={() => void session.run(() => workspace.actions.updateWorkTemplate(item.id, { description: item.description, isActive: !item.isActive, name: item.name, sectionId: item.sectionId, sortOrder: item.sortOrder }), "Типовая работа обновлена")} type="button">{item.isActive ? "Скрыть" : "Вернуть"}</button>
    </div>)}{filtered.length === 0 ? <div className="emu-empty-state">Типовые работы не найдены</div> : null}</div>
  </section>;
}
