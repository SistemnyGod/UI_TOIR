import { EmptyState, Panel } from "../ui";
import type { ScheduleCell, ScheduleMode } from "../../types";

interface ScheduleGridPanelProps {
  mode: ScheduleMode;
  scheduleCells: ScheduleCell[];
  weekDays: string[];
  selectedCellId: string;
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
  mode,
  scheduleCells,
  weekDays,
  selectedCellId,
  onSelectCell,
  onNotify,
}: ScheduleGridPanelProps) {
  const rows = getRows(scheduleCells);

  return (
    <Panel title="Плановый обход - расписание" note="Недельная сетка по сотрудникам, сменам и маршрутам">
      {mode === "week" ? (
        scheduleCells.length > 0 ? (
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
            title="План обходов пуст"
            description="После подключения данных здесь появится недельная сетка назначений по сотрудникам, маршрутам и сменам."
            action={
              <button
                className="button ghost"
                onClick={() => onNotify("Создание правила планового обхода будет доступно после справочников")}
                type="button"
              >
                Создать правило
              </button>
            }
          />
        )
      ) : null}

      {mode === "month" ? (
        <EmptyState
          title="Месячный план пуст"
          description="Календарь будет строиться из правил планового обхода и исключений."
        />
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
        <span>ID: {row.employeeId}</span>
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
            <strong>{cell.route}</strong>
            <span>{cell.zone}</span>
            <small>{getStateLabel(cell.state)}</small>
          </button>
        );
      })}
    </>
  );
}
