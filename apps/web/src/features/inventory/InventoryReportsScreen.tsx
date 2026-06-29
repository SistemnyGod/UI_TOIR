import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileText, Search } from "lucide-react";
import type {
  InventoryCustodyRecordDto,
  InventoryDocumentDto,
  InventoryHistoryDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventoryReportDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import {
  buildInventoryMovementJournal,
  buildInventoryMovementReport,
  filterInventoryMovements,
  formatMovementQuantity,
  movementActionLabel,
} from "./history/inventoryMovementJournal";
import "./inventoryWeb.css";

type InventoryReportsScreenProps = {
  error?: string;
  loading?: boolean;
  onNotify: (message: string) => void;
  reports?: InventoryListResponseDto<InventoryReportDto>;
};

type ExportFormat = "xlsx" | "pdf" | "docx";

type MovementState = {
  custodyRecords: InventoryCustodyRecordDto[];
  documents: InventoryDocumentDto[];
  history: InventoryHistoryDto[];
  items: InventoryItemDto[];
};

const emptyMovementState: MovementState = {
  custodyRecords: [],
  documents: [],
  history: [],
  items: [],
};

export function InventoryReportsScreen({ error, loading = false, onNotify, reports }: InventoryReportsScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [rowsState, setRowsState] = useState<MovementState>(emptyMovementState);
  const [movementError, setMovementError] = useState("");
  const [movementsLoading, setMovementsLoading] = useState(loading);
  const rows = reports?.rows ?? [];

  useEffect(() => {
    let mounted = true;
    setMovementsLoading(true);
    setMovementError("");

    Promise.all([
      inventoryRepository.getDocuments({ pageSize: 500 }),
      inventoryRepository.getCustodyRecords({ pageSize: 500 }),
      inventoryRepository.getHistory({ pageSize: 1000 }),
      inventoryRepository.getItems({ pageSize: 500 }),
    ])
      .then(([documents, custodyRecords, historyRows, items]) => {
        if (!mounted) return;
        setRowsState({
          custodyRecords: custodyRecords.rows,
          documents: documents.rows,
          history: historyRows.rows,
          items: items.rows,
        });
      })
      .catch((loadError) => {
        if (mounted) setMovementError(loadError instanceof Error ? loadError.message : "Не удалось загрузить сводку движений");
      })
      .finally(() => {
        if (mounted) setMovementsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository]);

  const visibleReports = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((report) =>
      !normalized ||
      [displayReportTitle(report), displayReportDescription(report), report.id, report.format]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, rows]);
  const movements = useMemo(() => buildInventoryMovementJournal(rowsState), [rowsState]);
  const report = useMemo(() => buildInventoryMovementReport(movements), [movements]);
  const last30DaysReport = useMemo(
    () => buildInventoryMovementReport(filterInventoryMovements(movements, { period: "30d" })),
    [movements],
  );

  async function exportReport(reportRow: InventoryReportDto, format: ExportFormat) {
    const key = `${reportRow.id}:${format}`;
    try {
      setBusyKey(key);
      saveApiFile(await inventoryRepository.exportReport(reportRow.id, format));
      onNotify(`Отчет "${displayReportTitle(reportRow)}" сформирован`);
    } catch (downloadError) {
      onNotify(downloadError instanceof Error ? downloadError.message : "Не удалось сформировать отчет");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="inventory-reports-screen">
      <header className="inventory-reports-commandbar">
        <div className="inventory-reports-title">
          <span className="inventory-reports-title-icon"><BarChart3 size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Отчеты</h1>
            <span>Сводки по выдаче, под запись, сотрудникам, группам и экспортируемым формам.</span>
          </div>
        </div>
      </header>

      {error ? <ReportState kind="error" title="API отчетов не ответил" text={error} /> : null}
      {movementError ? <ReportState kind="error" title="Сводка движений не загрузилась" text={movementError} /> : null}
      {loading || movementsLoading ? <ReportState kind="loading" title="Загрузка отчетов" text="Получаем движения и список доступных форм." /> : null}

      {!loading && !movementsLoading && !error && !movementError ? (
        <>
          <section className="inventory-reports-kpis" aria-label="Сводка по движениям">
            <ReportKpi label="Всего выдано" tone="blue" value={report.totals.issued} />
            <ReportKpi label="На руках" tone="green" value={report.totals.inUse} />
            <ReportKpi label="Возвращено" value={report.totals.returned} />
            <ReportKpi label="Списано" value={report.totals.writtenOff} />
            <ReportKpi label="Неисправно" tone="red" value={report.totals.lost} />
          </section>

          {!movements.length ? (
            <ReportState kind="empty" title="Отчеты по движениям недоступны" text="Сводки появятся после выдачи, возврата, списания или операции под запись." />
          ) : (
            <section className="inventory-reports-summary-grid">
              <ReportTable
                columns={["Сотрудник", "На руках", "Возвращено", "Списано", "Неисправно"]}
                rows={report.byEmployee.map((row) => [
                  row.employeeName,
                  formatMovementQuantity(row.inUse),
                  formatMovementQuantity(row.returned),
                  formatMovementQuantity(row.writtenOff),
                  formatMovementQuantity(row.lost),
                ])}
                title="Сводка по сотрудникам"
              />
              <ReportTable
                columns={["Группа", "Движений", "На руках", "Списано", "Неисправно"]}
                rows={report.byGroup.map((row) => [
                  row.group,
                  formatMovementQuantity(row.movements),
                  formatMovementQuantity(row.inUse),
                  formatMovementQuantity(row.writtenOff),
                  formatMovementQuantity(row.lost),
                ])}
                title="Сводка по группам"
              />
              <ReportTable
                columns={["Действие", "Количество"]}
                rows={(["issued", "returned", "written_off", "lost", "archived"] as const).map((action) => [
                  movementActionLabel(action),
                  formatMovementQuantity(last30DaysReport.byAction[action]),
                ])}
                title="Итоги за 30 дней"
              />
            </section>
          )}

          <section className="inventory-reports-filters">
            <label className="inventory-reports-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск отчета по названию или описанию" type="search" />
            </label>
          </section>

          {!rows.length ? (
            <ReportState kind="empty" title="Экспорт недоступен" text="Backend пока не вернул список отчетов для выгрузки." />
          ) : !visibleReports.length ? (
            <ReportState kind="empty" title="Отчеты не найдены" text="Измените поисковый запрос." />
          ) : (
            <section className="inventory-reports-grid">
              {visibleReports.map((reportRow) => {
                const formats = reportFormats(reportRow);
                return (
                  <article className="inventory-reports-card" key={reportRow.id}>
                    <span className="inventory-reports-card-icon"><FileText size={20} /></span>
                    <div>
                      <h2>{displayReportTitle(reportRow)}</h2>
                      <p>{displayReportDescription(reportRow)}</p>
                      <small>Экспортирует выбранный отчет целиком.</small>
                    </div>
                    <div className="inventory-reports-formats">
                      {formats.map((format) => {
                        const key = `${reportRow.id}:${format}`;
                        return (
                          <button
                            className={format === "xlsx" ? "button primary" : "button ghost"}
                            disabled={Boolean(busyKey)}
                            key={format}
                            onClick={() => void exportReport(reportRow, format)}
                            type="button"
                          >
                            <Download size={15} />
                            {busyKey === key ? "Формируем..." : format.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}

function ReportKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-reports-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatMovementQuantity(value)}</strong>
    </article>
  );
}

function ReportTable({ columns, rows, title }: { columns: string[]; rows: string[][]; title: string }) {
  return (
    <article className="inventory-reports-summary-card">
      <h2>{title}</h2>
      {!rows.length ? (
        <p>Нет данных для сводки.</p>
      ) : (
        <div className="inventory-reports-table-wrap">
          <table className="inventory-reports-table">
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.join(":")}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function ReportState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-reports-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function reportFormats(report: InventoryReportDto): ExportFormat[] {
  const allowed = report.format
    .split("/")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ExportFormat => item === "xlsx" || item === "pdf" || item === "docx");
  return allowed.length ? allowed : ["xlsx"];
}

function displayReportTitle(report: InventoryReportDto) {
  const title = report.title.trim();
  if (/остат/i.test(title)) return "Учет предметов";
  if (/склад/i.test(title)) return "Номенклатура";
  return title || "Отчет";
}

function displayReportDescription(report: InventoryReportDto) {
  const description = report.description?.trim();
  if (!description) return "Описание отчета не задано";
  return description
    .replace(/остатк[а-яё]*/gi, "учетным данным")
    .replace(/по складам и номенклатуре/gi, "по номенклатуре")
    .replace(/склад[а-яё]*/gi, "учетным")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function saveApiFile(file: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
