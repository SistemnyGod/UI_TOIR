import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  HardHat,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  InventoryFacetDto,
  InventoryItemDto,
  InventoryItemFacetsDto,
  InventoryListResponseDto,
  InventorySettingsDto,
  UpsertInventoryItemDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import type { ScreenId } from "../../types";
import { PpeMovementHistoryPanel } from "./PpeMovementHistoryPanel";
import { PpeButton, PpeModalShell } from "./ppe/PpeUi";

const emptyFacets: InventoryItemFacetsDto = {
  total: 0,
  active: 0,
  inactive: 0,
  categories: [],
  units: [],
  trackingTypes: [],
  itemKinds: [],
};

const emptyItems: InventoryListResponseDto<InventoryItemDto> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
};

type ItemFilters = {
  categoryId: string;
  itemKind: string;
  page: number;
  pageSize: number;
  query: string;
  status: string;
  trackingType: string;
  unitId: string;
};

type ItemFormState = {
  actualItemName: string;
  article: string;
  brandName: string;
  categoryId: string;
  clothingSize: string;
  comment: string;
  defaultLifeMonths: string;
  defaultUnitPrice: string;
  gloveSize: string;
  headSize: string;
  heightSize: string;
  isActive: boolean;
  isConsumable: boolean;
  itemKind: string;
  minStockQty: string;
  modelName: string;
  name: string;
  normItemName: string;
  protectionClass: string;
  respiratorSize: string;
  shoeSize: string;
  sku: string;
  trackingType: string;
  trackLife: boolean;
  unitId: string;
};

type ItemFormErrors = Partial<Record<"name" | "defaultLifeMonths" | "defaultUnitPrice" | "minStockQty", string>>;

type FormMode = "create" | "edit";

