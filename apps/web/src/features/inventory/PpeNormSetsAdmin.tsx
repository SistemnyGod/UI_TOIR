import { useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import type { InventoryPpeNormSetDto } from "../../api/contracts";
import { LegacyTemplatesAdmin } from "./ppe/LegacyTemplatesAdmin";
import { NormSetDetails } from "./ppe/norms/NormSetDetails";
import { NormScopeEditor } from "./ppe/norms/NormEditors";
import { usePpeNormWorkspace } from "./ppe/norms/usePpeNormWorkspace";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { NormEditorDialog } from "./ppe/norms/NormEditorDialog";
import { editorNormId, type NormEditorSelection } from "./ppe/norms/normEditorModel";
import "./styles/ppeNormRecovery.css";

type Props = {
  canManage?: boolean;
  initialSearch?: string;
  onNotify: (message: string) => void;
};

const statusLabel: Record<InventoryPpeNormSetDto["status"], string> = {
  active: "Действует",
  archived: "Архив",
  draft: "Черновик",
};
export function PpeNormSetsAdmin(props: Props) {
  const repository = useInventoryRepository(), owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <NormAdminWorkspace key={owner.current.revision} {...props} />;
}
function NormAdminWorkspace({ canManage = false, initialSearch = "", onNotify: notify }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [editor, setEditor] = useState<NormEditorSelection | null>(null);
  const openEditor = (value: NormEditorSelection) => setEditor(structuredClone(value));
  const { allRows, rows, reviewedIds, setReviewedIds, loading, importing, publishingId, expandedId, details, detailLoadingId, catalogItems, catalogLoading, categoryFilter, setCategoryFilter, mappingRowId, search, setSearch, error, load, importWorkbook, publish, toggleDetails, saveMapping, refreshNormSet, onNotify, staleIds, markStale, reloadNormSet } = usePpeNormWorkspace(initialSearch, notify);
  const activeCount = allRows.filter((row) => row.status === "active").length;
  const draftCount = allRows.filter((row) => row.status === "draft").length;
  const reviewCount = allRows.filter(row => row.status !== "archived" && (row.status !== "active" || row.requiresReview || !row.readiness?.isReady)).length;
  const readyCount = allRows.filter(row => row.status === "active" && !row.requiresReview && row.readiness?.isReady).length;
  const visibleRows = rows.filter(row => readinessFilter === "all" || (readinessFilter === "ready" ? isReady(row) : row.status !== "archived" && !isReady(row)));
  const totalCount = allRows.filter(row => row.status !== "archived").length;

  return (
    <section className="inventory-ppe-norm-admin">
      <header className="inventory-ppe-norm-admin-head">
        <div>
          <span className="inventory-ppe-section-kicker">
            <ShieldCheck size={15} /> Нормы выдачи</span>
          <h2>Нормативные наборы СИЗ</h2>
          <p>Импортируйте Excel как черновик, проверьте состав и только затем опубликуйте.</p>
        </div>
        <div className="inventory-ppe-norm-actions">
          <button className="button ghost" disabled={loading} onClick={() => void load()} type="button">
            <RefreshCw size={15} /> Обновить
          </button>
          <button className="button primary" disabled={importing || !canManage} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload size={15} /> {importing ? "Импорт..." : "Импортировать XLSX"}
          </button>
          <input ref={fileInputRef} accept=".xlsx" hidden onChange={importWorkbook} type="file" />
        </div>
      </header>

      <div className="inventory-ppe-norm-kpis">
        <span>
          <small>Всего наборов</small>
          <strong>{allRows.filter(row => row.status !== "archived").length}</strong>
        </span>
        <span className="is-active">
          <small>Действуют</small>
          <strong>{activeCount}</strong>
        </span>
        <span className="is-draft">
          <small>Черновики</small>
          <strong>{draftCount}</strong>
        </span>
        <span className="is-review">
          <small>Требуют проверки</small>
          <strong>{reviewCount}</strong>
        </span>
      </div>

      <div className="inventory-ppe-norm-progress">
        <p>Готовы к запуску: <strong>{readyCount} из {totalCount}</strong>. Незавершённые наборы блокируют включение новых выдач.</p>
        <progress aria-label="Готовность наборов норм" value={readyCount} max={totalCount || 1} />
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
      <div className="inventory-ppe-norm-filters" role="group" aria-label="Готовность норм">
        {[["all", "Все наборы"], ["review", "Требуют проверки"], ["ready", "Готовы к запуску"]].map(([value, label]) => <button className={`button ${readinessFilter === value ? "primary" : "secondary"}`} aria-pressed={readinessFilter === value} key={value} onClick={() => setReadinessFilter(value)} type="button">{label}</button>)}
      </div>

      {error ? <div className="inventory-ppe-norm-message is-error" role="alert">{error}</div> : null}
      <div className="inventory-ppe-norm-loading" role="status" aria-live="polite">{loading ? allRows.length ? "Обновляем список… Можно продолжать проверку норм." : "Загружаем нормативные наборы…" : `Показано наборов: ${visibleRows.length}`}</div>
      {!loading && !visibleRows.length && !error ? (
        <div className="inventory-ppe-norm-empty">
          <ShieldCheck size={26} />
          <strong>{search || readinessFilter !== "all" ? "По заданным фильтрам наборы не найдены" : "Нормативные наборы пока не загружены"}</strong>
          <span>{search || readinessFilter !== "all" ? "Измените поисковый запрос или выберите все наборы." : "Импортируйте подготовленный XLSX. Данные сначала будут сохранены как черновики."}</span>
        </div>
      ) : null}

      {canManage ? <LegacyTemplatesAdmin norms={allRows} onNotify={onNotify} /> : null}
      <div className="inventory-ppe-norm-set-list">
        {visibleRows.map((row) => {
          const reviewed = reviewedIds.includes(row.id);
          const detail = details[row.id];
          const detailItemRows = detail?.rows.filter((candidate) => candidate.rowType === "item") ?? [];
          const mappedRows = detailItemRows.filter((candidate) => candidate.mappings.length > 0).length;
          const approvedRows = detailItemRows.filter(candidate => candidate.mappings.some(mapping => mapping.isApproved)).length;
          const needsReload = staleIds.includes(row.id);
          const publishing = publishingId === row.id;
          return (
            <article className={`inventory-ppe-norm-set is-${row.status}`} aria-busy={publishing || undefined} key={row.id}>
              <div className="inventory-ppe-norm-set-main">
                <span className={`inventory-ppe-norm-status is-${row.status}`}>{statusLabel[row.status]}</span>
                <h3>{row.positionName}</h3>
                <p>{row.versionName || "Без названия версии"} · {row.rowsCount} строк</p>
                <small>Источник: {row.sourceName || "не указан"}</small>
              </div>
              <div className="inventory-ppe-norm-set-meta">
                <span>Действует с <b>{formatDate(row.effectiveFrom)}</b>
                </span>
                <span>Версия <b>{row.version}</b>
                </span>
              </div>
              <div className="inventory-ppe-norm-publish">
                <button className="button ghost" onClick={() => void toggleDetails(row)} type="button">
                  {expandedId === row.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {detailLoadingId === row.id ? "Загрузка строк..." : expandedId === row.id ? "Скрыть категории" : "Открыть категории и сопоставление"}
                </button>
                <div className="inventory-ppe-norm-readiness">
                  <strong>{row.readiness?.isReady ? row.status === "active" && !row.requiresReview ? "Готов к запуску" : "Готов к публикации" : "Запуск заблокирован"} · утверждено {row.readiness?.approvedCount ?? 0} из {row.readiness?.requiredCount ?? 0} требований</strong>{Boolean(row.readiness?.blockers.length) && <details>
                    <summary>Причины блокировки ({row.readiness?.blockers.length})</summary>
                    <ul>{row.readiness?.blockers.map((blocker, index) => <li key={`${blocker.rowId}-${blocker.code}-${index}`}>{blocker.message}</li>)}</ul>
                  </details>}</div>
                {row.status === "draft" ? (
                  <div className="inventory-ppe-norm-publish-actions">
                    <span className="ppe-norm-publish-context">{detail ? `${mappedRows} строк сопоставлены · ${approvedRows} утверждены` : "Перед публикацией откройте и проверьте состав набора"}</span>
                    <label>
                      <input
                        checked={reviewed}
                        disabled={!canManage || !detail || needsReload || publishing}
                        onChange={(event) => setReviewedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                        type="checkbox"
                      />
                      Проверил нормативный состав и периодичность
                    </label>
                    <button className="button primary" disabled={!canManage || !detail || !reviewed || !row.readiness?.isReady || Boolean(publishingId) || needsReload} onClick={() => void publish(row)} type="button">
                      <CheckCircle2 size={15} /> {publishingId === row.id ? "Публикация..." : "Опубликовать"}
                    </button>
                  </div>
                ) : null}
              </div>
              {needsReload ? <div className="ppe-norm-reload-required" role="alert"><span>Перед следующим действием загрузите актуальную версию набора. Обновление данных не повторяет запись.</span><button className="button secondary" type="button" onClick={() => void reloadNormSet(row.id)}>Обновить набор</button></div> : null}
              {expandedId === row.id && details[row.id] ? <>
                <NormScopeEditor canManage={canManage && !needsReload && !publishing} normSet={row} onEdit={openEditor} />
                <NormSetDetails canManage={canManage && !needsReload && !publishing} detail={details[row.id]} catalogItems={catalogItems} catalogLoading={catalogLoading} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} onSaveMapping={(normRow, itemId, isDefault) => saveMapping(row.id, normRow, itemId, isDefault)} mappingRowId={mappingRowId} onEdit={openEditor} />
              </> : null}
            </article>
          );
        })}
      </div>
      {editor ? <NormEditorDialog selection={editor} canManage={canManage && !staleIds.includes(editorNormId(editor)) && publishingId !== editorNormId(editor)} onClose={() => setEditor(null)} onNotify={onNotify} onSaved={async () => { const id = editorNormId(editor); markStale(id); await refreshNormSet(id); }} /> : null}
    </section>
  );
}
function formatDate(value: string | null) {
  if (!value) return "не указано";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T00:00:00`));
}

function isReady(row: InventoryPpeNormSetDto) { return row.status === "active" && !row.requiresReview && Boolean(row.readiness?.isReady); }
