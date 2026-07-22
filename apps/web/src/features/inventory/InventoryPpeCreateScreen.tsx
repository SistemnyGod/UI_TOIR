import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, FolderPlus, Plus, Save, Search, Trash2 } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeWorkspaceDto,
  UpsertInventoryPpeCardNormRowDto,
  UpsertInventoryPpeNormMappingDto,
} from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { PpeCatalogModal } from "./ppe/PpeCatalogModal";
import { PpeModuleNav } from "./ppe/PpeModuleNav";

type DraftSource = "active_norms" | "previous_card" | "empty";

export function InventoryPpeCreateScreen({ onNavigate, onNotify }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void }) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [employees, setEmployees] = useState<InventoryEmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState(() => window.localStorage.getItem("patrol360.inventory.ppe.employee") ?? "");
  const [cardDate, setCardDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<DraftSource>("active_norms");
  const [draft, setDraft] = useState<InventoryPpeCardDetailDto | null>(null);
  const [rows, setRows] = useState<InventoryPpeCardNormRowDto[]>([]);
  const [mappingRow, setMappingRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [bulkIssued, setBulkIssued] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [error, setError] = useState("");
  const [normWorkspace, setNormWorkspace] = useState<InventoryPpeWorkspaceDto | null>(null);
  const [normWorkspaceLoading, setNormWorkspaceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingEmployees(true);
    repository.getEmployees({ page: 1, pageSize: 50, query: deferredQuery, status: "active" })
      .then((result) => {
        if (cancelled) return;
        setEmployees(result.rows);
        if (!employeeId && result.rows[0]) setEmployeeId(result.rows[0].id);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить сотрудников"); })
      .finally(() => { if (!cancelled) setLoadingEmployees(false); });
    return () => { cancelled = true; };
  }, [deferredQuery, employeeId, repository]);

  useEffect(() => {
    if (!employeeId) {
      setNormWorkspace(null);
      return;
    }
    let cancelled = false;
    setNormWorkspaceLoading(true);
    repository.getPpeWorkspace(employeeId)
      .then((result) => { if (!cancelled) setNormWorkspace(result); })
      .catch(() => { if (!cancelled) setNormWorkspace(null); })
      .finally(() => { if (!cancelled) setNormWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, repository]);

  const groups = useMemo(() => rows.filter((row) => row.rowType === "group"), [rows]);
  const itemRows = useMemo(() => rows.filter((row) => row.rowType === "item"), [rows]);
  const mappedRows = useMemo(() => itemRows.filter((row) => row.mappedItemId), [itemRows]);
  const unmappedRows = itemRows.length - mappedRows.length;
  const futureDate = cardDate > new Date().toISOString().slice(0, 10);

  async function createDraft() {
    if (!employeeId) return setError("Выберите сотрудника");
    setSaving(true);
    setError("");
    try {
      const created = await repository.createPpeCardDraft({
        cardDate: new Date(`${cardDate}T12:00:00`).toISOString(),
        employeeId,
        source,
      });
      setDraft(created);
      setRows([...(created.normRows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
      window.localStorage.setItem("patrol360.inventory.ppe.employee", employeeId);
      onNotify("Черновик карточки создан");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать черновик");
    } finally {
      setSaving(false);
    }
  }

  function addRow(rowType: "group" | "item") {
    const row: InventoryPpeCardNormRowDto = {
      brandModelArticle: "",
      coverageStatus: "not_issued",
      defaultUnitPriceMinor: null,
      id: crypto.randomUUID(),
      issuePeriodText: "",
      issuedQuantity: 0,
      lifeMonths: null,
      mappedItemId: null,
      mappedItemName: "",
      mappings: [],
      normItemName: rowType === "group" ? "Новая группа" : "Новая строка СИЗ",
      normPoint: "",
      parentRowId: null,
      quantity: rowType === "group" ? 0 : 1,
      quantityText: rowType === "group" ? "" : "1 шт.",
      rowType,
      sortOrder: rows.length,
      sourceNormRowId: null,
    };
    setRows((current) => [...current, row]);
  }

  function patchRow(id: string, patch: Partial<InventoryPpeCardNormRowDto>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function moveRow(id: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((row, sortOrder) => ({ ...row, sortOrder }));
    });
  }

  async function saveRows() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const saved = await repository.updatePpeCardNormRows(draft.id, {
        expectedVersion: draft.version ?? 0,
        rows: rows.map(toPayload),
      });
      setDraft(saved);
      setRows([...(saved.normRows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
      onNotify("Порядок, группы и строки карточки сохранены");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить конструктор");
    } finally {
      setSaving(false);
    }
  }

  async function saveMapping(item: InventoryItemDto, mapping: UpsertInventoryPpeNormMappingDto) {
    if (!mappingRow) return;
    if (mappingRow.sourceNormRowId) await repository.upsertPpeNormRowMapping(mappingRow.sourceNormRowId, mapping);
    patchRow(mappingRow.id, {
      brandModelArticle: mapping.brandModelArticle ?? "",
      defaultUnitPriceMinor: mapping.defaultUnitPriceMinor ?? item.defaultUnitPriceMinor ?? null,
      mappedItemId: item.id,
      mappedItemName: item.name,
    });
    onNotify("Номенклатура выбрана. Выдача не создана.");
  }

  async function issueSelected() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const saved = await repository.updatePpeCardNormRows(draft.id, {
        expectedVersion: draft.version ?? 0,
        rows: rows.map(toPayload),
      });
      const selectedSourceRows = rows.filter((row) => bulkIssued.has(row.id) && row.mappedItemId);
      const selectedRows = (saved.normRows ?? []).filter((row) =>
        selectedSourceRows.some((sourceRow) =>
          sourceRow.id === row.id ||
          (sourceRow.sortOrder === row.sortOrder && sourceRow.normItemName === row.normItemName),
        ),
      );
      if (!selectedRows.length) throw new Error("Нет отмеченных сопоставленных строк для выдачи");
      setDraft(saved);
      setRows([...(saved.normRows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
      let expectedVersion = saved.version ?? 0;
      for (const row of selectedRows) {
        await repository.createPpeIssue(saved.id, {
          brandModelArticle: row.brandModelArticle,
          cardNormRowId: row.id,
          expectedVersion,
          issueMethod: "personal",
          issuedAt: new Date(`${cardDate}T12:00:00`).toISOString(),
          itemId: row.mappedItemId!,
          quantity: row.quantity,
          unitPriceMinor: row.defaultUnitPriceMinor,
        });
        expectedVersion += 1;
      }
      window.localStorage.setItem("patrol360.inventory.ppe.employee", employeeId);
      onNotify(`Проведено выдач: ${selectedRows.length}`);
      onNavigate("inventory-ppe");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось провести отмеченные выдачи");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ppe-v2-screen">
      <header className="ppe-v2-page-head"><div><span className="ppe-v2-eyebrow">Бухгалтерия / СИЗ</span><h1>Создать карточку СИЗ</h1><p>Выберите источник, сформируйте группы и строки, затем подтвердите фактическую выдачу.</p></div><PpeModuleNav active="inventory-ppe-create" onNavigate={onNavigate} /></header>
      <ol aria-label="Этапы создания карточки" className="ppe-v2-create-progress">
        <li className={!draft ? "is-current" : "is-complete"}><span>1</span><div><strong>Сотрудник и источник</strong><small>{draft ? "Заполнено" : "Текущий этап"}</small></div></li>
        <li className={draft && !bulkIssued.size ? "is-current" : draft ? "is-complete" : ""}><span>2</span><div><strong>Состав карточки</strong><small>{draft ? (bulkIssued.size ? "Состав подготовлен" : "Проверьте нормы") : "Следующий этап"}</small></div></li>
        <li className={bulkIssued.size ? "is-current" : ""}><span>3</span><div><strong>Фактическая выдача</strong><small>{bulkIssued.size ? `Выбрано: ${bulkIssued.size}` : "После проверки"}</small></div></li>
      </ol>
      {!draft ? (
        <section className="ppe-v2-create-start">
          <div className="ppe-v2-create-form">
            <div className="ppe-v2-section-title"><span>Шаг 1</span><div><h2>Сотрудник и дата</h2><small>Выберите владельца личной карточки СИЗ.</small></div></div>
            <label className="ppe-v2-search"><Search size={17} /><input aria-label="Поиск сотрудника" onChange={(event) => setQuery(event.target.value)} placeholder="Найти сотрудника" value={query} /></label>
            <label>Сотрудник<select disabled={loadingEmployees} onChange={(event) => setEmployeeId(event.target.value)} value={employeeId}><option value="">Выберите сотрудника</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.personnelNo}</option>)}</select></label>
            <label>Дата карточки<input onChange={(event) => setCardDate(event.target.value)} type="date" value={cardDate} /></label>
            {futureDate ? <p className="ppe-v2-warning">Дата находится в будущем. Это предупреждение не блокирует создание.</p> : null}
          </div>
          <div className="ppe-v2-source-grid">
            <div className="ppe-v2-section-title"><span>Шаг 2</span><div><h2>Источник норм</h2><small>Нормы должности рекомендуются для новой карточки.</small></div></div>
            <button className={source === "active_norms" ? "is-selected is-recommended" : ""} onClick={() => setSource("active_norms")} type="button"><strong>Действующие нормы <em>Рекомендуется</em></strong><span>Создать неизменяемый снимок опубликованного набора должности.</span></button>
            <button className={source === "previous_card" ? "is-selected" : ""} onClick={() => setSource("previous_card")} type="button"><strong>Предыдущая карточка</strong><span>Скопировать структуру без фактов выдачи.</span></button>
            <button className={source === "empty" ? "is-selected" : ""} onClick={() => setSource("empty")} type="button"><strong>Пустая карточка</strong><span>Начать без групп и строк. Пустая карточка допустима.</span></button>
            {source === "active_norms" ? (
              <div className={"ppe-v2-norm-source " + (normWorkspace?.activeNormSet ? "is-ready" : "is-missing")}>
                {normWorkspaceLoading ? <span>Проверяем нормы должности…</span> : normWorkspace?.activeNormSet ? (
                  <><strong>Набор норм найден</strong><span>{normWorkspace.activeNormSet.positionName} · версия {normWorkspace.activeNormSet.versionName}</span><small>{normWorkspace.activeNormSet.rowsCount} строк · источник: {normWorkspace.activeNormSet.sourceName}</small></>
                ) : <><strong>Для должности нет опубликованных норм</strong><span>Импортируйте и опубликуйте набор либо выберите предыдущую или пустую карточку.</span></>}
              </div>
            ) : null}
          </div>
          {error ? <p className="ppe-v2-error">{error}</p> : null}
          <footer className="ppe-v2-create-actions"><button className="button primary" disabled={saving || !employeeId || (source === "active_norms" && !normWorkspaceLoading && !normWorkspace?.activeNormSet)} onClick={() => void createDraft()} type="button">{saving ? "Создание…" : "Создать черновик"}</button></footer>
        </section>
      ) : (
        <section className="ppe-v2-constructor">
          <header className="ppe-v2-constructor-head"><div><span className="ppe-v2-eyebrow">Черновик карточки</span><h2>{draft.employeeName}</h2><p>{draft.position} · {formatLocalDate(draft.createdAt)} · версия {draft.version ?? 0}</p></div><div><button className="button" onClick={() => addRow("group")} type="button"><FolderPlus size={16} /> Добавить группу</button><button className="button" onClick={() => addRow("item")} type="button"><Plus size={16} /> Добавить строку</button><button className="button primary" disabled={saving} onClick={() => void saveRows()} type="button"><Save size={16} /> Сохранить</button></div></header>
          <div className="ppe-v2-constructor-summary">
            <span><small>Группы</small><strong>{groups.length}</strong></span>
            <span><small>Строки СИЗ</small><strong>{itemRows.length}</strong></span>
            <span className="is-ready"><small>Сопоставлено</small><strong>{mappedRows.length}</strong></span>
            <span className={unmappedRows ? "is-warning" : "is-ready"}><small>Требует выбора</small><strong>{unmappedRows}</strong></span>
          </div>
          <div className="ppe-v2-bulk-bar"><div><CheckSquare size={18} /><span>Отметьте только фактически выданные позиции. Несопоставленные строки нельзя провести.</span></div><button className="button" disabled={!mappedRows.length} onClick={() => setBulkIssued(new Set(mappedRows.map((row) => row.id)))} type="button">Отметить сопоставленные</button><button className="button" disabled={!bulkIssued.size} onClick={() => setBulkIssued(new Set())} type="button">Снять отметки</button><button className="button primary" disabled={!bulkIssued.size || saving} onClick={() => void issueSelected()} type="button">Провести выдачу ({bulkIssued.size})</button></div>
          <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-constructor-table"><thead><tr><th>Порядок</th><th>Тип / группа</th><th>Наименование</th><th>Пункт норм</th><th>Периодичность</th><th>Количество</th><th>Номенклатура</th><th>Выдано</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr className={row.rowType === "group" ? "ppe-v2-group-row" : ""} key={row.id}><td><div className="ppe-v2-order-buttons"><button aria-label="Вверх" disabled={index === 0} onClick={() => moveRow(row.id, -1)} type="button"><ArrowUp size={15} /></button><button aria-label="Вниз" disabled={index === rows.length - 1} onClick={() => moveRow(row.id, 1)} type="button"><ArrowDown size={15} /></button></div></td><td><select onChange={(event) => patchRow(row.id, { rowType: event.target.value as "group" | "item", parentRowId: null })} value={row.rowType}><option value="item">Строка</option><option value="group">Группа</option></select>{row.rowType === "item" ? <select aria-label="Группа строки" onChange={(event) => patchRow(row.id, { parentRowId: event.target.value || null })} value={row.parentRowId ?? ""}><option value="">Без группы</option>{groups.filter((group) => group.id !== row.id).map((group) => <option key={group.id} value={group.id}>{group.normItemName}</option>)}</select> : null}</td><td><textarea onChange={(event) => patchRow(row.id, { normItemName: event.target.value })} rows={row.rowType === "group" ? 2 : 3} value={row.normItemName} /></td><td>{row.rowType === "item" ? <textarea onChange={(event) => patchRow(row.id, { normPoint: event.target.value })} rows={2} value={row.normPoint} /> : "—"}</td><td>{row.rowType === "item" ? <input onChange={(event) => patchRow(row.id, { issuePeriodText: event.target.value })} value={row.issuePeriodText} /> : "—"}</td><td>{row.rowType === "item" ? <><input inputMode="decimal" onChange={(event) => patchRow(row.id, { quantity: Number(event.target.value.replace(",", ".")) || 0 })} value={row.quantity} /><input onChange={(event) => patchRow(row.id, { quantityText: event.target.value })} placeholder="1 шт." value={row.quantityText} /></> : "—"}</td><td>{row.rowType === "item" ? <button className={"ppe-v2-link-button " + (!row.mappedItemId ? "is-required" : "")} onClick={() => setMappingRow(row)} type="button">{row.mappedItemName || "Выбрать СИЗ"}</button> : "—"}</td><td>{row.rowType === "item" ? <input aria-label={`Выдано ${row.normItemName}`} checked={bulkIssued.has(row.id)} disabled={!row.mappedItemId} onChange={(event) => setBulkIssued((current) => { const next = new Set(current); event.target.checked ? next.add(row.id) : next.delete(row.id); return next; })} type="checkbox" /> : "—"}</td><td><button aria-label="Удалить строку" className="ppe-v2-icon-button is-danger" onClick={() => setRows((current) => current.filter((candidate) => candidate.id !== row.id).map((candidate, sortOrder) => ({ ...candidate, parentRowId: candidate.parentRowId === row.id ? null : candidate.parentRowId, sortOrder })))} type="button"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
          {!rows.length ? <div className="ppe-v2-state"><strong>Карточка пока пустая</strong><span>Добавьте строку или группу либо оставьте карточку пустой.</span></div> : null}
          {error ? <p className="ppe-v2-error">{error}</p> : null}
        </section>
      )}
      {mappingRow ? <PpeCatalogModal normRow={mappingRow} onClose={() => setMappingRow(null)} onConfirm={saveMapping} /> : null}
    </section>
  );
}

function toPayload(row: InventoryPpeCardNormRowDto, sortOrder: number): UpsertInventoryPpeCardNormRowDto {
  return { brandModelArticle: row.brandModelArticle, defaultUnitPriceMinor: row.defaultUnitPriceMinor, id: row.id, issuePeriodText: row.issuePeriodText, lifeMonths: row.lifeMonths, mappedItemId: row.mappedItemId, normItemName: row.normItemName, normPoint: row.normPoint, parentRowId: row.parentRowId, quantity: row.quantity, quantityText: row.quantityText, rowType: row.rowType, sortOrder, sourceNormRowId: row.sourceNormRowId };
}
function formatLocalDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU"); }
