import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  DatabaseZap,
  Layers3,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  InventoryDbHealthDto,
  InventoryDbHealthIssueDto,
  InventoryItemDto,
  InventoryItemSetDto,
  InventoryReferenceOptionDto,
  InventorySettingsDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventorySettingsScreenProps = {
  error?: string;
  items?: InventoryItemDto[];
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload?: () => Promise<void>;
  settings?: InventorySettingsDto;
};

type SettingsTab = "references" | "norms" | "sets" | "health";
type ReferenceKind =
  | "category"
  | "unit"
  | "warehouse"
  | "custodyCategory"
  | "returnReason"
  | "writeOffReason"
  | "employeePosition"
  | "employeeDepartment"
  | "employeeGroup";
type ReferenceModalState = { kind: ReferenceKind; row?: InventoryReferenceOptionDto } | null;
type NormModalState = { row?: InventorySettingsDto["positionNorms"][number] } | null;
type ItemSetModalState = { row?: InventoryItemSetDto } | null;

const derivedReferenceId = "00000000-0000-0000-0000-000000000000";

const referenceLabels: Record<ReferenceKind, string> = {
  category: "Группа номенклатуры",
  custodyCategory: "Категория под запись",
  returnReason: "Причина возврата",
  unit: "Единица измерения",
  warehouse: "Место учета",
  writeOffReason: "Причина списания",
  employeePosition: "Должность сотрудника",
  employeeDepartment: "Подразделение сотрудника",
  employeeGroup: "Основная группа сотрудника",
};

