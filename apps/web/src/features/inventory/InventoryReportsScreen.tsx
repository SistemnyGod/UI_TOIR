import { useMemo, useState } from "react";
import { BarChart3, Download, FileText, Search } from "lucide-react";
import type { InventoryListResponseDto, InventoryReportDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventoryReportsScreenProps = {
  error?: string;
  loading?: boolean;
  onNotify: (message: string) => void;
  reports?: InventoryListResponseDto<InventoryReportDto>;
};

type ExportFormat = "xlsx" | "pdf" | "docx";

export function InventoryReportsScreen({ error, loading = false, onNotify, reports }: InventoryReportsScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const rows = reports?.rows ?? [];

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

  async function exportReport(report: InventoryReportDto, format: ExportFormat) {
    const key = `${report.id}:${format}`;
    try {
      setBusyKey(key);
      saveApiFile(await inventoryRepository.exportReport(report.id, format));
      onNotify(`Отчет "${displayReportTitle(report)}" сформирован`);
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
            <span>Выгрузки по выдачам, возвратам, списаниям, СИЗ, актам под запись, сотрудникам и истории операций.</span>
          </div>
        </div>
      </header>

      {error ? <ReportState kind="error" title="API отчетов не ответил" text={error} /> : null}
      {loading ? <ReportState kind="loading" title="Загрузка отчетов" text="Получаем список доступных печатных и табличных форм." /> : null}

      {!loading && !error ? (
        <>
          <section className="inventory-reports-kpis" aria-label="Сводка отчетов">
            <ReportKpi label="Всего отчетов" value={rows.length} />
            <ReportKpi label="В выборке" tone="blue" value={visibleReports.length} />
            <ReportKpi label="Доступных форматов" tone="green" value={countFormats(rows)} />
          </section>

          <section className="inventory-reports-filters">
            <label className="inventory-reports-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск отчета по названию или описанию" type="search" />
            </label>
          </section>

          {!rows.length ? (
            <ReportState kind="empty" title="Отчеты не настроены" text="Backend пока не вернул список отчетов для бухгалтерии." />
          ) : !visibleReports.length ? (
            <ReportState kind="empty" title="Отчеты не найдены" text="Измените поисковый запрос." />
          ) : (
            <section className="inventory-reports-grid">
              {visibleReports.map((report) => {
                const formats = reportFormats(report);
                return (
                  <article className="inventory-reports-card" key={report.id}>
                    <span className="inventory-reports-card-icon"><FileText size={20} /></span>
                    <div>
                      <h2>{displayReportTitle(report)}</h2>
                      <p>{displayReportDescription(report)}</p>
                    </div>
                    <div className="inventory-reports-formats">
                      {formats.map((format) => {
                        const key = `${report.id}:${format}`;
                        return (
                          <button
                            className={format === "xlsx" ? "button primary" : "button ghost"}
                            disabled={Boolean(busyKey)}
                            key={format}
                            onClick={() => void exportReport(report, format)}
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
      <strong>{formatQuantity(value)}</strong>
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

function countFormats(rows: InventoryReportDto[]) {
  return new Set(rows.flatMap(reportFormats)).size;
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

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
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
