import type { EmuReferenceDto } from "../../../../api/contracts";
import type { EmuDialogSession } from "../useEmuDialogSession";
import { isSystemOtherSection } from "../workAccountingUtils";

export type ReferenceDraft = { name: string; search: string; editing: { item: EmuReferenceDto; name: string } | null };

export function ReferenceBlock({ items, onCreate, onUpdate, protectSystemOther = false, title, draft, onChange, session }: {
  items: EmuReferenceDto[];
  onCreate: (name: string) => Promise<EmuReferenceDto>;
  onUpdate: (item: EmuReferenceDto, patch: { isActive?: boolean; name?: string }) => Promise<EmuReferenceDto>;
  protectSystemOther?: boolean;
  title: string;
  draft: ReferenceDraft;
  onChange: (draft: ReferenceDraft) => void;
  session: EmuDialogSession;
}) {
  const { name, search, editing } = draft;
  const filtered = items.filter(item => item.id === editing?.item.id || item.name.toLowerCase().includes(search.trim().toLowerCase()));
  // Preserve the opened editor if a background refresh removes its record.
  const rows = editing && !items.some(item => item.id === editing.item.id) ? [editing.item, ...filtered] : filtered;
  function saveEdit() {
    if (!editing?.name.trim()) return;
    void session.run(async () => {
      const current = items.find(item => item.id === editing.item.id);
      if (!current || current.name !== editing.item.name) throw new Error("Запись изменена или удалена другим пользователем. Ваш ввод сохранён; проверьте актуальное название перед повторным редактированием.");
      return onUpdate(current, { name: editing.name.trim() });
    }, "Справочник обновлён", () => onChange({ ...draft, editing: null }));
  }
  return <section className="emu-reference-block emu-catalog-reference-block">
    <div className="emu-reference-heading"><div><h4>{title}</h4><span>{items.filter(item => item.isActive).length} активно · {items.filter(item => !item.isActive).length} скрыто</span></div><em>{items.length}</em></div>
    <div className="emu-catalog-create"><label>Добавить запись<input aria-label={`Новая запись: ${title}`} value={name} onChange={event => onChange({ ...draft, name: event.target.value })} placeholder="Введите название" /></label>
      <button disabled={!name.trim()} type="button" onClick={() => void session.run(() => onCreate(name.trim()), "Справочник обновлён", () => onChange({ ...draft, name: "" }))}>Добавить</button>
    </div>
    <label className="emu-catalog-search">Поиск по справочнику<input value={search} onChange={event => onChange({ ...draft, search: event.target.value })} placeholder="Начните вводить название" /></label>
    <div className="emu-reference-list">{rows.map(item => <div className={`emu-reference-row ${item.isActive ? "is-active" : "is-hidden"}`} key={item.id}>
      {editing?.item.id === item.id ? <input value={editing.name} onChange={event => onChange({ ...draft, editing: { ...editing, name: event.target.value } })} aria-label={`Название ${title}`} /> : <span className="emu-reference-name">{item.name}</span>}
      <em className={`emu-reference-state ${item.isActive ? "is-active" : "is-hidden"}`}>{protectSystemOther && isSystemOtherSection(item) ? "системный" : item.isActive ? "активно" : "скрыто"}</em>
      <div className="emu-reference-actions">{editing?.item.id === item.id ? <>
        <button disabled={!editing.name.trim() || editing.name === editing.item.name} onClick={saveEdit} type="button">Сохранить</button>
        <button onClick={() => session.requestLeave(() => onChange({ ...draft, editing: null }))} type="button">Отмена</button>
      </> : <>
        <button onClick={() => {
          const edit = () => onChange({ ...draft, editing: { item: { ...item }, name: item.name } });
          if (editing && editing.name !== editing.item.name) session.requestLeave(edit); else edit();
        }} type="button">Изменить</button>
        <button disabled={protectSystemOther && isSystemOtherSection(item) && item.isActive} onClick={() => void session.run(() => onUpdate(item, { isActive: !item.isActive }), "Справочник обновлён")} type="button">{item.isActive ? "Скрыть" : "Вернуть"}</button>
      </>}</div>
    </div>)}{rows.length === 0 ? <div className="emu-empty-state">{items.length ? "По запросу ничего не найдено" : "Записей пока нет. Добавьте первую запись."}</div> : null}</div>
  </section>;
}
