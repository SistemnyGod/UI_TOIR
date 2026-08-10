import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { matchesPpeSearchText, rankPpeCatalogItemsForNorm } from "./ppe/ppeNormSearch";

type Props = {
  initialSearch?: string;
  onNotify: (message: string) => void;
};

const statusLabel: Record<InventoryPpeNormSetDto["status"], string> = {
  active: "Действует",
  archived: "Архив",
  draft: "Черновик",
};

export function PpeNormSetsAdmin({ initialSearch = "", onNotify }: Props) {
  const repository = useInventoryRepository();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<InventoryPpeNormSetDto[]>([]);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [publishingId, setPublishingId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [details, setDetails] = useState<Record<string, InventoryPpeNormSetDetailDto>>({});
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [catalogItems, setCatalogItems] = useState<InventoryItemDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mappingRowId, setMappingRowId] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await repository.getPpeNormSets({ page: 1, pageSize: 100, query: search.trim() || undefined });
      setRows(response.rows);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить нормативные наборы");
    } finally {
      setLoading(false);
    }
  }, [repository, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Для импорта выберите файл Excel в формате .xlsx");
      return;
    }
    try {
      setImporting(true);
      setError("");
      const result = await repository.importPpeNormSetsDraft(file);
      onNotify(`Импорт завершен: ${result.normSetsCreated} наборов, ${result.itemsCreated} позиций`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось импортировать нормы СИЗ");
    } finally {
      setImporting(false);
    }
  }

  async function publish(row: InventoryPpeNormSetDto) {
    if (!reviewedIds.includes(row.id)) {
      setError("Перед публикацией подтвердите, что набор проверен");
      return;
    }
    try {
      setPublishingId(row.id);
      setError("");
      await repository.publishPpeNormSet(row.id, { confirmReviewed: true, expectedVersion: row.version });
      onNotify(`Нормативный набор «${row.positionName}» опубликован`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось опубликовать нормативный набор");
    } finally {
      setPublishingId("");
    }
  }

  async function loadCatalog() {
    if (catalogItems.length > 0 || catalogLoading) return;
    setCatalogLoading(true);
    try {
      const first = await repository.getPpeItems({ page: 1, pageSize: 100 });
      const rest = await Promise.all(Array.from({ length: Math.max(0, first.pageCount - 1) }, (_, index) =>
        repository.getPpeItems({ page: index + 2, pageSize: 100 })));
      setCatalogItems([first, ...rest].flatMap((page) => page.rows));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function toggleDetails(row: InventoryPpeNormSetDto) {
    if (expandedId === row.id) {
      setExpandedId("");
      return;
    }
    setExpandedId(row.id);
    setCategoryFilter("all");
    if (details[row.id]) {
      void loadCatalog();
      return;
    }
    try {
      setDetailLoadingId(row.id);
      setError("");
      const detail = await repository.getPpeNormSet(row.id);
      setDetails((current) => ({ ...current, [row.id]: detail }));
      await loadCatalog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить строки нормы");
    } finally {
      setDetailLoadingId("");
    }
  }

  async function saveMapping(normSetId: string, normRow: InventoryPpeNormRowDto, itemId: string, isDefault = false) {
    if (!itemId) return;
    const item = catalogItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    try {
      setMappingRowId(normRow.id);
      setError("");
      const mapping = await repository.upsertPpeNormRowMapping(normRow.id, {
        itemId,
        isDefault,
        defaultUnitPriceMinor: item.defaultUnitPriceMinor,
      });
      setDetails((current) => {
        const detail = current[normSetId];
        if (!detail) return current;
        const nextRows = detail.rows.map((candidate) => candidate.id !== normRow.id ? candidate : {
          ...candidate,
          mappings: [mapping, ...candidate.mappings.filter((existing) => existing.itemId !== mapping.itemId).map((existing) => ({ ...existing, isDefault: mapping.isDefault ? false : existing.isDefault }))],
        });
        return {
          ...current,
          [normSetId]: {
            ...detail,
            rows: nextRows,
            mappedItemRowsCount: nextRows.filter((candidate) => candidate.rowType === "item" && candidate.mappings.length > 0).length,
            unmappedItemRowsCount: nextRows.filter((candidate) => candidate.rowType === "item" && candidate.mappings.length === 0).length,
          },
        };
      });
      onNotify("Сопоставление нормы сохранено");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить сопоставление");
    } finally {
      setMappingRowId("");
    }
  }

  const activeCount = rows.filter((row) => row.status === "active").length;
  const draftCount = rows.filter((row) => row.status === "draft").length;
  const reviewCount = rows.filter((row) => row.requiresReview).length;

  return (
    <section className="inventory-ppe-norm-admin">
      <header className="inventory-ppe-norm-admin-head">
        <div>
          <span className="inventory-ppe-section-kicker"><ShieldCheck size={15} /> Нормы выдачи</span>
          <h2>Нормативные наборы СИЗ</h2>
          <p>Импортируйте Excel как черновик, проверьте состав и только затем опубликуйте.</p>
        </div>
        <div className="inventory-ppe-norm-actions">
          <button className="button ghost" disabled={loading} onClick={() => void load()} type="button">
            <RefreshCw size={15} /> Обновить
          </button>
          <button className="button primary" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload size={15} /> {importing ? "Импорт..." : "Импортировать XLSX"}
          </button>
          <input ref={fileInputRef} accept=".xlsx" hidden onChange={importWorkbook} type="file" />
        </div>
      </header>

      <div className="inventory-ppe-norm-kpis">
        <span><small>Всего наборов</small><strong>{rows.length}</strong></span>
        <span className="is-active"><small>Действуют</small><strong>{activeCount}</strong></span>
        <span className="is-draft"><small>Черновики</small><strong>{draftCount}</strong></span>
        <span className="is-review"><small>Требуют проверки</small><strong>{reviewCount}</strong></span>
      </div>

      <div className="inventory-ppe-norm-search">
        <Search aria-hidden="true" size={17} />
        <input
          aria-label="Поиск по нормам СИЗ"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Должность, вид СИЗ, пункт нормы — например: зимняя обувь"
          type="search"
          value={search}
        />
        {search ? <button className="button ghost" onClick={() => setSearch("")} type="button">Сбросить</button> : null}
      </div>

      {error ? <div className="inventory-ppe-norm-message is-error">{error}</div> : null}
      {loading ? <div className="inventory-ppe-norm-message">Загружаем нормативные наборы...</div> : null}
      {!loading && !rows.length ? (
        <div className="inventory-ppe-norm-empty">
          <ShieldCheck size={26} />
          <strong>Нормативные наборы пока не загружены</strong>
          <span>Импортируйте подготовленный XLSX. Данные сначала будут сохранены как черновики.</span>
        </div>
      ) : null}

      <div className="inventory-ppe-norm-set-list">
        {rows.map((row) => {
          const reviewed = reviewedIds.includes(row.id);
          const detail = details[row.id];
          const detailItemRows = detail?.rows.filter((candidate) => candidate.rowType === "item") ?? [];
          const mappedRows = detailItemRows.filter((candidate) => candidate.mappings.length > 0).length;
          const unmappedRows = detailItemRows.length - mappedRows;
          return (
            <article className={`inventory-ppe-norm-set is-${row.status}`} key={row.id}>
              <div className="inventory-ppe-norm-set-main">
                <span className={`inventory-ppe-norm-status is-${row.status}`}>{statusLabel[row.status]}</span>
                <h3>{row.positionName}</h3>
                <p>{row.versionName || "Без названия версии"} · {row.rowsCount} строк</p>
                <small>Источник: {row.sourceName || "не указан"}</small>
              </div>
              <div className="inventory-ppe-norm-set-meta">
                <span>Действует с <b>{formatDate(row.effectiveFrom)}</b></span>
                <span>Версия <b>{row.version}</b></span>
              </div>
              <div className="inventory-ppe-norm-publish">
                <button className="button ghost" onClick={() => void toggleDetails(row)} type="button">
                  {expandedId === row.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {detailLoadingId === row.id ? "Загрузка строк..." : expandedId === row.id ? "Скрыть категории" : "Открыть категории и сопоставление"}
                </button>
                {row.status === "draft" ? (
                  <div className="inventory-ppe-norm-publish-actions">
                    <div className={`inventory-ppe-norm-readiness ${detail ? "is-loaded" : ""}`}>
                      {detail ? <><strong>{mappedRows} из {detailItemRows.length} строк сопоставлены</strong><span>{unmappedRows ? `${unmappedRows} строк потребуют ручного выбора номенклатуры при выдаче.` : "Все нормативные строки имеют хотя бы одно соответствие."}</span></> : <><strong>Сначала проверьте состав набора</strong><span>Откройте категории и сопоставления перед публикацией.</span></>}
                    </div>
                    <label>
                      <input
                        checked={reviewed}
                        disabled={!detail}
                        onChange={(event) => setReviewedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                        type="checkbox"
                      />
                      Проверил нормативный состав и периодичность
                    </label>
                    <button className="button primary" disabled={!detail || !reviewed || publishingId === row.id} onClick={() => void publish(row)} type="button">
                      <CheckCircle2 size={15} /> {publishingId === row.id ? "Публикация..." : "Опубликовать"}
                    </button>
                  </div>
                ) : null}
              </div>
              {expandedId === row.id && details[row.id] ? <NormSetDetails detail={details[row.id]} catalogItems={catalogItems} catalogLoading={catalogLoading} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} onSaveMapping={(normRow, itemId, isDefault) => void saveMapping(row.id, normRow, itemId, isDefault)} mappingRowId={mappingRowId} /> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NormSetDetails({
  detail,
  catalogItems,
  catalogLoading,
  categoryFilter,
  onCategoryChange,
  onSaveMapping,
  mappingRowId,
}: {
  detail: InventoryPpeNormSetDetailDto;
  catalogItems: InventoryItemDto[];
  catalogLoading: boolean;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string, isDefault?: boolean) => void;
  mappingRowId: string;
}) {
  const [normSearch, setNormSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const normalizedCatalogSearch = catalogSearch.trim().toLocaleLowerCase("ru");
  const groups = detail.rows.filter((row) => row.rowType === "group");
  const matchesNorm = (row: InventoryPpeNormRowDto) => matchesPpeSearchText([row.normItemName, row.normPoint, row.issuePeriodText], normSearch);
  const visibleGroups = groups.filter((group) => {
    if (categoryFilter !== "all" && group.id !== categoryFilter) return false;
    return !normSearch.trim() || matchesNorm(group) || detail.rows.some((row) => row.parentRowId === group.id && row.rowType === "item" && matchesNorm(row));
  });
  const ungrouped = detail.rows.filter((row) => row.rowType === "item" && !row.parentRowId && categoryFilter === "all" && matchesNorm(row));
  const filteredCatalogItems = useMemo(() => {
    if (!normalizedCatalogSearch) return catalogItems;
    return catalogItems.filter((item) => [item.name, item.sku, item.article, item.modelName, item.brandName]
      .filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(normalizedCatalogSearch));
  }, [catalogItems, normalizedCatalogSearch]);

  return (
    <div className="inventory-ppe-norm-details">
      <div className="inventory-ppe-norm-detail-summary">
        <span><b>{detail.itemRowsCount}</b> строк СИЗ</span>
        <span className="is-ready"><b>{detail.mappedItemRowsCount}</b> сопоставлено</span>
        <span className={detail.unmappedItemRowsCount ? "is-warning" : "is-ready"}><b>{detail.unmappedItemRowsCount}</b> требуют выбора</span>
      </div>
      <div className="inventory-ppe-norm-detail-toolbar">
        <label><Search size={14} /><span>Категория ГОСТ</span>
          <select value={categoryFilter} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="all">Все категории</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.normItemName}</option>)}
          </select>
        </label>
        <label><Search size={14} /><span>Найти норму</span><input onChange={(event) => setNormSearch(event.target.value)} placeholder="Обувь, зимняя, п. 4.7…" type="search" value={normSearch} /></label>
        <label><Search size={14} /><span>Номенклатура</span><input onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Название, артикул, модель…" type="search" value={catalogSearch} /></label>
        <small>{catalogLoading ? "Загружаем каталог СИЗ…" : `Показано ${filteredCatalogItems.length} из ${catalogItems.length} позиций`}</small>
      </div>
      <div className="inventory-ppe-norm-category-list">
        {ungrouped.length ? <NormCategoryRows title="Без категории" rows={ungrouped} catalogItems={filteredCatalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} /> : null}
        {visibleGroups.map((group) => <NormCategoryRows key={group.id} title={group.normItemName} rows={detail.rows.filter((row) => row.parentRowId === group.id && row.rowType === "item" && matchesNorm(row))} catalogItems={filteredCatalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} />)}
        {!ungrouped.length && !visibleGroups.length ? <div className="inventory-ppe-norm-message">По заданному поиску нормативные строки не найдены.</div> : null}
      </div>
    </div>
  );
}

function NormCategoryRows({
  title,
  rows,
  catalogItems,
  onSaveMapping,
  mappingRowId,
}: {
  title: string;
  rows: InventoryPpeNormRowDto[];
  catalogItems: InventoryItemDto[];
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string, isDefault?: boolean) => void;
  mappingRowId: string;
}) {
  if (!rows.length) return null;
  return (
    <section className="inventory-ppe-norm-category">
      <header><strong>{title}</strong><span>{rows.length} позиций</span></header>
      <div className="inventory-ppe-norm-row-list">
        {rows.map((row) => {
          const defaultMapping = row.mappings.find((mapping) => mapping.isDefault) ?? row.mappings[0];
          const mappedIds = new Set(row.mappings.map((mapping) => mapping.itemId));
          const selectableItems = catalogItems.filter((item) => !mappedIds.has(item.id));
          return (
            <div className="inventory-ppe-norm-row" key={row.id}>
              <div className="inventory-ppe-norm-row-copy">
                <strong>{row.normItemName}</strong>
                <small>{row.quantityText || "Количество не распознано"}{row.lifeMonths ? ` · ${row.lifeMonths} мес.` : ""}</small>
                <small className="is-point">{row.normPoint || "Основание не указано"}</small>
              </div>
              {row.mappings.length ? <div className="inventory-ppe-norm-mappings" aria-label={`Допустимая номенклатура: ${row.normItemName}`}>
                {row.mappings.map((mapping) => <span className={mapping.isDefault ? "is-default" : ""} key={mapping.id}>
                  <span><strong>{mapping.itemName}</strong><small>{mapping.itemSku || "Без артикула"}</small></span>
                  {mapping.isDefault ? <em>Основное</em> : <button disabled={mappingRowId === row.id} onClick={() => onSaveMapping(row, mapping.itemId, true)} type="button">Сделать основным</button>}
                </span>)}
              </div> : null}
              <NormCatalogSelector
                disabled={mappingRowId === row.id}
                items={selectableItems}
                onSelect={(itemId) => onSaveMapping(row, itemId, row.mappings.length === 0)}
                row={row}
              />
              {mappingRowId === row.id ? <span className="inventory-ppe-norm-row-saving">Сохранение…</span> : defaultMapping ? <span className="inventory-ppe-norm-row-ready">Готово</span> : <span className="inventory-ppe-norm-row-warning">Нужно выбрать</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NormCatalogSelector({
  disabled,
  items,
  onSelect,
  row,
}: {
  disabled: boolean;
  items: InventoryItemDto[];
  onSelect: (itemId: string) => void;
  row: InventoryPpeNormRowDto;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showOther, setShowOther] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => rankPpeCatalogItemsForNorm(row, items, deferredQuery, showOther, showOther ? 40 : 12),
    [deferredQuery, items, row, showOther],
  );

  function select(itemId: string) {
    onSelect(itemId);
    setOpen(false);
    setQuery("");
    setShowOther(false);
  }

  return (
    <div className="inventory-ppe-norm-catalog-selector">
      <button
        aria-expanded={open}
        className="inventory-ppe-norm-catalog-trigger"
        disabled={disabled || !items.length}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Search aria-hidden="true" size={14} />
        {row.mappings.length ? "Добавить допустимый товар" : "Подобрать товар из номенклатуры"}
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {open ? (
        <div className="inventory-ppe-norm-catalog-popover">
          <label>
            <span>Поиск внутри этой нормы</span>
            <input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: сапоги зимние, артикул…"
              type="search"
              value={query}
            />
          </label>
          <div className="inventory-ppe-norm-catalog-result-head">
            <span>{showOther ? "Все найденные позиции" : "Рекомендуемые соответствия"}</span>
            <b>{matches.length}</b>
          </div>
          <div className="inventory-ppe-norm-catalog-results">
            {matches.map(({ item, reasons }) => (
              <button key={item.id} onClick={() => select(item.id)} type="button">
                <span>
                  <strong>{item.name}</strong>
                  <small>{[item.sku || item.article, item.category, item.unit].filter(Boolean).join(" · ") || "Без дополнительных данных"}</small>
                </span>
                <span className="inventory-ppe-norm-match-reasons">
                  {reasons.slice(0, 2).map((reason) => <em className={reason === "Требует ручной проверки" ? "is-warning" : ""} key={reason}>{reason}</em>)}
                </span>
              </button>
            ))}
            {!matches.length ? <p>{query ? "По этому запросу подходящие позиции не найдены." : "Автоматические рекомендации не найдены."}</p> : null}
          </div>
          <button className="inventory-ppe-norm-show-other" onClick={() => setShowOther((current) => !current)} type="button">
            {showOther ? "Показывать только подходящие" : "Показать остальные позиции для ручного выбора"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "не указано";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T00:00:00`));
}
