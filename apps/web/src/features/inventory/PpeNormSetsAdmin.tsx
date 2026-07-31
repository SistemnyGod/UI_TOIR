import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";

type Props = {
  onNotify: (message: string) => void;
};

const statusLabel: Record<InventoryPpeNormSetDto["status"], string> = {
  active: "Действует",
  archived: "Архив",
  draft: "Черновик",
};

export function PpeNormSetsAdmin({ onNotify }: Props) {
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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await repository.getPpeNormSets({ page: 1, pageSize: 100 });
      setRows(response.rows);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить нормативные наборы");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void load();
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

  async function saveMapping(normSetId: string, normRow: InventoryPpeNormRowDto, itemId: string) {
    if (!itemId) return;
    const item = catalogItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    try {
      setMappingRowId(normRow.id);
      setError("");
      const mapping = await repository.upsertPpeNormRowMapping(normRow.id, {
        itemId,
        isDefault: true,
        defaultUnitPriceMinor: item.defaultUnitPriceMinor,
      });
      setDetails((current) => {
        const detail = current[normSetId];
        if (!detail) return current;
        const nextRows = detail.rows.map((candidate) => candidate.id !== normRow.id ? candidate : {
          ...candidate,
          mappings: [mapping, ...candidate.mappings.filter((existing) => existing.itemId !== mapping.itemId).map((existing) => ({ ...existing, isDefault: false }))],
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
                    <label>
                      <input
                        checked={reviewed}
                        onChange={(event) => setReviewedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                        type="checkbox"
                      />
                      Набор проверен
                    </label>
                    <button className="button primary" disabled={!reviewed || publishingId === row.id} onClick={() => void publish(row)} type="button">
                      <CheckCircle2 size={15} /> {publishingId === row.id ? "Публикация..." : "Опубликовать"}
                    </button>
                  </div>
                ) : null}
              </div>
              {expandedId === row.id && details[row.id] ? <NormSetDetails detail={details[row.id]} catalogItems={catalogItems} catalogLoading={catalogLoading} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} onSaveMapping={(normRow, itemId) => void saveMapping(row.id, normRow, itemId)} mappingRowId={mappingRowId} /> : null}
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
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string) => void;
  mappingRowId: string;
}) {
  const groups = detail.rows.filter((row) => row.rowType === "group");
  const visibleGroups = groups.filter((group) => categoryFilter === "all" || group.id === categoryFilter);
  const ungrouped = detail.rows.filter((row) => row.rowType === "item" && !row.parentRowId && categoryFilter === "all");

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
        <small>{catalogLoading ? "Загружаем активный каталог СИЗ…" : `В каталоге ${catalogItems.length} активных позиций`}</small>
      </div>
      <div className="inventory-ppe-norm-category-list">
        {ungrouped.length ? <NormCategoryRows title="Без категории" rows={ungrouped} catalogItems={catalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} /> : null}
        {visibleGroups.map((group) => <NormCategoryRows key={group.id} title={group.normItemName} rows={detail.rows.filter((row) => row.parentRowId === group.id && row.rowType === "item")} catalogItems={catalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} />)}
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
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string) => void;
  mappingRowId: string;
}) {
  if (!rows.length) return null;
  return (
    <section className="inventory-ppe-norm-category">
      <header><strong>{title}</strong><span>{rows.length} позиций</span></header>
      <div className="inventory-ppe-norm-row-list">
        {rows.map((row) => {
          const defaultMapping = row.mappings.find((mapping) => mapping.isDefault) ?? row.mappings[0];
          return (
            <div className="inventory-ppe-norm-row" key={row.id}>
              <div className="inventory-ppe-norm-row-copy">
                <strong>{row.normItemName}</strong>
                <small>{row.quantityText || "Количество не распознано"}{row.lifeMonths ? ` · ${row.lifeMonths} мес.` : ""}</small>
                <small className="is-point">{row.normPoint || "Основание не указано"}</small>
              </div>
              <select aria-label={`Сопоставление: ${row.normItemName}`} disabled={mappingRowId === row.id || !catalogItems.length} onChange={(event) => onSaveMapping(row, event.target.value)} value={defaultMapping?.itemId ?? ""}>
                <option value="">Не сопоставлено</option>
                {catalogItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}
              </select>
              {mappingRowId === row.id ? <span className="inventory-ppe-norm-row-saving">Сохранение…</span> : defaultMapping ? <span className="inventory-ppe-norm-row-ready">Готово</span> : <span className="inventory-ppe-norm-row-warning">Нужно выбрать</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "не указано";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T00:00:00`));
}
