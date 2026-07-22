import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { EmployeeDirectoryItem, EmployeeFormPayload } from "../../../../types";

type EmployeeFormMode = "create" | "edit";

interface EmployeeFormModalProps {
  employee?: EmployeeDirectoryItem;
  mode: EmployeeFormMode;
  onClose: () => void;
  onDelete?: (employeeId: string) => Promise<void> | void;
  onSubmit: (payload: EmployeeFormPayload) => Promise<void> | void;
  referenceOptions?: {
    departments: string[];
    groups: string[];
    positions: string[];
  };
}

export function EmployeeFormModal({ employee, mode, onClose, onDelete, onSubmit, referenceOptions }: EmployeeFormModalProps) {
  const [draft, setDraft] = useState<EmployeeFormPayload>(() => ({
    fullName: employee?.fullName ?? "",
    personnelNo: employee?.personnelNo ?? "",
    position: employee?.position ?? "",
    department: employee?.department ?? "",
    employeeGroup: employee?.employeeGroup ?? referenceOptions?.groups[0] ?? "Атом",
    hiredAt: employee?.hiredAt ?? "",
    birthDate: employee?.birthDate ?? "",
    status: (employee?.status || "\u0410\u043a\u0442\u0438\u0432\u0435\u043d") as EmployeeDirectoryItem["status"],
    shift: employee?.shift || "\u0414\u0435\u043d\u044c",
    hasMobileAccount: employee?.mobileStatus === "Привязан",
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const positions = referenceOptions?.positions ?? [];
  const departments = referenceOptions?.departments ?? [];
  const groups = referenceOptions?.groups ?? ["Атом", "Атом Экология"];

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const fullName = draft.fullName.trim();
    const personnelNo = draft.personnelNo.trim();
    if (!fullName || !personnelNo) {
      setErrorMessage("\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0424\u0418\u041e \u0438 \u0442\u0430\u0431\u0435\u043b\u044c\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ ...draft, fullName, personnelNo });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteEmployee() {
    if (!employee || !onDelete) return;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onDelete(employee.id);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0434\u0435\u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        aria-labelledby="employee-form-title"
        aria-modal="true"
        className="modal-window request-modal request-create-modal employee-form-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitForm}
        role="dialog"
      >
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Справочник сотрудников</span>
            <h2 id="employee-form-title">{mode === "create" ? "Создать сотрудника" : "Редактировать сотрудника"}</h2>
            <p>Данные используются для заявок на обход и привязки к мобильным аккаунтам.</p>
          </div>
          <button aria-label="Закрыть" className="modal-close employee-form-close" onClick={onClose} title="Закрыть" type="button">
            <X aria-hidden="true" size={18} strokeWidth={2.5} />
          </button>
        </div>

        {errorMessage ? <div className="employee-form-error" role="alert">{errorMessage}</div> : null}

        <div className="form-grid">
          <label>
            ФИО
            <input
              autoFocus
              required
              value={draft.fullName}
              onChange={(event) => setDraft({ ...draft, fullName: event.currentTarget.value })}
            />
          </label>
          <label>
            Табельный номер
            <input
              required
              value={draft.personnelNo}
              onChange={(event) => setDraft({ ...draft, personnelNo: event.currentTarget.value })}
            />
          </label>
          <label>
            Должность
            <input
              list="employee-position-options"
              value={draft.position}
              onChange={(event) => setDraft({ ...draft, position: event.currentTarget.value })}
            />
          </label>
          <label>
            Участок
            <input
              list="employee-department-options"
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.currentTarget.value })}
            />
          </label>
          <label>
            Основная группа
            <input
              list="employee-group-options"
              value={draft.employeeGroup}
              onChange={(event) => setDraft({ ...draft, employeeGroup: event.currentTarget.value })}
              placeholder="Атом или Атом Экология"
            />
          </label>
          <label>
            Дата приема на работу
            <input
              type="date"
              value={draft.hiredAt}
              onChange={(event) => setDraft({ ...draft, hiredAt: event.currentTarget.value })}
            />
          </label>
          <label>
            Дата рождения
            <input
              type="date"
              value={draft.birthDate}
              onChange={(event) => setDraft({ ...draft, birthDate: event.currentTarget.value })}
            />
          </label>
          <label>
            Статус
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.currentTarget.value as EmployeeDirectoryItem["status"] })
              }
            >
              <option value="Активен">Активен</option>
              <option value="На смене">На смене</option>
              <option value="Офлайн">Офлайн</option>
              <option value="Отпуск">Отпуск</option>
            </select>
          </label>
          <label>
            Смена
            <select value={draft.shift} onChange={(event) => setDraft({ ...draft, shift: event.currentTarget.value })}>
              <option value="День">День</option>
              <option value="Ночь">Ночь</option>
            </select>
          </label>
        </div>

        <datalist id="employee-position-options">
          {positions.map((item) => <option key={item} value={item} />)}
        </datalist>
        <datalist id="employee-department-options">
          {departments.map((item) => <option key={item} value={item} />)}
        </datalist>
        <datalist id="employee-group-options">
          {groups.map((item) => <option key={item} value={item} />)}
        </datalist>

        <label className="toggle-filter">
          <input
            checked={draft.hasMobileAccount}
            onChange={(event) => setDraft({ ...draft, hasMobileAccount: event.currentTarget.checked })}
            type="checkbox"
          />{" "}
          Есть привязанный мобильный аккаунт
        </label>

        <div className="modal-actions">
          {mode === "edit" ? (
            <button className="button danger" disabled={isSubmitting} onClick={deleteEmployee} type="button">
              Деактивировать
            </button>
          ) : null}
          <button className="button ghost" disabled={isSubmitting} onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
