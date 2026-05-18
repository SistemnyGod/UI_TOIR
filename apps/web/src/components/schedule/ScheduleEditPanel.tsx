import { Chip, EmptyState, Field } from "../ui";
import type { ScheduleCell } from "../../types";

interface ScheduleEditPanelProps {
  selected?: ScheduleCell;
  onNotify: (message: string) => void;
}

export function ScheduleEditPanel({ selected, onNotify }: ScheduleEditPanelProps) {
  return (
    <aside className="edit-modal">
      {!selected ? (
        <EmptyState
          title="Ячейка плана не выбрана"
          description="Форма редактирования откроется после выбора планового обхода в сетке."
        />
      ) : (
        <>
          <div className="drawer-title">
            <div>
              <h2>Плановый обход - редактирование</h2>
              <p>
                {selected.day} · {selected.shift}
              </p>
            </div>
            <Chip>{getSelectedChipLabel(selected)}</Chip>
          </div>
          <dl className="meta-list">
            <Field label="Маршрут" value={`${selected.route} - ${selected.zone}`} />
            <Field label="Сотрудник" value={`${selected.employee} · ID: ${selected.employeeId}`} />
            <Field label="Дата действия" value={selected.day} />
            <Field label="Периодичность" value="Еженедельно" />
          </dl>
          <div className="form-grid two">
            <label>
              Начало смены
              <input readOnly value={selected.shift === "Ночная" ? "19:00" : "07:00"} />
            </label>
            <label>
              Окончание смены
              <input readOnly value={selected.shift === "Ночная" ? "07:00" : "19:00"} />
            </label>
            <label>
              Допуск отклонения
              <input readOnly value="15 мин" />
            </label>
            <label>
              Ожидаемая длительность
              <input readOnly value="01:25" />
            </label>
          </div>
          <label className="full-label">
            Заметки
            <textarea placeholder="Заметки к плановому обходу" />
          </label>
          <div className="drawer-actions">
            <button
              className="button ghost danger-outline"
              onClick={() => onNotify("Плановый обход удален из локального UI-черновика")}
              type="button"
            >
              Удалить обход
            </button>
            <button
              className="button ghost"
              onClick={() => onNotify("Изменения планового обхода отменены")}
              type="button"
            >
              Отмена
            </button>
            <button
              className="button primary"
              onClick={() => onNotify("Плановый обход сохранен как локальный UI-черновик")}
              type="button"
            >
              Сохранить
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function getSelectedChipLabel(selected: ScheduleCell) {
  if (selected.state === "sick") {
    return "Больничный";
  }

  if (selected.state === "vacation") {
    return "Отпуск";
  }

  return selected.shift;
}
