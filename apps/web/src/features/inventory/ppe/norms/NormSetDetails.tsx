import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto } from "../../../../api/contracts";
import { matchesPpeSearchText } from "../ppeNormSearch";
import { MappingApprovalEditor, NormRowRulesEditor } from "./NormEditors";
import { NormCatalogSelector } from "./NormCatalogSelector";
import type { OpenNormEditor } from "./normEditorModel";

export function NormSetDetails({
  canManage,
  detail,
  catalogItems,
  catalogLoading,
  categoryFilter,
  onCategoryChange,
  onSaveMapping,
  mappingRowId,
  onEdit,
}: {
  canManage: boolean;
  detail: InventoryPpeNormSetDetailDto;
  catalogItems: InventoryItemDto[];
  catalogLoading: boolean;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string, isDefault?: boolean) => Promise<boolean>;
  mappingRowId: string;
  onEdit: OpenNormEditor;
}) {
  const [normSearch, setNormSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const deferredNormSearch = useDeferredValue(normSearch);
  const normalizedCatalogSearch = useDeferredValue(catalogSearch.trim().toLocaleLowerCase("ru"));
  const { groups, itemsByGroup } = useMemo(() => {
    const groups = detail.rows.filter(row => row.rowType === "group");
    const itemsByGroup = new Map<string, InventoryPpeNormRowDto[]>();
    for (const row of detail.rows) {
      if (row.rowType !== "item") continue;
      const key = row.parentRowId ?? "";
      const items = itemsByGroup.get(key) ?? [];
      items.push(row); itemsByGroup.set(key, items);
    }
    return { groups, itemsByGroup };
  }, [detail.rows]);
  const matchesNorm = (row: InventoryPpeNormRowDto) => matchesPpeSearchText([row.normItemName, row.normPoint, row.issuePeriodText], deferredNormSearch);
  const visibleGroups = groups.filter((group) => {
    if (categoryFilter !== "all" && group.id !== categoryFilter) return false;
    return !deferredNormSearch.trim() || matchesNorm(group) || (itemsByGroup.get(group.id) ?? []).some(matchesNorm);
  });
  const ungrouped = categoryFilter === "all" ? (itemsByGroup.get("") ?? []).filter(matchesNorm) : [];
  const filteredCatalogItems = useMemo(() => {
    if (!normalizedCatalogSearch) return catalogItems;
    return catalogItems.filter((item) => [item.name, item.sku, item.article, item.modelName, item.brandName]
      .filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(normalizedCatalogSearch));
  }, [catalogItems, normalizedCatalogSearch]);

  return (
    <div className="inventory-ppe-norm-details">
      <div className="inventory-ppe-norm-detail-summary">
        <span>
          <b>{detail.itemRowsCount}</b> строк СИЗ</span>
        <span className="is-ready">
          <b>{detail.mappedItemRowsCount}</b> сопоставлено</span>
        <span className={detail.unmappedItemRowsCount ? "is-warning" : "is-ready"}>
          <b>{detail.unmappedItemRowsCount}</b> требуют выбора</span>
      </div>
      <div className="inventory-ppe-norm-detail-toolbar">
        <label>
          <Search size={14} />
          <span>Категория ГОСТ</span>
          <select value={categoryFilter} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="all">Все категории</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.normItemName}</option>)}
          </select>
        </label>
        <label>
          <Search size={14} />
          <span>Найти норму</span>
          <input onChange={(event) => setNormSearch(event.target.value)} placeholder="Обувь, зимняя, п. 4.7…" type="search" value={normSearch} />
        </label>
        <label>
          <Search size={14} />
          <span>Номенклатура</span>
          <input onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Название, артикул, модель…" type="search" value={catalogSearch} />
        </label>
        <small>{catalogLoading ? "Загружаем каталог СИЗ…" : `Показано ${filteredCatalogItems.length} из ${catalogItems.length} позиций`}</small>
      </div>
      <div className="inventory-ppe-norm-category-list">
        {ungrouped.length ? <NormCategoryRows canManage={canManage} normSetId={detail.normSet.id} normSetVersion={detail.normSet.version} title="Без категории" rows={ungrouped} catalogItems={filteredCatalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} onEdit={onEdit} /> : null}
        {visibleGroups.map((group) => <NormCategoryRows canManage={canManage} key={group.id} normSetId={detail.normSet.id} normSetVersion={detail.normSet.version} title={group.normItemName} rows={(itemsByGroup.get(group.id) ?? []).filter(row => matchesNorm(group) || matchesNorm(row))} catalogItems={filteredCatalogItems} onSaveMapping={onSaveMapping} mappingRowId={mappingRowId} onEdit={onEdit} />)}
        {!ungrouped.length && !visibleGroups.length ? <div className="inventory-ppe-norm-message">По заданному поиску нормативные строки не найдены.</div> : null}
      </div>
    </div>
  );
}

function NormCategoryRows({
  canManage,
  normSetVersion,
  normSetId,
  title,
  rows,
  catalogItems,
  onSaveMapping,
  mappingRowId,
  onEdit,
}: {
  canManage: boolean;
  normSetVersion: number;
  normSetId: string;
  title: string;
  rows: InventoryPpeNormRowDto[];
  catalogItems: InventoryItemDto[];
  onSaveMapping: (row: InventoryPpeNormRowDto, itemId: string, isDefault?: boolean) => Promise<boolean>;
  mappingRowId: string;
  onEdit: OpenNormEditor;
}) {
  if (!rows.length) return null;
  return (
    <section className="inventory-ppe-norm-category">
      <header>
        <strong>{title}</strong>
        <span>{rows.length} позиций</span>
      </header>
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
              <div className="ppe-norm-row-actions"><NormRowRulesEditor normSetId={normSetId} normSetVersion={normSetVersion} onEdit={onEdit} row={row} />
                {mappingRowId === row.id ? <span className="inventory-ppe-norm-row-saving">Сохранение…</span> : row.mappings.some(mapping => mapping.isApproved) ? <span className="inventory-ppe-norm-row-ready">Утверждено</span> : defaultMapping ? <span className="inventory-ppe-norm-row-warning">Сопоставлено, не утверждено</span> : <span className="inventory-ppe-norm-row-warning">Нужно выбрать</span>}
              </div>
              {row.mappings.length ? <div className="inventory-ppe-norm-mappings" aria-label={`Допустимая номенклатура: ${row.normItemName}`}>
                {row.mappings.map((mapping) => <span className={mapping.isDefault ? "is-default" : ""} key={mapping.id}>
                  <span>
                    <strong>{mapping.itemName}</strong>
                    <small>{mapping.itemSku || "Без артикула"}</small>
                  </span>
                  {mapping.isDefault ? <em>Основное</em> : <button disabled={!canManage || Boolean(mappingRowId)} onClick={() => onEdit({ kind: "primary", normSetId, version: normSetVersion, row, mapping })} type="button">Сделать основным</button>}
                  <MappingApprovalEditor canManage={canManage} mapping={mapping} row={row} normSetId={normSetId} normSetVersion={normSetVersion} onEdit={onEdit} />
                </span>)}
              </div> : null}
              <NormCatalogSelector
                disabled={!canManage || Boolean(mappingRowId)}
                items={selectableItems}
                onSelect={(itemId) => onSaveMapping(row, itemId, row.mappings.length === 0)}
                row={row}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
