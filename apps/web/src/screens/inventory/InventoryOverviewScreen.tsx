import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  History,
  PackageCheck,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  InventoryHistoryDto,
  InventoryListResponseDto,
  InventoryOverviewDto,
} from "../../api/contracts";
import type { ScreenId } from "../../types";
import "./inventoryWeb.css";

type InventoryOverviewScreenProps = {
  error?: string;
  history?: InventoryListResponseDto<InventoryHistoryDto> | null;
  loading?: boolean;
  onNavigate: (screen: ScreenId) => void;
  overview?: InventoryOverviewDto | null;
};

export function InventoryOverviewScreen({
  error,
  history,
  loading = false,
  onNavigate,
  overview,
}: InventoryOverviewScreenProps) {
  const historyRows = history?.rows ?? [];

  return (
    <section className="inventory-overview-screen">
      <header className="inventory-overview-commandbar">
        <div className="inventory-overview-title">
          <span className="inventory-overview-title-icon"><BarChart3 size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Обзор учета</h1>
            <span>Остатки, операции, СИЗ, под запись и контроль после миграции.</span>
          </div>
        </div>
        <div className="inventory-overview-actions">
          <button className="button primary" onClick={() => onNavigate("inventory-issue")} type="button">
            <ClipboardList size={16} />
            Новая выдача
          </button>
          <button className="button ghost" onClick={() => onNavigate("inventory-reports")} type="button">
            <FileText size={16} />
            Отчеты
          </button>
        </div>
      </header>

      {error ? <OverviewState kind="error" title="API обзора не ответил" text={error} /> : null}
      {loading ? <OverviewState kind="loading" title="Загрузка обзора" text="Получаем сводку учета, последние операции и зоны внимания." /> : null}
      {!loading && !error && !overview ? <OverviewState kind="empty" title="Сводка не загружена" text="API Inventory пока не вернул данные обзора." /> : null}

      {!loading && !error && overview ? (
        <>
          <section className="inventory-overview-kpis" aria-label="Сводка учета">
            <OverviewKpi icon={Users} label="Сотрудники" value={overview.employeesTotal} />
            <OverviewKpi icon={Boxes} label="Номенклатура" tone="blue" value={overview.itemsTotal} />
            <OverviewKpi icon={PackageCheck} label="Склады" value={overview.warehousesTotal} />
            <OverviewKpi icon={AlertTriangle} label="Критичные остатки" tone={overview.criticalStockItems ? "red" : "green"} value={overview.criticalStockItems} />
            <OverviewKpi icon={ClipboardList} label="Под запись" tone="blue" value={overview.activeCustodyRecords} />
            <OverviewKpi icon={ShieldCheck} label="Карточки СИЗ" value={overview.ppeCardsTotal} />
          </section>

          <section className="inventory-overview-workspace">
            <section className="inventory-overview-main">
              <div className="inventory-overview-panel-head">
                <div>
                  <h2>Зоны внимания</h2>
                  <p>{overview.attention.length} активных пунктов</p>
                </div>
              </div>
              {!overview.attention.length ? (
                <OverviewState kind="empty" title="Критичных зон нет" text="Просрочек, критичных остатков и аномальных операций сейчас нет." compact />
              ) : (
                <div className="inventory-overview-attention-list">
                  {overview.attention.map((item) => (
                    <button key={item.id} onClick={() => onNavigate((item.target as ScreenId) || "inventory-items")} type="button">
                      <span className={`tone-${item.tone || "blue"}`}><AlertTriangle size={16} /></span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="inventory-overview-side">
              <h2>Быстрые переходы</h2>
              <OverviewShortcut icon={Boxes} label="Номенклатура" onClick={() => onNavigate("inventory-items")} />
              <OverviewShortcut icon={ClipboardList} label="Выдача" onClick={() => onNavigate("inventory-issue")} />
              <OverviewShortcut icon={ShieldCheck} label="СИЗ" onClick={() => onNavigate("inventory-ppe")} />
              <OverviewShortcut icon={History} label="История" onClick={() => onNavigate("inventory-history")} />
              <OverviewShortcut icon={FileText} label="Отчеты" onClick={() => onNavigate("inventory-reports")} />
            </aside>
          </section>

          <section className="inventory-overview-history">
            <div className="inventory-overview-panel-head">
              <div>
                <h2>Последние события</h2>
                <p>{historyRows.length} записей</p>
              </div>
            </div>
            <OverviewHistoryTable rows={historyRows} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function OverviewHistoryTable({ rows }: { rows: InventoryHistoryDto[] }) {
  if (!rows.length) {
    return <OverviewState kind="empty" title="История пока пустая" text="События появятся после операций, импорта, печати и административных изменений." compact />;
  }

  return (
    <div className="inventory-overview-table-wrap">
      <table className="inventory-overview-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сущность</th>
            <th>Действие</th>
            <th>Описание</th>
            <th>Пользователь</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{entityLabel(row.entityType)}</td>
              <td><span className="inventory-overview-action">{actionLabel(row.action)}</span></td>
              <td>{formatDescription(row.description)}</td>
              <td>{row.actor || "не указан"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewKpi({
  icon: Icon,
  label,
  tone = "slate",
  value,
}: {
  icon: typeof Users;
  label: string;
  tone?: "blue" | "green" | "red" | "slate";
  value: number;
}) {
  return (
    <article className={`inventory-overview-kpi tone-${tone}`}>
      <span><Icon size={18} /></span>
      <div>
        <strong>{formatQuantity(value)}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}

function OverviewShortcut({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="inventory-overview-shortcut" onClick={onClick} type="button">
      <Icon size={17} />
      <span>{label}</span>
      <ArrowRight size={16} />
    </button>
  );
}

function OverviewState({
  compact,
  kind,
  text,
  title,
}: {
  compact?: boolean;
  kind: "empty" | "error" | "loading";
  text: string;
  title: string;
}) {
  return (
    <div className={`inventory-overview-state is-${kind} ${compact ? "is-compact" : ""}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
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

function formatDescription(description?: string | null) {
  if (!description || description.trim() === "->") return "Нет описания";
  return description;
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    archive: "Архив",
    archived: "Архивировано",
    close: "Закрытие",
    closed: "Закрыто",
    confirm_issue: "Подтверждение выдачи",
    create: "Создание",
    created: "Создано",
    docx_exported: "Выгрузка DOCX",
    issue: "Выдача",
    line_update: "Изменение строки",
    open: "Открытие",
    opened: "Открыто",
    pdf_exported: "Выгрузка PDF",
    print: "Печать",
    return: "Возврат",
    returned: "Возвращено",
    update: "Изменение",
    updated: "Изменено",
    write_off: "Списание",
    written_off: "Списано",
  };
  return action ? labels[action] ?? action : "Нет действия";
}

function entityLabel(entityType?: string | null) {
  const labels: Record<string, string> = {
    assignment_event: "Событие назначения",
    custody: "Акт под запись",
    custody_document: "Акт под запись",
    custody_record: "Строка акта",
    document: "Документ учета",
    employee: "Сотрудник",
    export_job: "Экспорт",
    inventory_item: "Номенклатура",
    inventory_user: "Пользователь Inventory",
    item: "Номенклатура",
    ppe_card: "Карточка СИЗ",
    ppe_card_line: "Строка СИЗ",
    stock_move: "Складское движение",
    system_log: "Системный журнал",
    web_user: "Пользователь",
  };
  return entityType ? labels[entityType] ?? entityType : "Нет сущности";
}