export function InventoryItemsScreen({
  initialSettings,
  onNavigate,
  onNotify,
}: {
  initialSettings?: InventorySettingsDto;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  const [settings, setSettings] = useState<InventorySettingsDto | undefined>(initialSettings);
  const [facets, setFacets] = useState<InventoryItemFacetsDto>(emptyFacets);
  const [items, setItems] = useState<InventoryListResponseDto<InventoryItemDto>>(emptyItems);
  const [filters, setFilters] = useState<ItemFilters>({
    categoryId: "",
    itemKind: "",
    page: 1,
    pageSize: 20,
    query: "",
    status: "active",
    trackingType: "",
    unitId: "",
  });
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formState, setFormState] = useState<{ mode: FormMode; item?: InventoryItemDto } | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItemDto | null>(null);
  const [hideItem, setHideItem] = useState<InventoryItemDto | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  useEffect(() => {
    let mounted = true;

    async function loadLookups() {
      try {
        const [nextSettings, nextFacets] = await Promise.all([
          settings ? Promise.resolve(settings) : inventoryRepository.getSettings(),
          inventoryRepository.getItemFacets(),
        ]);
        if (mounted) {
          setSettings(nextSettings);
          setFacets(nextFacets);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить справочники номенклатуры");
        }
      }
    }

    void loadLookups();

    return () => {
      mounted = false;
    };
  }, [inventoryRepository, reloadKey, settings]);

  useEffect(() => {
    let mounted = true;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        const nextItems = await inventoryRepository.getItems({
          categoryId: filters.categoryId || undefined,
          itemKind: filters.itemKind || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
          query: filters.query || undefined,
          status: filters.status || undefined,
          trackingType: filters.trackingType || undefined,
          unitId: filters.unitId || undefined,
        });

        if (!mounted) return;

        setItems(nextItems);
        setSelectedItemId((currentId) => {
          if (nextItems.rows.some((item) => item.id === currentId)) return currentId;
          return nextItems.rows[0]?.id ?? "";
        });
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить номенклатуру");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      mounted = false;
    };
  }, [filters, inventoryRepository, reloadKey]);

  const selectedItem = useMemo(
    () => items.rows.find((item) => item.id === selectedItemId) ?? items.rows[0] ?? null,
    [items.rows, selectedItemId],
  );

  const categoryCounts = useMemo(() => createCountMap(facets.categories), [facets.categories]);
  const kindFacets = facets.itemKinds.length > 0 ? facets.itemKinds : buildSyntheticKindFacets(items.rows);

  function updateFilters(patch: Partial<ItemFilters>) {
    setFilters((value) => ({ ...value, ...patch, page: patch.page ?? 1 }));
  }

  function resetFilters() {
    setFilters({
      categoryId: "",
      itemKind: "",
      page: 1,
      pageSize: 20,
      query: "",
      status: "active",
      trackingType: "",
      unitId: "",
    });
  }

  function refresh() {
    setReloadKey((value) => value + 1);
  }

  function startCreate() {
    setFormState({ mode: "create" });
  }

  function startEdit(item: InventoryItemDto) {
    setFormState({ mode: "edit", item });
  }

  async function submitItem(form: ItemFormState) {
    const payload = itemFormToPayload(form);
    if (!payload.name.trim()) {
      onNotify("Название позиции обязательно");
      return;
    }

    setSaving(true);
    try {
      const saved =
        formState?.mode === "edit" && formState.item
          ? await inventoryRepository.updateItem(formState.item.id, payload)
          : await inventoryRepository.createItem(payload);

      setSelectedItemId(saved.id);
      setFormState(null);
      onNotify(formState?.mode === "edit" ? "Позиция обновлена" : "Позиция создана");
      refresh();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить позицию");
    } finally {
      setSaving(false);
    }
  }

  async function confirmHideItem() {
    if (!hideItem) return;

    setSaving(true);
    try {
      await inventoryRepository.updateItem(hideItem.id, itemToPayload(hideItem, { isActive: false }));
      setHideItem(null);
      onNotify("Позиция скрыта из активной номенклатуры");
      refresh();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось скрыть позицию");
    } finally {
      setSaving(false);
    }
  }

  function issueItem(item: InventoryItemDto) {
    window.sessionStorage.setItem("patrol360.inventory.pendingIssueItemId", item.id);
    window.sessionStorage.setItem("patrol360.inventory.pendingIssueItemName", item.name);
    onNotify(`Позиция "${item.name}" добавлена в черновик выдачи`);
    onNavigate("inventory-issue");
  }

  const pageCount = Math.max(1, items.pageCount || 1);

  return (
    <section className="inventory-items-screen">
      <header className="inventory-items-commandbar">
        <div className="inventory-items-title-block">
          <span className="inventory-items-icon">
            <Package size={24} aria-hidden="true" />
          </span>
          <div>
            <h1>Номенклатура</h1>
            <p>Позиции, категории, единицы учета и карточки для выдачи.</p>
          </div>
        </div>
        <div className="inventory-items-actions">
          <button className="inventory-btn inventory-btn-ghost" type="button" onClick={refresh}>
            <RefreshCw size={16} aria-hidden="true" />
            Обновить
          </button>
          <button className="inventory-btn inventory-btn-primary" type="button" onClick={startCreate}>
            <Plus size={16} aria-hidden="true" />
            Создать позицию
          </button>
        </div>
      </header>

      <div className="inventory-items-kpis" aria-label="Сводка номенклатуры">
        <ItemKpi icon={Boxes} label="Всего позиций" value={facets.total} hint="в справочнике" />
        <ItemKpi icon={Package} label="Активные" value={facets.active} hint="доступны для выдачи" tone="green" />
        <ItemKpi icon={Archive} label="Скрытые" value={facets.inactive} hint="не показываются в активном списке" tone="red" />
        <ItemKpi icon={SlidersHorizontal} label="В фильтре" value={items.total} hint="по текущим условиям" tone="blue" />
      </div>

      <section className="inventory-items-filters" aria-label="Фильтры номенклатуры">
        <label className="inventory-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Поиск по названию, артикулу, категории, описанию"
          />
        </label>
        <select value={filters.categoryId} onChange={(event) => updateFilters({ categoryId: event.target.value })}>
          <option value="">Все категории</option>
          {(settings?.categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select value={filters.trackingType} onChange={(event) => updateFilters({ trackingType: event.target.value })}>
          <option value="">Все типы учета</option>
          <option value="quantity">Количественный</option>
          <option value="identifier">Инвентарный</option>
          <option value="custody">Под запись</option>
        </select>
        <select value={filters.unitId} onChange={(event) => updateFilters({ unitId: event.target.value })}>
          <option value="">Все единицы</option>
          {(settings?.units ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="active">Активные</option>
          <option value="">Все статусы</option>
          <option value="inactive">Скрытые</option>
        </select>
        <button className="inventory-btn inventory-btn-ghost" type="button" onClick={resetFilters}>
          <RefreshCw size={16} aria-hidden="true" />
          Сбросить
        </button>
      </section>

      {error ? (
        <div className="inventory-items-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="inventory-items-workspace">
        <aside className="inventory-items-rail" aria-label="Разделы номенклатуры">
          <RailButton
            active={!filters.categoryId && filters.status === ""}
            count={facets.total}
            label="Все позиции"
            onClick={() => updateFilters({ categoryId: "", status: "" })}
          />
          <RailButton
            active={!filters.categoryId && filters.status === "active"}
            count={facets.active}
            label="Активные"
            onClick={() => updateFilters({ categoryId: "", status: "active" })}
          />
          <RailButton
            active={!filters.categoryId && filters.status === "inactive"}
            count={facets.inactive}
            label="Скрытые"
            onClick={() => updateFilters({ categoryId: "", status: "inactive" })}
          />

          <div className="inventory-rail-divider" />
          <p className="inventory-rail-title">Категории</p>
          {(settings?.categories ?? []).map((category) => (
            <RailButton
              key={category.id}
              active={filters.categoryId === category.id}
              count={categoryCounts.get(category.id) ?? 0}
              label={category.name}
              onClick={() => updateFilters({ categoryId: category.id, status: "" })}
            />
          ))}
          <div className="inventory-rail-divider" />
          <p className="inventory-rail-title">Виды учета</p>
          {kindFacets.map((facet) => (
            <RailButton
              key={facet.id}
              active={filters.itemKind === facet.id}
              count={facet.count}
              label={facet.name || facet.id}
              onClick={() => updateFilters({ itemKind: facet.id })}
            />
          ))}
        </aside>

        <section className="inventory-items-table-card">
          <div className="inventory-table-head">
            <div>
              <h2>Каталог позиций</h2>
              <p>
                {items.total} из {facets.total} позиций
              </p>
            </div>
            <select
              aria-label="Показывать строк"
              value={filters.pageSize}
              onChange={(event) => updateFilters({ pageSize: Number(event.target.value), page: 1 })}
            >
              <option value={20}>20 строк</option>
              <option value={50}>50 строк</option>
              <option value={100}>100 строк</option>
            </select>
          </div>

          <div className="inventory-items-table-wrap">
            <table className="inventory-items-table">
              <thead>
                <tr>
                  <th>Предмет</th>
                  <th>Артикул</th>
                  <th>Категория</th>
                  <th>Ед.</th>
                  <th>Срок</th>
                  <th>Цена</th>
                  <th>Тип учета</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="inventory-table-empty">Загрузка номенклатуры...</div>
                    </td>
                  </tr>
                ) : null}
                {!loading && items.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="inventory-table-empty">По текущим фильтрам позиций нет</div>
                    </td>
                  </tr>
                ) : null}
                {!loading
                  ? items.rows.map((item) => (
                      <tr
                        key={item.id}
                        className={item.id === selectedItem?.id ? "is-selected" : undefined}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <td className="inventory-table-main-cell" data-label="Предмет">
                          <span className={`inventory-item-thumb ${getItemTone(item)}`}>
                            {renderItemIcon(item)}
                          </span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.comment || item.normItemName || "Карточка номенклатуры"}</small>
                          </span>
                        </td>
                        <td data-label="Артикул">{item.article || item.sku || "-"}</td>
                        <td data-label="Категория">{item.category || "-"}</td>
                        <td data-label="Единица">{item.unit || "-"}</td>
                        <td data-label="Срок">{item.defaultLifeMonths ? `${item.defaultLifeMonths} мес.` : "-"}</td>
                        <td data-label="Цена">{formatMoney(item.defaultUnitPriceMinor)}</td>
                        <td data-label="Тип учета">
                          <span className="inventory-chip inventory-chip-blue">{getTrackingLabel(item.trackingType)}</span>
                        </td>
                        <td data-label="Статус">
                          <span className={item.isActive ? "inventory-status active" : "inventory-status inactive"}>
                            {item.isActive ? "Активная" : "Скрыта"}
                          </span>
                        </td>
                        <td data-label="Действия">
                          <div className="inventory-row-actions">
                            <IconButton label="Открыть карточку" onClick={() => setDetailItem(item)}>
                              <Eye size={16} aria-hidden="true" />
                            </IconButton>
                            <IconButton label="Редактировать" onClick={() => startEdit(item)}>
                              <Pencil size={16} aria-hidden="true" />
                            </IconButton>
                            <IconButton label="Выдать" onClick={() => issueItem(item)}>
                              <Send size={16} aria-hidden="true" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>

          <footer className="inventory-items-pagination">
            <span>
              Страница {items.page || 1} из {pageCount}
            </span>
            <div>
              <button
                className="inventory-icon-btn"
                type="button"
                disabled={filters.page <= 1}
                onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
                aria-label="Предыдущая страница"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                className="inventory-icon-btn"
                type="button"
                disabled={filters.page >= pageCount}
                onClick={() => updateFilters({ page: Math.min(pageCount, filters.page + 1) })}
                aria-label="Следующая страница"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>

        <ItemInspector
          item={selectedItem}
          onEdit={startEdit}
          onHide={setHideItem}
          onIssue={issueItem}
          onOpen={setDetailItem}
        />
      </div>

      {formState ? (
        <ItemFormDialog
          item={formState.item}
          mode={formState.mode}
          saving={saving}
          settings={settings}
          onClose={() => setFormState(null)}
          onSubmit={submitItem}
        />
      ) : null}

      {detailItem ? <ItemDetailDialog item={detailItem} onClose={() => setDetailItem(null)} onEdit={startEdit} /> : null}

      {hideItem ? (
        <ConfirmHideDialog
          item={hideItem}
          saving={saving}
          onCancel={() => setHideItem(null)}
          onConfirm={confirmHideItem}
        />
      ) : null}
    </section>
  );
}

function ItemKpi({
  hint,
  icon: Icon,
  label,
  tone = "slate",
  value,
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  tone?: "blue" | "green" | "red" | "slate";
  value: number;
}) {
  return (
    <article className={`inventory-items-kpi tone-${tone}`}>
      <span>
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function RailButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`inventory-rail-button ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function ItemInspector({
  item,
  onEdit,
  onHide,
  onIssue,
  onOpen,
}: {
  item: InventoryItemDto | null;
  onEdit: (item: InventoryItemDto) => void;
  onHide: (item: InventoryItemDto) => void;
  onIssue: (item: InventoryItemDto) => void;
  onOpen: (item: InventoryItemDto) => void;
}) {
  if (!item) {
    return (
      <aside className="inventory-item-inspector">
        <div className="inventory-inspector-empty">
          <Package size={42} aria-hidden="true" />
          <h2>Выберите позицию</h2>
          <p>Карточка справа покажет параметры и быстрые действия.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inventory-item-inspector">
      <div className={`inventory-inspector-icon ${getItemTone(item)}`}>{renderItemIcon(item, 48)}</div>
      <h2>{item.name}</h2>
      <span className={item.isActive ? "inventory-status active wide" : "inventory-status inactive wide"}>
        {item.isActive ? "Активная" : "Скрыта"}
      </span>

      <dl className="inventory-inspector-list">
        <div>
          <dt>Артикул</dt>
          <dd>{item.article || item.sku || "-"}</dd>
        </div>
        <div>
          <dt>Категория</dt>
          <dd>{item.category || "-"}</dd>
        </div>
        <div>
          <dt>Тип учета</dt>
          <dd>{getTrackingLabel(item.trackingType)}</dd>
        </div>
        <div>
          <dt>Единица</dt>
          <dd>{item.unit || "-"}</dd>
        </div>
        <div>
          <dt>Срок службы</dt>
          <dd>{item.defaultLifeMonths ? `${item.defaultLifeMonths} мес.` : "-"}</dd>
        </div>
        <div>
          <dt>Цена</dt>
          <dd>{formatMoney(item.defaultUnitPriceMinor)}</dd>
        </div>
      </dl>

      <section className="inventory-inspector-comment">
        <h3>Описание</h3>
        <p>{item.comment || "Описание пока не заполнено."}</p>
      </section>

      <div className="inventory-inspector-actions">
        <button className="inventory-btn inventory-btn-primary" type="button" onClick={() => onOpen(item)}>
          <Eye size={16} aria-hidden="true" />
          Открыть карточку
        </button>
        <button className="inventory-btn inventory-btn-ghost" type="button" onClick={() => onEdit(item)}>
          <Pencil size={16} aria-hidden="true" />
          Редактировать
        </button>
        <button className="inventory-btn inventory-btn-ghost" type="button" onClick={() => onIssue(item)}>
          <Send size={16} aria-hidden="true" />
          Выдать
        </button>
        <button className="inventory-btn inventory-btn-danger" type="button" onClick={() => onHide(item)} disabled={!item.isActive}>
          <Archive size={16} aria-hidden="true" />
          Скрыть позицию
        </button>
      </div>
    </aside>
  );
}

function ItemFormDialog({
  item,
  mode,
  onClose,
  onSubmit,
  saving,
  settings,
}: {
  item?: InventoryItemDto;
  mode: FormMode;
  onClose: () => void;
  onSubmit: (form: ItemFormState) => Promise<void>;
  saving: boolean;
  settings?: InventorySettingsDto;
}) {
  const [form, setForm] = useState<ItemFormState>(() => (item ? itemToForm(item) : createEmptyForm(settings)));
  const [errors, setErrors] = useState<ItemFormErrors>({});

  function patchForm(patch: Partial<ItemFormState>) {
    setForm((value) => ({ ...value, ...patch }));
    setErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateItemForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    await onSubmit(form);
  }

  const closeSafely = () => {
    if (!saving) onClose();
  };

  return (
    <PpeModalShell
      ariaLabel={mode === "edit" ? "Редактировать позицию номенклатуры" : "Создать позицию номенклатуры"}
      bodyClassName="inventory-item-dialog-body"
      className="inventory-item-form-dialog ppe-inventory-item-modal"
      closeDisabled={saving}
      description="Нормативное и фактическое наименования хранятся раздельно. Поля со звёздочкой обязательны."
      eyebrow="Номенклатура СИЗ"
      footer={(
        <>
          <PpeButton disabled={saving} onClick={closeSafely} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={saving} form="inventory-item-form" icon={<Save size={16} aria-hidden="true" />} loading={saving} type="submit" variant="primary">
            Сохранить позицию
          </PpeButton>
        </>
      )}
      initialFocusSelector="[data-item-initial-focus]"
      onClose={closeSafely}
      title={mode === "edit" ? "Редактировать позицию" : "Создать позицию"}
    >
      <form className="inventory-item-form" id="inventory-item-form" onSubmit={handleSubmit}>
        {Object.keys(errors).length > 0 ? (
          <div className="inventory-item-form-alert" role="alert">
            Проверьте обязательные и числовые поля перед сохранением.
          </div>
        ) : null}

        <div className="inventory-form-grid">
          <div className="inventory-item-form-section wide"><strong>Основные сведения</strong><span>Название, категория и единица используются в каталоге и документах выдачи.</span></div>
          <Field error={errors.name} label="Название" required wide>
            <input aria-invalid={Boolean(errors.name)} data-item-initial-focus required value={form.name} onChange={(event) => patchForm({ name: event.target.value })} />
          </Field>
          <Field label="Артикул / SKU">
            <input value={form.article} onChange={(event) => patchForm({ article: event.target.value, sku: event.target.value })} />
          </Field>
          <Field label="Категория">
            <select value={form.categoryId} onChange={(event) => patchForm({ categoryId: event.target.value })}>
              <option value="">Без категории</option>
              {(settings?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Единица">
            <select value={form.unitId} onChange={(event) => patchForm({ unitId: event.target.value })}>
              <option value="">Не выбрана</option>
              {(settings?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </Field>
          <Field label="Тип учета">
            <select value={form.trackingType} onChange={(event) => patchForm({ trackingType: event.target.value })}>
              <option value="quantity">Количественный</option>
              <option value="identifier">Инвентарный</option>
              <option value="custody">Под запись</option>
            </select>
          </Field>
          <Field label="Вид позиции">
            <input value={form.itemKind} onChange={(event) => patchForm({ itemKind: event.target.value })} placeholder="Например: СИЗОД" />
          </Field>

          <div className="inventory-item-form-section wide"><strong>Норма и конкретное изделие</strong><span>Нормативное название отвечает на вопрос «что положено», фактическое — «что выдаём».</span></div>
          <Field label="Нормативное название" wide>
            <input value={form.normItemName} onChange={(event) => patchForm({ normItemName: event.target.value })} />
          </Field>
          <Field label="Фактическое название" wide>
            <input value={form.actualItemName} onChange={(event) => patchForm({ actualItemName: event.target.value })} />
          </Field>
          <Field label="Марка">
            <input value={form.brandName} onChange={(event) => patchForm({ brandName: event.target.value })} />
          </Field>
          <Field label="Модель">
            <input value={form.modelName} onChange={(event) => patchForm({ modelName: event.target.value })} />
          </Field>
          <Field label="Класс защиты">
            <input value={form.protectionClass} onChange={(event) => patchForm({ protectionClass: event.target.value })} />
          </Field>

          <div className="inventory-item-form-section wide"><strong>Учёт и параметры выдачи</strong><span>Числовые значения должны быть неотрицательными.</span></div>
          <Field error={errors.defaultLifeMonths} label="Срок, мес.">
            <input aria-invalid={Boolean(errors.defaultLifeMonths)} inputMode="numeric" value={form.defaultLifeMonths} onChange={(event) => patchForm({ defaultLifeMonths: event.target.value })} />
          </Field>
          <Field error={errors.defaultUnitPrice} label="Цена, ₽">
            <input aria-invalid={Boolean(errors.defaultUnitPrice)} inputMode="decimal" value={form.defaultUnitPrice} onChange={(event) => patchForm({ defaultUnitPrice: event.target.value })} />
          </Field>
          <Field error={errors.minStockQty} label="Минимальное количество">
            <input aria-invalid={Boolean(errors.minStockQty)} inputMode="decimal" value={form.minStockQty} onChange={(event) => patchForm({ minStockQty: event.target.value })} />
          </Field>
          <Field label="Размерные параметры" wide>
            <div className="inventory-size-grid">
              <input aria-label="Размер одежды" value={form.clothingSize} onChange={(event) => patchForm({ clothingSize: event.target.value })} placeholder="Одежда" />
              <input aria-label="Размер обуви" value={form.shoeSize} onChange={(event) => patchForm({ shoeSize: event.target.value })} placeholder="Обувь" />
              <input aria-label="Размер перчаток" value={form.gloveSize} onChange={(event) => patchForm({ gloveSize: event.target.value })} placeholder="Перчатки" />
              <input aria-label="Размер респиратора" value={form.respiratorSize} onChange={(event) => patchForm({ respiratorSize: event.target.value })} placeholder="Респиратор" />
            </div>
          </Field>
          <Field label="Комментарий" wide>
            <textarea value={form.comment} onChange={(event) => patchForm({ comment: event.target.value })} rows={4} />
          </Field>
          <div className="inventory-toggle-row wide">
            <label><input type="checkbox" checked={form.isConsumable} onChange={(event) => patchForm({ isConsumable: event.target.checked })} />Расходник</label>
            <label><input type="checkbox" checked={form.trackLife} onChange={(event) => patchForm({ trackLife: event.target.checked })} />Контролировать срок</label>
            <label><input type="checkbox" checked={form.isActive} onChange={(event) => patchForm({ isActive: event.target.checked })} />Активная позиция</label>
          </div>
        </div>
      </form>
    </PpeModalShell>
  );
}

function ItemDetailDialog({
  item,
  onClose,
  onEdit,
}: {
  item: InventoryItemDto;
  onClose: () => void;
  onEdit: (item: InventoryItemDto) => void;
}) {
  return (
    <PpeModalShell
      ariaLabel="Карточка позиции номенклатуры"
      className="inventory-detail-dialog ppe-inventory-item-modal"
      description={[item.category, item.article || item.sku].filter(Boolean).join(" · ") || "Карточка позиции"}
      eyebrow="Номенклатура СИЗ"
      footer={(
        <>
          <PpeButton onClick={onClose} variant="ghost">Закрыть</PpeButton>
          <PpeButton icon={<Pencil size={16} aria-hidden="true" />} onClick={() => { onClose(); onEdit(item); }} variant="primary">Редактировать</PpeButton>
        </>
      )}
      onClose={onClose}
      title={item.name}
    >
      <div className="inventory-detail-grid">
        <DetailStat icon={FileText} label="Артикул" value={item.article || item.sku || "-"} />
        <DetailStat icon={Package} label="Категория" value={item.category || "-"} />
        <DetailStat icon={Wrench} label="Тип учета" value={getTrackingLabel(item.trackingType)} />
        <DetailStat icon={HardHat} label="Срок службы" value={item.defaultLifeMonths ? `${item.defaultLifeMonths} мес.` : "-"} />
        <DetailStat icon={Package} label="Цена" value={formatMoney(item.defaultUnitPriceMinor)} />
      </div>
      <section className="inventory-detail-comment">
        <h3>Описание</h3>
        <p>{item.comment || "Описание пока не заполнено."}</p>
      </section>
      <PpeMovementHistoryPanel emptyText="По этому предмету пока нет выдач, возвратов или списаний СИЗ." hideItem itemId={item.id} pageSize={8} title="История движения по предмету" />
    </PpeModalShell>
  );
}

function ConfirmHideDialog({
  item,
  onCancel,
  onConfirm,
  saving,
}: {
  item: InventoryItemDto;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  saving: boolean;
}) {
  const closeSafely = () => {
    if (!saving) onCancel();
  };
  return (
    <PpeModalShell
      ariaLabel="Скрыть позицию номенклатуры"
      className="inventory-confirm-dialog ppe-inventory-confirm-modal"
      closeDisabled={saving}
      description="Позиция останется в базе и истории, но исчезнет из активного каталога."
      eyebrow="Опасное действие"
      footer={(
        <>
          <PpeButton disabled={saving} onClick={closeSafely} variant="ghost">Отмена</PpeButton>
          <PpeButton icon={<Archive size={16} aria-hidden="true" />} loading={saving} onClick={() => void onConfirm()} variant="danger">Скрыть позицию</PpeButton>
        </>
      )}
      onClose={closeSafely}
      title="Скрыть позицию"
    >
      <p className="inventory-confirm-copy">Скрыть <strong>{item.name}</strong> из активной номенклатуры?</p>
    </PpeModalShell>
  );
}
function Field({
  children,
  error,
  label,
  required = false,
  wide = false,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`inventory-field ${wide ? "wide" : ""} ${error ? "has-error" : ""}`.trim()}>
      <span>{label}{required ? <em> *</em> : null}</span>
      {children}
      {error ? <small role="alert">{error}</small> : null}
    </label>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="inventory-detail-stat">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="inventory-icon-btn"
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function createEmptyForm(settings?: InventorySettingsDto): ItemFormState {
  return {
    actualItemName: "",
    article: "",
    brandName: "",
    categoryId: settings?.categories[0]?.id ?? "",
    clothingSize: "",
    comment: "",
    defaultLifeMonths: "",
    defaultUnitPrice: "",
    gloveSize: "",
    headSize: "",
    heightSize: "",
    isActive: true,
    isConsumable: false,
    itemKind: "",
    minStockQty: "",
    modelName: "",
    name: "",
    normItemName: "",
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    trackingType: "quantity",
    trackLife: true,
    unitId: settings?.units[0]?.id ?? "",
  };
}

function itemToForm(item: InventoryItemDto): ItemFormState {
  return {
    actualItemName: item.actualItemName ?? "",
    article: item.article || item.sku || "",
    brandName: item.brandName ?? "",
    categoryId: item.categoryId ?? "",
    clothingSize: item.clothingSize ?? "",
    comment: item.comment ?? "",
    defaultLifeMonths: item.defaultLifeMonths?.toString() ?? "",
    defaultUnitPrice: moneyMinorToInput(item.defaultUnitPriceMinor),
    gloveSize: item.gloveSize ?? "",
    headSize: item.headSize ?? "",
    heightSize: item.heightSize ?? "",
    isActive: item.isActive,
    isConsumable: item.isConsumable,
    itemKind: item.itemKind ?? "",
    minStockQty: item.minStockQty?.toString() ?? "",
    modelName: item.modelName ?? "",
    name: item.name ?? "",
    normItemName: item.normItemName ?? "",
    protectionClass: item.protectionClass ?? "",
    respiratorSize: item.respiratorSize ?? "",
    shoeSize: item.shoeSize ?? "",
    sku: item.sku ?? "",
    trackingType: item.trackingType || "quantity",
    trackLife: item.trackLife,
    unitId: item.unitId ?? "",
  };
}

function validateItemForm(form: ItemFormState): ItemFormErrors {
  const errors: ItemFormErrors = {};
  if (!form.name.trim()) errors.name = "Укажите название позиции";
  if (form.defaultLifeMonths.trim()) {
    const value = Number(form.defaultLifeMonths.replace(",", "."));
    if (!Number.isInteger(value) || value < 0) errors.defaultLifeMonths = "Укажите целое число месяцев от нуля";
  }
  if (form.defaultUnitPrice.trim()) {
    const value = Number(form.defaultUnitPrice.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) errors.defaultUnitPrice = "Цена должна быть неотрицательным числом";
  }
  if (form.minStockQty.trim()) {
    const value = Number(form.minStockQty.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) errors.minStockQty = "Количество должно быть неотрицательным числом";
  }
  return errors;
}
function itemFormToPayload(form: ItemFormState): UpsertInventoryItemDto {
  return {
    actualItemName: trimToNull(form.actualItemName),
    article: trimToNull(form.article || form.sku),
    brandName: trimToNull(form.brandName),
    categoryId: trimToNull(form.categoryId),
    clothingSize: trimToNull(form.clothingSize),
    comment: trimToNull(form.comment),
    defaultLifeMonths: parseOptionalInteger(form.defaultLifeMonths),
    defaultUnitPriceMinor: parseMoneyMinor(form.defaultUnitPrice),
    gloveSize: trimToNull(form.gloveSize),
    headSize: trimToNull(form.headSize),
    heightSize: trimToNull(form.heightSize),
    isActive: form.isActive,
    isConsumable: form.isConsumable,
    itemKind: trimToNull(form.itemKind),
    minStockQty: parseOptionalNumber(form.minStockQty),
    modelName: trimToNull(form.modelName),
    name: form.name.trim(),
    normItemName: trimToNull(form.normItemName),
    protectionClass: trimToNull(form.protectionClass),
    respiratorSize: trimToNull(form.respiratorSize),
    shoeSize: trimToNull(form.shoeSize),
    sku: trimToNull(form.sku || form.article),
    trackingType: trimToNull(form.trackingType) ?? "quantity",
    trackLife: form.trackLife,
    unitId: trimToNull(form.unitId),
  };
}

function itemToPayload(item: InventoryItemDto, patch: Partial<UpsertInventoryItemDto> = {}): UpsertInventoryItemDto {
  return {
    actualItemName: trimToNull(item.actualItemName),
    article: trimToNull(item.article),
    brandName: trimToNull(item.brandName),
    categoryId: item.categoryId,
    clothingSize: trimToNull(item.clothingSize),
    comment: trimToNull(item.comment),
    defaultLifeMonths: item.defaultLifeMonths,
    defaultUnitPriceMinor: item.defaultUnitPriceMinor,
    gloveSize: trimToNull(item.gloveSize),
    headSize: trimToNull(item.headSize),
    heightSize: trimToNull(item.heightSize),
    isActive: item.isActive,
    isConsumable: item.isConsumable,
    itemKind: trimToNull(item.itemKind),
    minStockQty: item.minStockQty,
    modelName: trimToNull(item.modelName),
    name: item.name,
    normItemName: trimToNull(item.normItemName),
    protectionClass: trimToNull(item.protectionClass),
    respiratorSize: trimToNull(item.respiratorSize),
    shoeSize: trimToNull(item.shoeSize),
    sku: trimToNull(item.sku),
    trackingType: trimToNull(item.trackingType) ?? "quantity",
    trackLife: item.trackLife,
    unitId: item.unitId,
    ...patch,
  };
}

function renderItemIcon(item: InventoryItemDto, size = 22) {
  const category = `${item.category} ${item.itemKind}`.toLowerCase();
  if (category.includes("спец") || category.includes("siz") || category.includes("сиз")) {
    return <HardHat size={size} aria-hidden="true" />;
  }
  if (category.includes("инстру") || category.includes("tool")) {
    return <Wrench size={size} aria-hidden="true" />;
  }
  return <Package size={size} aria-hidden="true" />;
}

function getItemTone(item: InventoryItemDto) {
  const category = `${item.category} ${item.itemKind}`.toLowerCase();
  if (category.includes("спец") || category.includes("сиз")) return "tone-violet";
  if (category.includes("инстру")) return "tone-blue";
  return "tone-green";
}

function getTrackingLabel(value: string) {
  if (value === "identifier") return "Инвентарный";
  if (value === "custody") return "Под запись";
  return "Количественный";
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format(0);
  return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format(value / 100);
}

function formatQuantity(value: number, unit: string) {
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Math.max(0, value));
  return `${formatted} ${unit || "шт"}`;
}

function moneyMinorToInput(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function parseMoneyMinor(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function parseOptionalInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function trimToNull(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createCountMap(facets: InventoryFacetDto[]) {
  return new Map(facets.map((facet) => [facet.id, facet.count]));
}

function buildSyntheticKindFacets(rows: InventoryItemDto[]): InventoryFacetDto[] {
  const counts = new Map<string, number>();
  rows.forEach((item) => {
    const key = item.itemKind || "Без вида";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, count]) => ({ id: name, name, count }));
}
