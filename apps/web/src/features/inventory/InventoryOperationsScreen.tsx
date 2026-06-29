import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  InventoryDocumentDto,
  InventoryEmployeeDto,
  InventoryListResponseDto,
  InventoryPpeMovementDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventoryOperationsScreenProps = {
  documents?: InventoryListResponseDto<InventoryDocumentDto>;
  employees: InventoryEmployeeDto[];
  error?: string;
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
};

type PpeCloseStatus = "returned" | "written_off";

const activePpeStatuses = new Set(["issued", "replacement", "reissued"]);
const closedPpeStatuses = new Set(["returned", "written_off", "lost"]);

export function InventoryOperationsScreen({
  documents,
  employees,
  error,
  loading = false,
  onNotify,
  onReload,
}: InventoryOperationsScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [closeStatus, setCloseStatus] = useState<PpeCloseStatus>("returned");
  const [comment, setComment] = useState("");
  const [ppeRows, setPpeRows] = useState<InventoryPpeMovementDto[]>([]);
  const [ppeLoading, setPpeLoading] = useState(false);
  const [ppeError, setPpeError] = useState("");
  const [busyLine, setBusyLine] = useState("");

  const selectedEmployee = employees.find((employee) => employee.id === employeeId) ?? null;
  const filteredEmployees = useMemo(() => {
    const normalized = employeeQuery.trim().toLowerCase();
    return employees
      .filter((employee) => employee.status !== "archived")
      .filter((employee) => {
        if (!normalized) return true;
        return [employee.fullName, employee.personnelNo, employee.position, employee.department]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 80);
  }, [employeeQuery, employees]);

  const activeRows = useMemo(
    () => ppeRows.filter((row) => activePpeStatuses.has(row.status)),
    [ppeRows],
  );
  const historyRows = useMemo(
    () => ppeRows.filter((row) => closedPpeStatuses.has(row.status)).slice(0, 12),
    [ppeRows],
  );
  const selectedLine = activeRows.find((row) => row.lineId === selectedLineId) ?? activeRows[0] ?? null;
  const operationRows = documents?.rows.filter((row) => row.type === "return" || row.type === "write_off") ?? [];

  useEffect(() => {
    if (!employeeId) {
      setPpeRows([]);
      setPpeError("");
      setPpeLoading(false);
      setSelectedLineId("");
      return;
    }

    let mounted = true;
    setPpeLoading(true);
    setPpeError("");
    inventoryRepository
      .getPpeMovements({ employeeId, page: 1, pageSize: 200 })
      .then((response) => {
        if (!mounted) return;
        const active = response.rows.filter((row) => activePpeStatuses.has(row.status));
        setPpeRows(response.rows);
        setSelectedLineId((current) =>
          active.some((row) => row.lineId === current) ? current : active[0]?.lineId ?? "",
        );
      })
      .catch((loadError) => {
        if (!mounted) return;
        setPpeError(loadError instanceof Error ? loadError.message : "Не удалось загрузить выданные СИЗ сотрудника.");
      })
      .finally(() => {
        if (mounted) setPpeLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [employeeId, inventoryRepository]);

  async function reloadEmployeeMovements(targetEmployeeId: string) {
    const response = await inventoryRepository.getPpeMovements({ employeeId: targetEmployeeId, page: 1, pageSize: 200 });
    const active = response.rows.filter((row) => activePpeStatuses.has(row.status));
    setPpeRows(response.rows);
    setSelectedLineId((current) =>
      active.some((row) => row.lineId === current) ? current : active[0]?.lineId ?? "",
    );
  }

  async function closeSelectedLine() {
    if (!selectedLine) {
      onNotify("Выберите выданный предмет для возврата или списания.");
      return;
    }

    const isReturn = closeStatus === "returned";
    const fallbackComment = isReturn ? "Возврат СИЗ от сотрудника" : "Списание выданного СИЗ";
    const operationLabel = isReturn ? "возврат" : "списание";

    try {
      setBusyLine(`${selectedLine.lineId}:${closeStatus}`);
      await inventoryRepository.updatePpeCardLineStatus(selectedLine.cardId, selectedLine.lineId, {
        comment: comment.trim() || fallbackComment,
        status: closeStatus,
      });
      setComment("");
      onNotify(`Проведено: ${operationLabel} - ${selectedLine.itemName}`);
      await Promise.all([onReload(), reloadEmployeeMovements(selectedLine.employeeId)]);
    } catch (closeError) {
      onNotify(closeError instanceof Error ? closeError.message : `Не удалось провести ${operationLabel}.`);
    } finally {
      setBusyLine("");
    }
  }

  return (
    <section className="inventory-operations-screen">
      <header className="inventory-operations-commandbar">
        <div className="inventory-operations-title">
          <span className="inventory-operations-title-icon">
            <RefreshCw size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Возврат и списание</h1>
            <span>Выберите сотрудника, затем фактически выданный предмет. Черновики, нормы и невыданные строки сюда не попадают.</span>
          </div>
        </div>
        <div className="inventory-operations-command-actions">
          <button className="button ghost" disabled={!employeeId || ppeLoading} onClick={() => void reloadEmployeeMovements(employeeId)} type="button">
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
      </header>

      {error ? <OperationState kind="error" title="API операций не ответил" text={error} /> : null}
      {loading ? <OperationState kind="loading" title="Загрузка данных" text="Получаем сотрудников, историю операций и выданные СИЗ." /> : null}

      {!loading && !error ? (
        <>
          <section className="inventory-operations-kpis" aria-label="Сводка возврата и списания">
            <OperationKpi label="Сотрудник выбран" tone={selectedEmployee ? "green" : "slate"} value={selectedEmployee ? 1 : 0} />
            <OperationKpi label="Можно вернуть/списать" tone={activeRows.length > 0 ? "blue" : "slate"} value={activeRows.length} />
            <OperationKpi label="Закрыто по сотруднику" tone={historyRows.length > 0 ? "green" : "slate"} value={historyRows.length} />
            <OperationKpi label="Операций в журнале" value={operationRows.length} />
          </section>

          <section className="inventory-return-layout">
            <aside className="inventory-return-panel inventory-return-employees">
              <div className="inventory-operations-panel-head">
                <div>
                  <h2>1. Сотрудник</h2>
                  <p>Поиск по ФИО, табельному номеру, должности или подразделению.</p>
                </div>
              </div>
              <label className="inventory-operations-search">
                <Search size={17} />
                <input
                  value={employeeQuery}
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder="Найти сотрудника"
                  type="search"
                />
              </label>
              <div className="inventory-return-employee-list">
                {filteredEmployees.map((employee) => (
                  <button
                    className={employee.id === employeeId ? "is-selected" : ""}
                    key={employee.id}
                    onClick={() => {
                      setEmployeeId(employee.id);
                      setSelectedLineId("");
                    }}
                    type="button"
                  >
                    <span>
                      <UserRound size={16} />
                    </span>
                    <strong>{employee.fullName}</strong>
                    <small>{[employee.position, employee.department, employee.personnelNo].filter(Boolean).join(" / ")}</small>
                  </button>
                ))}
              </div>
            </aside>

            <section className="inventory-return-panel inventory-return-items">
              <div className="inventory-operations-panel-head">
                <div>
                  <h2>2. Выданные предметы</h2>
                  <p>Показываются только строки со статусами "Выдано", "Заменено аналогом" и "Переоформлено".</p>
                </div>
              </div>
              {!selectedEmployee ? (
                <OperationState kind="empty" title="Сначала выберите сотрудника" text="После выбора здесь появятся предметы, которые реально можно вернуть или списать." />
              ) : ppeLoading ? (
                <OperationState kind="loading" title="Загружаем выданные СИЗ" text="Проверяем карточки, фактические выдачи и закрытые движения сотрудника." />
              ) : ppeError ? (
                <OperationState kind="error" title="Не удалось загрузить СИЗ" text={ppeError} />
              ) : activeRows.length === 0 ? (
                <OperationState kind="empty" title="Нет предметов для возврата или списания" text="У сотрудника нет активных фактически выданных строк. Невыданные строки, разделители и уже закрытые предметы сюда не попадают." />
              ) : (
                <div className="inventory-return-item-list">
                  {activeRows.map((row) => (
                    <button
                      className={row.lineId === selectedLine?.lineId ? "is-selected" : ""}
                      key={row.lineId}
                      onClick={() => setSelectedLineId(row.lineId)}
                      type="button"
                    >
                      <span className="inventory-return-item-marker">
                        <ClipboardList size={17} />
                      </span>
                      <span className="inventory-return-item-main">
                        <strong>{row.itemName}</strong>
                        <small>{row.employeeName} · {row.employeePersonnelNo || "без табельного"}</small>
                        <em>{formatQuantity(row.quantity)} {row.unit || "шт."} · выдано {formatDate(row.issuedAt ?? row.createdAt)}</em>
                      </span>
                      <span className="inventory-return-status">{ppeStatusLabel(row.status)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="inventory-return-panel inventory-return-action">
              <div className="inventory-operations-panel-head">
                <div>
                  <h2>3. Проведение</h2>
                  <p>Возврат и списание закрывают выданную строку и фиксируют движение в истории сотрудника.</p>
                </div>
              </div>
              {selectedLine ? (
                <>
                  <section className="inventory-return-selected">
                    <span>{ppeStatusLabel(selectedLine.status)}</span>
                    <h3>{selectedLine.itemName}</h3>
                    <dl>
                      <div><dt>Количество</dt><dd>{formatQuantity(selectedLine.quantity)} {selectedLine.unit || "шт."}</dd></div>
                      <div><dt>Выдано</dt><dd>{formatDate(selectedLine.issuedAt ?? selectedLine.createdAt)}</dd></div>
                      <div><dt>Срок</dt><dd>{selectedLine.dueAt ? formatDate(selectedLine.dueAt) : "не указан"}</dd></div>
                      <div><dt>Стоимость</dt><dd>{formatMoney(selectedLine.amountMinor)}</dd></div>
                    </dl>
                  </section>
                  <div className="inventory-return-action-toggle" role="group" aria-label="Тип закрытия выданного СИЗ">
                    <button className={closeStatus === "returned" ? "is-selected" : ""} onClick={() => setCloseStatus("returned")} type="button">
                      <RotateCcw size={16} />
                      Возврат
                    </button>
                    <button className={closeStatus === "written_off" ? "is-selected" : ""} onClick={() => setCloseStatus("written_off")} type="button">
                      <Trash2 size={16} />
                      Списание
                    </button>
                  </div>
                  <label className="inventory-operations-field">
                    Комментарий / основание
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={closeStatus === "returned" ? "Например: возврат после окончания срока носки" : "Например: акт списания, износ, повреждение"}
                    />
                  </label>
                  <div className="inventory-operations-warning">
                    <AlertTriangle size={16} />
                    {closeStatus === "returned"
                      ? "После возврата строка уйдет в историю движения как возвращенная сотрудником."
                      : "После списания строка уйдет в историю движения как списанная по основанию."}
                  </div>
                  <button
                    className={closeStatus === "returned" ? "button primary" : "button danger"}
                    disabled={Boolean(busyLine)}
                    onClick={() => void closeSelectedLine()}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    {busyLine ? "Проводим..." : closeStatus === "returned" ? "Провести возврат" : "Провести списание"}
                  </button>
                </>
              ) : (
                <OperationState kind="empty" title="Предмет не выбран" text="Выберите активную выданную строку сотрудника, чтобы провести возврат или списание." />
              )}
            </aside>
          </section>

          <section className="inventory-operations-journal">
            <div className="inventory-operations-panel-head">
              <div>
                <h2>История движения выбранного сотрудника</h2>
                <p>{historyRows.length ? `${historyRows.length} закрытых строк` : "Закрытых строк пока нет"}</p>
              </div>
            </div>
            <PpeMovementHistoryTable rows={historyRows} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function PpeMovementHistoryTable({ rows }: { rows: InventoryPpeMovementDto[] }) {
  if (!rows.length) {
    return <OperationState kind="empty" title="История пуста" text="Возвраты и списания выбранного сотрудника появятся здесь после проведения." />;
  }

  return (
    <div className="inventory-operations-table-wrap">
      <table className="inventory-operations-table">
        <thead>
          <tr>
            <th>СИЗ</th>
            <th>Статус</th>
            <th>Выдано</th>
            <th>Закрыто</th>
            <th>Количество</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.lineId}>
              <td><strong>{row.itemName}</strong><span>{row.employeeName}</span></td>
              <td><span className={`inventory-operations-type ${row.status}`}>{ppeStatusLabel(row.status)}</span></td>
              <td>{formatDate(row.issuedAt ?? row.createdAt)}</td>
              <td>{formatDate(row.returnedAt ?? row.writtenOffAt)}</td>
              <td>{formatQuantity(row.quantity)} {row.unit || "шт."}</td>
              <td>{row.comment || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-operations-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function OperationState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-operations-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : <PackageSearch size={20} />}</span>
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

function formatMoney(minor?: number | null) {
  return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format((minor ?? 0) / 100);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

function ppeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    issued: "Выдано",
    lost: "Утеряно",
    reissued: "Переоформлено",
    replacement: "Заменено аналогом",
    returned: "Возвращено",
    written_off: "Списано",
  };
  return labels[status] ?? status;
}
