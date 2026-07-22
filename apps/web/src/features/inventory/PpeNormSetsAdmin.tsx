import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import type { InventoryPpeNormSetDto } from "../../api/contracts";
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
              {row.status === "draft" ? (
                <div className="inventory-ppe-norm-publish">
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
            </article>
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