import { EmptyState, Panel } from "../ui";
import type { DataSourceStatus, ScheduleCell, ScheduleMode } from "../../types";

interface ScheduleGridPanelProps {
  errorMessage?: string;
  mode: ScheduleMode;
  scheduleCells: ScheduleCell[];
  status: DataSourceStatus;
  weekDays: string[];
  selectedCellId: string;
  onRetry: () => void | Promise<void>;
  onSelectCell: (id: string) => void;
  onNotify: (message: string) => void;
}

interface ScheduleRow {
  employee: string;
  employeeId: string;
  shift: ScheduleCell["shift"];
}

function getRows(cells: ScheduleCell[]): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow>();

  cells.forEach((cell) => {
    const key = `${cell.employeeId}:${cell.shift}`;
    if (!rows.has(key)) {
      rows.set(key, {
        employee: cell.employee,
        employeeId: cell.employeeId,
        shift: cell.shift,
      });
    }
  });

  return Array.from(rows.values());
}

function getStateLabel(state: ScheduleCell["state"]) {
  const labels: Record<ScheduleCell["state"], string> = {
    planned: "Назначен",
    alternate: "Резерв",
    transfer: "Перенос",
    vacation: "Отпуск",
    sick: "Больничный",
    empty: "Не запланировано",
  };

  return labels[state];
}

export function ScheduleGridPanel({
  errorMessage,
  mode,
  scheduleCells,
  status,
  weekDays,
  selectedCellId,
  onRetry,
  onSelectCell,
  onNotify,
}: ScheduleGridPanelProps) {
  const rows = getRows(scheduleCells);

  return (
    <Panel title="Плановый обход - расписание" note="Недельная сетка по сотрудникам, сменам и маршрутам">
      {mode === "week" ? (
        status === "loading" ? (
          <EmptyState
            title="Расписание загружается"
            description="Получаем сотрудников и маршруты из backend API."
          />
        ) : status === "error" && scheduleCells.length === 0 ? (
          <EmptyState
            title="Расписание не загружено"
            description={errorMessage || "Backend API не вернул справочники для формирования плана."}
            action={
              <button className="button ghost" onClick={() => void onRetry()} type="button">
                Повторить загрузку
              </button>
            }
          />
        ) : scheduleCells.length > 0 ? (
          <div className="schedule-grid" role="grid" aria-label="Недельный план обходов">
            <div className="schedule-header">Сотрудник</div>
            <div className="schedule-header">Смена</div>
            {weekDays.map((day) => (
              <div className="schedule-header" key={day}>
                {day}
              </div>
            ))}

            {rows.map((row) => (
              <ScheduleGridRow
                key={`${row.employeeId}:${row.shift}`}
                row={row}
                weekDays={weekDays}
                scheduleCells={scheduleCells}
                selectedCellId={selectedCellId}
                onSelectCell={onSelectCell}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Нет данных для расписания"
            description="Добавьте сотрудников и маршруты, затем создайте плановый обход через выбранную ячейку."
            action={
              <button
                className="button ghost"
                onClick={() => onNotify("Для формирования плана нужны сотрудники и маршруты в backend-справочниках")}
                type="button"
              >
                Что нужно подключить
              </button>
            }
          />
        )
      ) : null}

      {mode === "month" ? (
        scheduleCells.length > 0 ? (
          <div className="month-grid">
            {weekDays.map((day) => {
              const dayCells = scheduleCells.filter((cell) => cell.day === day);
              const plannedCells = dayCells.filter((cell) => cell.state !== "empty");
              const firstCell = plannedCells[0] ?? dayCells[0];
              return (
                <button
                  className={`month-day ${plannedCells.length > 0 ? "planned" : "empty"}`}
                  disabled={!firstCell}
                  key={day}
                  onClick={() => firstCell && onSelectCell(firstCell.id)}
                  type="button"
                >
                  <strong>{day}</strong>
                  <span>{plannedCells.length > 0 ? `${plannedCells.length} обходов` : "свободно"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Месячный план не сформирован"
            description="Сначала загрузите сотрудников и маршруты для недельной сетки."
          />
        )
      ) : null}

      {mode === "exceptions" ? (
        <EmptyState
          title="Исключений нет"
          description="Отпуска, больничные, замены и переносы появятся после добавления корректировок."
        />
      ) : null}
    </Panel>
  );
}

function ScheduleGridRow({
  row,
  weekDays,
  scheduleCells,
  selectedCellId,
  onSelectCell,
}: {
  row: ScheduleRow;
  weekDays: string[];
  scheduleCells: ScheduleCell[];
  selectedCellId: string;
  onSelectCell: (id: string) => void;
}) {
  return (
    <>
      <div className="schedule-employee">
        <strong>{row.employee}</strong>
        <span>ID: {row.employeeId.slice(0, 8)}</span>
      </div>
      <div className="schedule-shifts">{row.shift}</div>
      {weekDays.map((day) => {
        const cell = scheduleCells.find(
          (item) => item.employeeId === row.employeeId && item.shift === row.shift && item.day === day,
        );

        if (!cell) {
          return (
            <div className="schedule-cell empty" key={`${row.employeeId}:${row.shift}:${day}`}>
              -
            </div>
          );
        }

        return (
          <button
            className={`schedule-cell ${cell.state} ${selectedCellId === cell.id ? "selected" : ""}`}
            key={cell.id}
            onClick={() => onSelectCell(cell.id)}
            type="button"
          >
            <strong>{cell.state === "empty" ? "Свободно" : cell.route}</strong>
            <span>{cell.state === "empty" ? "Создать обход" : cell.zone}</span>
            <small>{getStateLabel(cell.state)}</small>
          </button>
        );
      })}
    </>
  );
}
