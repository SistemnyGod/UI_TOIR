import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type {
  InventoryFacetDto,
  InventoryItemDto,
  InventorySettingsDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import type { ScreenId } from "../../types";


import { ItemFormDialog } from "./items/ItemFormDialog";
import { ItemDetailDialog, ConfirmHideDialog } from "./items/ItemReadDialogs";
import type { InventoryRepository } from "../../repositories/inventoryRepository";
import { useInventoryCatalog } from "./items/useInventoryCatalog";
import { itemFormToPayload, itemToPayload, type ItemFormState } from "./items/catalogItemModel";
import { renderItemIcon, getItemTone, getTrackingLabel, formatMoney } from "./items/itemPresentation";
import { PhoneDisclosure } from "../../shared/ui/PhoneDisclosure";

type InventoryItemsScreenProps = {
  initialSettings?: InventorySettingsDto;
  canManage?: boolean;
  canIssue?: boolean;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
};

export function InventoryItemsScreen(props: InventoryItemsScreenProps) {
  const repository = useInventoryRepository();
  const owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <ItemsWorkspace key={`${owner.current.revision}:${props.canManage !== false}`} repository={repository} {...props} />;
}

function ItemsWorkspace({ initialSettings, onNavigate, onNotify, canManage = true, canIssue = true, repository }: InventoryItemsScreenProps & { repository: InventoryRepository }) {
  const { settings, facets, hasFacets, items, filters, query, setQuery, loading, lookupsLoading, error, selectedItemId, setSelectedItemId, refresh, updateFilters, resetFilters, saving, writeItem } = useInventoryCatalog(repository, initialSettings);
  const [formState, setFormState] = useState<{ mode: "create" | "edit"; item?: InventoryItemDto } | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItemDto | null>(null);
  const [hideItem, setHideItem] = useState<InventoryItemDto | null>(null);
  const searchRef = useRef<HTMLInputElement>(null), cardOpener = useRef<HTMLElement | null>(null);
  function openCard(item: InventoryItemDto) {
    cardOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailItem(structuredClone(item));
  }
  function closeCard() {
    const opener = cardOpener.current;
    setDetailItem(null);
    // A hidden item can disappear from the active list while its card is open.
    requestAnimationFrame(() => { if (!opener?.isConnected) searchRef.current?.focus({ preventScroll: true }); });
  }

  const selectedItem = useMemo(
    () => items.rows.find((item) => item.id === selectedItemId) ?? items.rows[0] ?? null,
    [items.rows, selectedItemId],
  );

  const categoryCounts = useMemo(() => createCountMap(facets.categories), [facets.categories]);
  const kindFacets = facets.itemKinds;

  function startCreate() { if (canManage) setFormState({ mode: "create" }); }
  function startEdit(item: InventoryItemDto) { if (canManage) setFormState({ mode: "edit", item: structuredClone(item) }); }
  async function submitItem(form: ItemFormState) {
    if (!canManage || !formState) return false;
    const saved = await writeItem(formState.item, itemFormToPayload(form));
    if (!saved) return false;
    if (detailItem?.id === saved.id) setDetailItem(saved);
    setFormState(null); onNotify(formState.mode === "edit" ? "Позиция обновлена" : "Позиция создана");
    return true;
  }
  async function confirmHideItem() {
    if (!canManage || !hideItem) return false;
    const saved = await writeItem(hideItem, itemToPayload(hideItem, { isActive: false }));
    if (!saved) return false;
    if (detailItem?.id === saved.id) setDetailItem(saved);
    setHideItem(null); onNotify("Позиция скрыта из активной номенклатуры");
    return true;
  }

  function issueItem(item: InventoryItemDto) {
    if (!canIssue) return;
    try {
      window.sessionStorage.setItem("patrol360.inventory.pendingIssueItemName", item.name);
      window.sessionStorage.setItem("patrol360.inventory.pendingIssueItemId", item.id);
    } catch {
      onNotify("Браузер не разрешил подготовить выдачу. Откройте раздел выдачи и выберите позицию вручную.");
      return;
    }
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
          <button className="inventory-btn inventory-btn-ghost" type="button" onClick={refresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            Обновить
          </button>
          {canManage ? <button className="inventory-btn inventory-btn-primary" type="button" disabled={lookupsLoading && !settings} onClick={startCreate}>
            <Plus size={16} aria-hidden="true" />
            Создать позицию
          </button> : null}
        </div>
      </header>

      <PhoneDisclosure title="Сводка номенклатуры">
      <div className="inventory-items-kpis" aria-label="Сводка номенклатуры">
        <ItemKpi icon={Boxes} label="Всего позиций" value={hasFacets ? facets.total : "—"} hint="в справочнике" />
        <ItemKpi icon={Package} label="Активные" value={hasFacets ? facets.active : "—"} hint="доступны для выдачи" tone="green" />
        <ItemKpi icon={Archive} label="Скрытые" value={hasFacets ? facets.inactive : "—"} hint="не показываются в активном списке" tone="red" />
        <ItemKpi icon={SlidersHorizontal} label="В фильтре" value={items.total} hint="по текущим условиям" tone="blue" />
      </div>

      </PhoneDisclosure>
      <section className="inventory-items-filters" aria-label="Фильтры номенклатуры">
        <label className="inventory-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchRef} aria-label="Поиск по номенклатуре" value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, артикулу, категории, описанию"
          />
        </label>
        <PhoneDisclosure title={`Фильтры · ${[filters.categoryId, filters.trackingType, filters.unitId, filters.status, filters.itemKind].filter(Boolean).length}`}>
        <select aria-label="Категория" value={filters.categoryId} onChange={(event) => updateFilters({ categoryId: event.target.value })}>
          <option value="">Все категории</option>
          {(settings?.categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label="Тип учёта" value={filters.trackingType} onChange={(event) => updateFilters({ trackingType: event.target.value })}>
          <option value="">Все типы учета</option>
          <option value="quantity">Количественный</option>
          <option value="identifier">Инвентарный</option>
          <option value="custody">Под запись</option>
        </select>
        <select aria-label="Единица измерения" value={filters.unitId} onChange={(event) => updateFilters({ unitId: event.target.value })}>
          <option value="">Все единицы</option>
          {(settings?.units ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <select aria-label="Статус позиции" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="active">Активные</option>
          <option value="">Все статусы</option>
          <option value="inactive">Скрытые</option>
        </select>
        <button className="inventory-btn inventory-btn-ghost" type="button" onClick={resetFilters}>
          <RefreshCw size={16} aria-hidden="true" />
          Сбросить
        </button>
        </PhoneDisclosure>
      </section>

      {error ? (
        <div className="inventory-items-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}{items.rows.length ? " Показаны последние загруженные данные." : ""}</span>
          <button type="button" className="inventory-btn inventory-btn-ghost" onClick={refresh}>Повторить загрузку</button>
        </div>
      ) : null}

      <div className="inventory-items-workspace">
        <PhoneDisclosure title="Категории и виды учёта">
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
        </PhoneDisclosure>

        <section className="inventory-items-table-card" aria-busy={loading}>
          <div className="inventory-table-head">
            <div>
              <h2>Каталог позиций</h2>
              <p>
                {items.total} позиций{hasFacets ? ` из ${facets.total}` : ""}
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

          {loading && items.rows.length > 0 ? <p className="visually-hidden" role="status">Обновляем каталог… Показаны предыдущие данные.</p> : null}
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
                {loading && items.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="inventory-table-empty">Загрузка номенклатуры...</div>
                    </td>
                  </tr>
                ) : null}
                {!loading && !error && items.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="inventory-table-empty">По текущим фильтрам позиций нет</div>
                    </td>
                  </tr>
                ) : null}
                {items.rows.map((item) => (
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
                            <small>{item.comment || item.normItemName || "Без примечания"}</small>
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
                            <IconButton label="Открыть карточку" onClick={() => openCard(item)}>
                              <Eye size={16} aria-hidden="true" />
                            </IconButton>
                            {canManage ? <IconButton label="Редактировать" onClick={() => startEdit(item)}>
                              <Pencil size={16} aria-hidden="true" />
                            </IconButton> : null}
                            {canIssue ? <IconButton label="Выдать" onClick={() => issueItem(item)}>
                              <Send size={16} aria-hidden="true" />
                            </IconButton> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
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
                disabled={loading || filters.page <= 1}
                onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
                aria-label="Предыдущая страница"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                className="inventory-icon-btn"
                type="button"
                disabled={loading || filters.page >= pageCount}
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
          onEdit={canManage ? startEdit : undefined}
          onHide={canManage ? item => setHideItem(structuredClone(item)) : undefined}
          onIssue={canIssue ? issueItem : undefined}
          onOpen={openCard}
        />
      </div>

      {formState && canManage ? (
        <ItemFormDialog
          item={formState.item}
          mode={formState.mode}
          saving={saving}
          settings={settings}
          onClose={() => setFormState(null)}
          onSubmit={submitItem}
        />
      ) : null}

      {detailItem ? <ItemDetailDialog item={detailItem} onClose={closeCard} onEdit={canManage ? startEdit : undefined} onHide={canManage ? item => setHideItem(structuredClone(item)) : undefined} /> : null}

      {hideItem && canManage ? (
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
  value: number | "—";
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
  onEdit?: (item: InventoryItemDto) => void;
  onHide?: (item: InventoryItemDto) => void;
  onIssue?: (item: InventoryItemDto) => void;
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
        {onEdit ? <button className="inventory-btn inventory-btn-ghost" type="button" onClick={() => onEdit(item)}>
          <Pencil size={16} aria-hidden="true" />
          Редактировать
        </button> : null}
        {onIssue ? <button className="inventory-btn inventory-btn-ghost" type="button" onClick={() => onIssue(item)}>
          <Send size={16} aria-hidden="true" />
          Выдать
        </button> : null}
        {onHide ? <button className="inventory-btn inventory-btn-danger" type="button" onClick={() => onHide(item)} disabled={!item.isActive}>
          <Archive size={16} aria-hidden="true" />
          Скрыть позицию
        </button> : null}
      </div>
    </aside>
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

function createCountMap(facets: InventoryFacetDto[]) {
  return new Map(facets.map((facet) => [facet.id, facet.count]));
}