export function InventorySettingsScreen({
  error,
  items = [],
  loading = false,
  onNotify,
  onReload,
  settings,
}: InventorySettingsScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [tab, setTab] = useState<SettingsTab>("references");
  const [referenceModal, setReferenceModal] = useState<ReferenceModalState>(null);
  const [normModal, setNormModal] = useState<NormModalState>(null);
  const [itemSetModal, setItemSetModal] = useState<ItemSetModalState>(null);
  const [localSettings, setLocalSettings] = useState<InventorySettingsDto | undefined>(settings);
  const [settingsLoading, setSettingsLoading] = useState(!settings);
  const [settingsError, setSettingsError] = useState<string | undefined>(error);
  const [itemsForEditors, setItemsForEditors] = useState<InventoryItemDto[]>(items);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [health, setHealth] = useState<InventoryDbHealthDto | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const mountedRef = useRef(true);
  const reloadSettings = useCallback(async () => {
    const nextSettings = await inventoryRepository.getSettings();
    setLocalSettings(nextSettings);
    await onReload?.();
  }, [inventoryRepository, onReload]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setSettingsLoading(true);
    setSettingsError(undefined);
    inventoryRepository
      .getSettings()
      .then((response) => {
        if (mounted) setLocalSettings(response);
      })
      .catch((loadError) => {
        if (mounted) setSettingsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить настройки Inventory");
      })
      .finally(() => {
        if (mounted) setSettingsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository]);

  useEffect(() => {
    if (error) setSettingsError(error);
  }, [error]);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  async function ensureEditorItems() {
    if (itemsForEditors.length > 0 || itemsLoading) return;

    setItemsLoading(true);
    try {
      const response = await inventoryRepository.getItems({ pageSize: 2000, status: "active" });
      if (mountedRef.current) setItemsForEditors(response.rows);
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось загрузить номенклатуру для редактора");
    } finally {
      if (mountedRef.current) setItemsLoading(false);
    }
  }

  function openNormModal(modal: Exclude<NormModalState, null>) {
    setNormModal(modal);
    void ensureEditorItems();
  }

  function openItemSetModal(modal: Exclude<ItemSetModalState, null>) {
    setItemSetModal(modal);
    void ensureEditorItems();
  }

  useEffect(() => {
    if (tab !== "health" || health) return;

    let mounted = true;
    setHealthLoading(true);
    inventoryRepository
      .getDbHealth()
      .then((response) => {
        if (mounted) setHealth(response);
      })
      .catch(() => {
        if (mounted) setHealth(null);
      })
      .finally(() => {
        if (mounted) setHealthLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [health, inventoryRepository, tab]);

  const effectiveSettings = useMemo(() => normalizeSettings(localSettings), [localSettings]);
  const isLoading = loading || settingsLoading;
  const stats = useMemo(() => {
    if (!effectiveSettings) return { references: 0, norms: 0, sets: 0, activeSets: 0 };
    return {
      activeSets: effectiveSettings.itemSets.filter((row) => row.isActive).length,
      norms: effectiveSettings.positionNorms.length,
      references:
        effectiveSettings.categories.length +
        effectiveSettings.units.length +
        effectiveSettings.warehouses.length +
        effectiveSettings.custodyCategories.length +
        effectiveSettings.returnReasons.length +
        effectiveSettings.writeOffReasons.length +
        effectiveSettings.employeePositions.length +
        effectiveSettings.employeeDepartments.length +
        effectiveSettings.employeeGroups.length,
      sets: effectiveSettings.itemSets.length,
    };
  }, [effectiveSettings]);

  async function toggleReference(kind: ReferenceKind, row: InventoryReferenceOptionDto) {
    try {
      if (kind === "warehouse") {
        await inventoryRepository.updateWarehouse(row.id, {
          isArchived: row.isActive,
          isDefault: row.code === "default",
          name: row.name,
        });
      }
      if (kind === "custodyCategory") {
        await inventoryRepository.updateCustodyCategory(row.id, { isArchived: row.isActive, name: row.name });
      }
      if (kind === "returnReason") {
        await inventoryRepository.updateReturnReason(row.id, { isArchived: row.isActive, name: row.name });
      }
      if (kind === "writeOffReason") {
        await inventoryRepository.updateWriteOffReason(row.id, { isArchived: row.isActive, name: row.name });
      }
      if (kind === "employeePosition") {
        await inventoryRepository.updateEmployeeReference("position", row.id, { isArchived: row.isActive, name: row.name });
      }
      if (kind === "employeeDepartment") {
        await inventoryRepository.updateEmployeeReference("department", row.id, { isArchived: row.isActive, name: row.name });
      }
      if (kind === "employeeGroup") {
        await inventoryRepository.updateEmployeeReference("group", row.id, { isArchived: row.isActive, name: row.name });
      }

      onNotify(row.isActive ? "Запись перенесена в архив" : "Запись восстановлена");
      await reloadSettings();
    } catch (toggleError) {
      onNotify(toggleError instanceof Error ? toggleError.message : "Не удалось обновить справочник");
    }
  }

  async function toggleItemSet(row: InventoryItemSetDto) {
    try {
      await inventoryRepository.updateItemSet(row.id, { isArchived: row.isActive, name: row.name });
      onNotify(row.isActive ? "Набор перенесен в архив" : "Набор восстановлен");
      await reloadSettings();
    } catch (toggleError) {
      onNotify(toggleError instanceof Error ? toggleError.message : "Не удалось обновить набор");
    }
  }

  return (
    <section className="inventory-settings-screen">
      <header className="inventory-settings-commandbar">
        <div className="inventory-settings-title">
          <span className="inventory-settings-title-icon"><Settings size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Настройки учета</h1>
            <span>Справочники, единицы измерения, нормы СИЗ, наборы и причины операций.</span>
          </div>
        </div>
        <div className="inventory-settings-actions">
          <button className="button primary" onClick={() => {
            if (tab === "norms") openNormModal({});
            else if (tab === "sets") openItemSetModal({});
            else setReferenceModal({ kind: "category" });
          }} type="button">
            <Plus size={16} />
            Добавить
          </button>
        </div>
      </header>

      {settingsError ? <SettingsState kind="error" title="API настроек не ответил" text={settingsError} /> : null}
      {isLoading ? <SettingsState kind="loading" title="Загрузка настроек" text="Получаем справочники, нормы и наборы бухгалтерского модуля." /> : null}
      {!isLoading && !settingsError && !effectiveSettings ? <SettingsState kind="empty" title="Настройки недоступны" text="API не вернул данные настроек Inventory." /> : null}

      {!isLoading && !settingsError && effectiveSettings ? (
        <>
          <section className="inventory-settings-kpis" aria-label="Сводка настроек">
            <SettingsKpi label="Справочники" value={stats.references} />
            <SettingsKpi label="Нормы СИЗ" tone="blue" value={stats.norms} />
            <SettingsKpi label="Наборы" tone="green" value={stats.sets} />
            <SettingsKpi label="Активные наборы" value={stats.activeSets} />
          </section>

          <nav className="inventory-settings-tabs" aria-label="Разделы настроек">
            <button className={tab === "references" ? "is-active" : ""} onClick={() => setTab("references")} type="button">Справочники</button>
            <button className={tab === "norms" ? "is-active" : ""} onClick={() => setTab("norms")} type="button">Нормы СИЗ</button>
            <button className={tab === "sets" ? "is-active" : ""} onClick={() => setTab("sets")} type="button">Наборы</button>
            <button className={tab === "health" ? "is-active" : ""} onClick={() => setTab("health")} type="button">Состояние базы</button>
          </nav>

          {tab === "references" ? (
            <section className="inventory-settings-reference-grid">
              <ReferenceCard kind="category" rows={effectiveSettings.categories} title="Группы номенклатуры" onCreate={() => setReferenceModal({ kind: "category" })} onEdit={(row) => setReferenceModal({ kind: "category", row })} />
              <ReferenceCard kind="unit" rows={effectiveSettings.units} title="Единицы измерения" onCreate={() => setReferenceModal({ kind: "unit" })} onEdit={(row) => setReferenceModal({ kind: "unit", row })} />
              <ReferenceCard kind="warehouse" rows={effectiveSettings.warehouses} title="Места учета" onCreate={() => setReferenceModal({ kind: "warehouse" })} onEdit={(row) => setReferenceModal({ kind: "warehouse", row })} onToggle={(row) => void toggleReference("warehouse", row)} />
              <ReferenceCard kind="custodyCategory" rows={effectiveSettings.custodyCategories} title="Категории под запись" onCreate={() => setReferenceModal({ kind: "custodyCategory" })} onEdit={(row) => setReferenceModal({ kind: "custodyCategory", row })} onToggle={(row) => void toggleReference("custodyCategory", row)} />
              <ReferenceCard kind="returnReason" rows={effectiveSettings.returnReasons} title="Причины возврата" onCreate={() => setReferenceModal({ kind: "returnReason" })} onEdit={(row) => setReferenceModal({ kind: "returnReason", row })} onToggle={(row) => void toggleReference("returnReason", row)} />
              <ReferenceCard kind="writeOffReason" rows={effectiveSettings.writeOffReasons} title="Причины списания" onCreate={() => setReferenceModal({ kind: "writeOffReason" })} onEdit={(row) => setReferenceModal({ kind: "writeOffReason", row })} onToggle={(row) => void toggleReference("writeOffReason", row)} />
              <ReferenceCard kind="employeePosition" rows={effectiveSettings.employeePositions} title="Должности сотрудников" onCreate={() => setReferenceModal({ kind: "employeePosition" })} onEdit={(row) => setReferenceModal({ kind: "employeePosition", row })} onToggle={(row) => row.id !== derivedReferenceId ? void toggleReference("employeePosition", row) : undefined} />
              <ReferenceCard kind="employeeDepartment" rows={effectiveSettings.employeeDepartments} title="Подразделения сотрудников" onCreate={() => setReferenceModal({ kind: "employeeDepartment" })} onEdit={(row) => setReferenceModal({ kind: "employeeDepartment", row })} onToggle={(row) => row.id !== derivedReferenceId ? void toggleReference("employeeDepartment", row) : undefined} />
              <ReferenceCard kind="employeeGroup" rows={effectiveSettings.employeeGroups} title="Общие группы" onCreate={() => setReferenceModal({ kind: "employeeGroup" })} onEdit={(row) => setReferenceModal({ kind: "employeeGroup", row })} onToggle={(row) => row.id !== derivedReferenceId ? void toggleReference("employeeGroup", row) : undefined} />
            </section>
          ) : null}

          {tab === "norms" ? <NormsPanel norms={effectiveSettings.positionNorms} onCreate={() => openNormModal({})} onEdit={(row) => openNormModal({ row })} /> : null}
          {tab === "sets" ? <ItemSetsPanel itemSets={effectiveSettings.itemSets} onCreate={() => openItemSetModal({})} onEdit={(row) => openItemSetModal({ row })} onToggle={(row) => void toggleItemSet(row)} /> : null}
          {tab === "health" ? <HealthPanel health={health} loading={healthLoading} /> : null}
        </>
      ) : null}

      {referenceModal && effectiveSettings ? (
        <ReferenceModal categories={effectiveSettings.categories} modal={referenceModal} onClose={() => setReferenceModal(null)} onNotify={onNotify} onReload={reloadSettings} />
      ) : null}
      {normModal && effectiveSettings ? (
        <NormModal items={itemsForEditors} itemsLoading={itemsLoading} modal={normModal} onClose={() => setNormModal(null)} onNotify={onNotify} onReload={reloadSettings} />
      ) : null}
      {itemSetModal && effectiveSettings ? (
        <ItemSetModal items={itemsForEditors} itemsLoading={itemsLoading} modal={itemSetModal} onClose={() => setItemSetModal(null)} onNotify={onNotify} onReload={reloadSettings} />
      ) : null}
    </section>
  );
}

function normalizeSettings(settings?: InventorySettingsDto) {
  if (!settings) return undefined;
  return {
    ...settings,
    categories: settings.categories ?? [],
    custodyCategories: settings.custodyCategories ?? [],
    employeeDepartments: settings.employeeDepartments ?? [],
    employeeGroups: settings.employeeGroups ?? [],
    employeePositions: settings.employeePositions ?? [],
    itemSets: settings.itemSets ?? [],
    positionNorms: settings.positionNorms ?? [],
    returnReasons: settings.returnReasons ?? [],
    units: settings.units ?? [],
    warehouses: settings.warehouses ?? [],
    writeOffReasons: settings.writeOffReasons ?? [],
  };
}

function ReferenceCard({
  kind,
  onCreate,
  onEdit,
  onToggle,
  rows,
  title,
}: {
  kind: ReferenceKind;
  onCreate: () => void;
  onEdit: (row: InventoryReferenceOptionDto) => void;
  onToggle?: (row: InventoryReferenceOptionDto) => void;
  rows: InventoryReferenceOptionDto[];
  title: string;
}) {
  return (
    <article className="inventory-settings-card">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{referenceHint(kind)}</p>
        </div>
        <span>{rows.length}</span>
      </header>
      {!rows.length ? (
        <SettingsState kind="empty" title="Пока пусто" text="Создайте первую запись через кнопку добавления." compact />
      ) : (
        <ul>
          {rows.map((row) => {
            const isDerived = row.id === derivedReferenceId;
            return (
              <li key={`${kind}-${row.id}-${row.name}`}>
                <div>
                  <strong>{row.name}</strong>
                  <small>{isDerived ? "из сотрудников" : row.code || "без кода"}</small>
                </div>
                <span className={`inventory-settings-status ${row.isActive ? "active" : "archived"}`}>
                  {row.isActive ? "Активно" : "Архив"}
                </span>
                <div className="inventory-settings-row-actions">
                  <button className="button ghost" disabled={isDerived} onClick={() => onEdit(row)} title={isDerived ? "Значение создано из карточек сотрудников" : "Редактировать"} type="button">
                    <Pencil size={14} />
                  </button>
                  {onToggle ? (
                    <button className="button ghost" disabled={isDerived} onClick={() => onToggle(row)} type="button">
                      {row.isActive ? <Archive size={14} /> : <RotateCcw size={14} />}
                      {row.isActive ? "Архив" : "Вернуть"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer>
        <button className="button ghost" onClick={onCreate} type="button">
          <Plus size={14} />
          Добавить
        </button>
      </footer>
    </article>
  );
}

function NormsPanel({
  norms,
  onCreate,
  onEdit,
}: {
  norms: InventorySettingsDto["positionNorms"];
  onCreate: () => void;
  onEdit: (row: InventorySettingsDto["positionNorms"][number]) => void;
}) {
  return (
    <section className="inventory-settings-table-card">
      <div className="inventory-settings-panel-head">
        <div>
          <h2>Нормы СИЗ по должности</h2>
          <p>{norms.length} записей для автоматического заполнения карточек</p>
        </div>
        <button className="button primary" onClick={onCreate} type="button">
          <Plus size={16} />
          Добавить норму
        </button>
      </div>
      {!norms.length ? (
        <SettingsState kind="empty" title="Нормы СИЗ не заданы" text="Добавьте нормы по должности, позиции, количеству и сроку службы." />
      ) : (
        <div className="inventory-settings-table-wrap">
          <table className="inventory-settings-table">
            <thead>
              <tr>
                <th>Должность</th>
                <th>Позиция</th>
                <th>Количество</th>
                <th>Срок</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {norms.map((norm) => (
                <tr key={norm.id}>
                  <td>{norm.positionName}</td>
                  <td>{norm.itemName}</td>
                  <td>{formatQuantity(norm.quantity)}</td>
                  <td>{norm.lifeMonths ? `${norm.lifeMonths} мес.` : "не задан"}</td>
                  <td>
                    <button className="button ghost" onClick={() => onEdit(norm)} type="button">
                      <Pencil size={14} />
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ItemSetsPanel({
  itemSets,
  onCreate,
  onEdit,
  onToggle,
}: {
  itemSets: InventoryItemSetDto[];
  onCreate: () => void;
  onEdit: (row: InventoryItemSetDto) => void;
  onToggle: (row: InventoryItemSetDto) => void;
}) {
  if (!itemSets.length) {
    return (
      <section className="inventory-settings-table-card">
        <div className="inventory-settings-panel-head">
          <div><h2>Наборы выдачи</h2><p>Типовые комплекты для СИЗ и выдачи</p></div>
          <button className="button primary" onClick={onCreate} type="button"><Plus size={16} />Создать набор</button>
        </div>
        <SettingsState kind="empty" title="Наборов пока нет" text="Создайте набор и заполните его позициями номенклатуры." />
      </section>
    );
  }

  return (
    <section className="inventory-settings-reference-grid">
      {itemSets.map((itemSet) => (
        <article className="inventory-settings-card" key={itemSet.id}>
          <header>
            <div>
              <h2>{itemSet.name}</h2>
              <p>{itemSet.itemsCount ? `${itemSet.itemsCount} позиций в составе` : "Состав набора пуст"}</p>
            </div>
            <span>{itemSet.itemsCount}</span>
          </header>
          <footer>
            <span className={`inventory-settings-status ${itemSet.isActive ? "active" : "archived"}`}>
              {itemSet.isActive ? "Активный" : "Архив"}
            </span>
            <div className="inventory-settings-row-actions">
              <button className="button ghost" onClick={() => onEdit(itemSet)} type="button">
                <Pencil size={14} />
                Состав
              </button>
              <button className="button ghost" onClick={() => onToggle(itemSet)} type="button">
                {itemSet.isActive ? <Archive size={14} /> : <RotateCcw size={14} />}
                {itemSet.isActive ? "Архив" : "Вернуть"}
              </button>
            </div>
          </footer>
        </article>
      ))}
      <article className="inventory-settings-card inventory-settings-add-card">
        <button className="button primary" onClick={onCreate} type="button">
          <Plus size={16} />
          Создать набор
        </button>
      </article>
    </section>
  );
}

function HealthPanel({ health, loading }: { health: InventoryDbHealthDto | null; loading: boolean }) {
  if (loading) {
    return <SettingsState kind="loading" title="Проверяем базу" text="Получаем диагностику справочников, legacy_id и остатков." />;
  }
  if (!health) {
    return <SettingsState kind="empty" title="Диагностика недоступна" text="API проверки базы пока не вернул данные." />;
  }

  return (
    <section className="inventory-settings-table-card">
      <div className="inventory-settings-panel-head">
        <div>
          <h2>Состояние базы</h2>
          <p>Проверка от {formatDate(health.createdAt)}</p>
        </div>
      </div>
      <section className="inventory-settings-kpis">
        <SettingsKpi label="Замечаний" value={health.issueCount} />
        <SettingsKpi label="Критичные" tone="red" value={health.criticalCount} />
        <SettingsKpi label="Предупреждения" value={health.warningCount} />
      </section>
      {!health.issues.length ? (
        <SettingsState kind="empty" title="Критичных проблем не найдено" text="Диагностика не обнаружила дублей legacy_id и отрицательных остатков." />
      ) : (
        <div className="inventory-settings-health-list">
          {health.issues.map((issue) => (
            <article key={issue.key}>
              <DatabaseZap size={18} />
              <div>
                <strong>{healthTitle(issue)}</strong>
                <span>{healthDescription(issue)}</span>
              </div>
              <em>{issue.count}</em>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReferenceModal({
  categories,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  categories: InventoryReferenceOptionDto[];
  modal: Exclude<ReferenceModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const [kind, setKind] = useState<ReferenceKind>(modal.kind);
  const [name, setName] = useState(modal.row?.name ?? "");
  const [code, setCode] = useState(modal.row?.code ?? "");
  const [parentId, setParentId] = useState("");
  const [isDefault, setIsDefault] = useState(modal.row?.code === "default");
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(modal.row);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      const trimmedName = name.trim();
      if (kind === "category") {
        if (modal.row) await inventoryRepository.updateCategory(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName, parentId: parentId || null });
        else await inventoryRepository.createCategory({ name: trimmedName, parentId: parentId || null });
      }
      if (kind === "unit") {
        if (modal.row) await inventoryRepository.updateUnit(modal.row.id, { name: trimmedName, symbol: code.trim() });
        else await inventoryRepository.createUnit({ name: trimmedName, symbol: code.trim() });
      }
      if (kind === "warehouse") {
        if (modal.row) await inventoryRepository.updateWarehouse(modal.row.id, { isArchived: !modal.row.isActive, isDefault, name: trimmedName });
        else await inventoryRepository.createWarehouse({ isDefault, name: trimmedName });
      }
      if (kind === "custodyCategory") {
        if (modal.row) await inventoryRepository.updateCustodyCategory(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createCustodyCategory({ name: trimmedName });
      }
      if (kind === "returnReason") {
        if (modal.row) await inventoryRepository.updateReturnReason(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createReturnReason({ name: trimmedName });
      }
      if (kind === "writeOffReason") {
        if (modal.row) await inventoryRepository.updateWriteOffReason(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createWriteOffReason({ name: trimmedName });
      }
      if (kind === "employeePosition") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("position", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("position", { name: trimmedName });
      }
      if (kind === "employeeDepartment") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("department", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("department", { name: trimmedName });
      }
      if (kind === "employeeGroup") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("group", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("group", { name: trimmedName });
      }

      onNotify(isEdit ? "Справочник обновлен" : "Справочник создан");
      onClose();
      await onReload();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить справочник");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsModal title={isEdit ? "Редактирование справочника" : "Новая запись справочника"} icon={<Layers3 size={20} />} onClose={onClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)}>
        <label>Тип
          <select disabled={isEdit} value={kind} onChange={(event) => setKind(event.target.value as ReferenceKind)}>
            <option value="category">Группа номенклатуры</option>
            <option value="unit">Единица измерения</option>
            <option value="warehouse">Место учета</option>
            <option value="custodyCategory">Категория под запись</option>
            <option value="returnReason">Причина возврата</option>
            <option value="writeOffReason">Причина списания</option>
            <option value="employeePosition">Должность сотрудника</option>
            <option value="employeeDepartment">Подразделение сотрудника</option>
            <option value="employeeGroup">Основная группа сотрудника</option>
          </select>
        </label>
        <label>Название
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder={`Введите название: ${referenceLabels[kind].toLowerCase()}`} />
        </label>
        {kind === "unit" ? (
          <label>Обозначение
            <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="Например: шт, пара, компл" />
          </label>
        ) : null}
        {kind === "category" ? (
          <label>Родительская группа
            <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Без родительской группы</option>
              {categories.filter((row) => row.id !== modal.row?.id && row.isActive).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === "warehouse" ? (
          <label className="inventory-settings-check">
            <input checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} type="checkbox" />
            Место учета по умолчанию
          </label>
        ) : null}
        <footer>
          <button className="button ghost" onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || !name.trim() || (kind === "unit" && !code.trim())} type="submit">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </footer>
      </form>
    </SettingsModal>
  );
}

function NormModal({
  items,
  itemsLoading,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  items: InventoryItemDto[];
  itemsLoading: boolean;
  modal: Exclude<NormModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const activeItems = useMemo(() => items.filter((item) => item.isActive).sort((left, right) => left.name.localeCompare(right.name, "ru")), [items]);
  const [form, setForm] = useState({
    itemId: modal.row?.itemId ?? "",
    lifeMonths: modal.row?.lifeMonths?.toString() ?? "",
    positionName: modal.row?.positionName ?? "",
    quantity: modal.row?.quantity?.toString() ?? "1",
  });
  const [saving, setSaving] = useState(false);
  const quantityValue = Number(form.quantity.replace(",", "."));
  const quantityValid = Number.isFinite(quantityValue) && quantityValue > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      await inventoryRepository.upsertPositionNorm({
        itemId: form.itemId,
        lifeMonths: parseOptionalNumber(form.lifeMonths),
        positionName: form.positionName.trim(),
        quantity: Number(form.quantity.replace(",", ".")),
      });
      onNotify("Норма СИЗ сохранена");
      onClose();
      await onReload();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить норму");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsModal title="Норма СИЗ" icon={<ShieldCheck size={20} />} onClose={onClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)}>
        <label>Должность
          <input required value={form.positionName} onChange={(event) => setForm((value) => ({ ...value, positionName: event.target.value }))} placeholder="Например: Водитель погрузчика" />
        </label>
        <label>Позиция номенклатуры
          <select required disabled={itemsLoading} value={form.itemId} onChange={(event) => setForm((value) => ({ ...value, itemId: event.target.value }))}>
            <option value="">{itemsLoading ? "Загрузка позиций..." : "Выберите позицию"}</option>
            {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="inventory-settings-modal-grid">
          <label>Количество
            <input required value={form.quantity} onChange={(event) => setForm((value) => ({ ...value, quantity: event.target.value }))} />
          </label>
          <label>Срок, мес.
            <input value={form.lifeMonths} onChange={(event) => setForm((value) => ({ ...value, lifeMonths: event.target.value }))} />
          </label>
        </div>
        <footer>
          <button className="button ghost" onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || itemsLoading || !form.positionName.trim() || !form.itemId || !quantityValid} type="submit">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </footer>
      </form>
    </SettingsModal>
  );
}

function ItemSetModal({
  items,
  itemsLoading,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  items: InventoryItemDto[];
  itemsLoading: boolean;
  modal: Exclude<ItemSetModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const activeItems = useMemo(() => items.filter((item) => item.isActive).sort((left, right) => left.name.localeCompare(right.name, "ru")), [items]);
  const [name, setName] = useState(modal.row?.name ?? "");
  const [rows, setRows] = useState<Array<{ itemId: string; quantity: string }>>([]);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(modal.row));
  const [saving, setSaving] = useState(false);
  const rowsAreValid = rows.every((row) => {
    const quantity = Number(row.quantity.replace(",", "."));
    return row.itemId && Number.isFinite(quantity) && quantity > 0;
  });

  useEffect(() => {
    if (!modal.row) return;

    let mounted = true;
    setLoadingDetail(true);
    inventoryRepository
      .getItemSet(modal.row.id)
      .then((detail) => {
        if (!mounted) return;
        setName(detail.name);
        setRows(detail.items.map((row) => ({ itemId: row.item.id, quantity: row.quantity.toString() })));
      })
      .catch((loadError) => {
        if (mounted) onNotify(loadError instanceof Error ? loadError.message : "Не удалось загрузить состав набора");
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository, modal.row, onNotify]);

  function addRow() {
    const nextItem = activeItems.find((item) => !rows.some((row) => row.itemId === item.id));
    if (!nextItem) return;
    setRows((current) => [...current, { itemId: nextItem.id, quantity: "1" }]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      const itemSet = modal.row
        ? await inventoryRepository.updateItemSet(modal.row.id, { isArchived: !modal.row.isActive, name: name.trim() })
        : await inventoryRepository.createItemSet({ name: name.trim() });

      await inventoryRepository.updateItemSetItems(itemSet.id, {
        items: rows
          .filter((row) => row.itemId)
          .map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity.replace(",", ".")) })),
      });

      onNotify("Набор сохранен");
      onClose();
      await onReload();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить набор");
    } finally {
      setSaving(false);
    }
  }

  const isBusy = loadingDetail || itemsLoading;

  return (
    <SettingsModal wide title={modal.row ? "Состав набора" : "Новый набор"} icon={<PackagePlus size={20} />} onClose={onClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)}>
        <label>Название набора
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Зимний комплект" />
        </label>
        <section className="inventory-settings-set-editor">
          <header>
            <div>
              <h3>Состав</h3>
              <p>{rows.length} позиций</p>
            </div>
            <button className="button ghost" disabled={isBusy || !activeItems.length || rows.length >= activeItems.length} onClick={addRow} type="button">
              <Plus size={14} />
              Добавить позицию
            </button>
          </header>
          {isBusy ? (
            <SettingsState kind="loading" title="Загрузка состава" text="Получаем позиции набора и активную номенклатуру." compact />
          ) : !rows.length ? (
            <SettingsState kind="empty" title="Состав пуст" text="Добавьте позиции номенклатуры и количество." compact />
          ) : (
            <div className="inventory-settings-set-rows">
              {rows.map((row, index) => (
                <div className="inventory-settings-set-row" key={`${row.itemId}-${index}`}>
                  <label>Позиция
                    <select value={row.itemId} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, itemId: event.target.value } : item))}>
                      {activeItems.map((item) => (
                        <option disabled={rows.some((selected, selectedIndex) => selectedIndex !== index && selected.itemId === item.id)} key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Кол-во
                    <input value={row.quantity} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />
                  </label>
                  <button className="button ghost" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <footer>
          <button className="button ghost" onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || isBusy || !name.trim() || !rowsAreValid} type="submit">
            {saving ? "Сохраняем..." : "Сохранить набор"}
          </button>
        </footer>
      </form>
    </SettingsModal>
  );
}

function SettingsModal({
  children,
  icon,
  onClose,
  title,
  wide,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div className="inventory-settings-modal-backdrop" onMouseDown={onClose} role="presentation">
      <article className={`inventory-settings-modal ${wide ? "is-wide" : ""}`} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{icon}</span>
          <h2>{title}</h2>
          <button className="inventory-settings-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        {children}
      </article>
    </div>
  );
}

function SettingsKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-settings-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function SettingsState({ compact, kind, text, title }: { compact?: boolean; kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-settings-state is-${kind} ${compact ? "is-compact" : ""}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function referenceHint(kind: ReferenceKind) {
  const hints: Record<ReferenceKind, string> = {
    category: "Группы для карточек номенклатуры",
    custodyCategory: "Классификация записей ответственности",
    returnReason: "Причины для возвратов имущества",
    unit: "Штуки, пары, комплекты и прочие единицы",
    warehouse: "Места учета движения",
    writeOffReason: "Причины списания и потерь",
    employeePosition: "Справочник должностей для карточек сотрудников",
    employeeDepartment: "Подразделения из общей базы сотрудников",
    employeeGroup: "Общие группы: Атом и Атом Экология",
  };
  return hints[kind];
}

function healthTitle(issue: InventoryDbHealthIssueDto) {
  const map: Record<string, string> = {
    "inventory.stock.negative": "Отрицательные количества",
    "legacy.categories.synthetic_names": "Синтетические категории",
    "legacy.employees.synthetic_names": "Синтетические сотрудники",
    "legacy.items.synthetic_names": "Синтетические названия номенклатуры",
    "legacy.units.synthetic_names": "Синтетические единицы измерения",
    "legacy.warehouses.synthetic_names": "Синтетические места учета",
  };
  return map[issue.key] ?? issue.title;
}

function healthDescription(issue: InventoryDbHealthIssueDto) {
  const map: Record<string, string> = {
    "inventory.stock.negative": "Есть позиции, где расчетное количество ниже нуля.",
    "legacy.categories.synthetic_names": "Остались категории-заглушки из legacy-import.",
    "legacy.employees.synthetic_names": "Остались сотрудники-заглушки из legacy-import.",
    "legacy.items.synthetic_names": "Остались позиции-заглушки из legacy-import.",
    "legacy.units.synthetic_names": "Остались единицы-заглушки из legacy-import.",
    "legacy.warehouses.synthetic_names": "Остались места учета-заглушки из legacy-import.",
  };
  return map[issue.key] ?? issue.description;
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value?: string | null) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}
