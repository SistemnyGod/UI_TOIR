import "./employeeForm.css";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { EmployeeDirectoryItem, EmployeeFormPayload } from "../../../../types";
import { Button, ModalShell, useDialogCloseGuard } from "../../../../shared/ui";

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
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  const initialDraft = useRef(JSON.stringify(draft));
  const formId = useId();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: () => JSON.stringify(draft) !== initialDraft.current, pending: isSubmitting, onClose });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const positions = referenceOptions?.positions ?? [];
  const departments = referenceOptions?.departments ?? [];
  const groups = referenceOptions?.groups ?? ["Атом", "Атом Экология"];

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setErrorMessage("");

    const fullName = draft.fullName.trim();
    const personnelNo = draft.personnelNo.trim();
    if (!fullName || !personnelNo) {
      setErrorMessage("\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0424\u0418\u041e \u0438 \u0442\u0430\u0431\u0435\u043b\u044c\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({ ...draft, fullName, personnelNo });
      if (mounted.current) onClose();
    } catch (error) {
      if (!mounted.current) return;
      setErrorMessage(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430.");
    } finally {
      submittingRef.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  async function deleteEmployee() {
    if (!employee || !onDelete || submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onDelete(employee.id);
      if (mounted.current) onClose();
    } catch (error) {
      if (!mounted.current) return;
      setErrorMessage(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0434\u0435\u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430.");
    } finally {
      submittingRef.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  return (
    <><ModalShell
      className="request-create-modal employee-form-modal"
      onClose={() => { if (!submittingRef.current) requestClose(); }}
      pending={isSubmitting}
      subtitle="Данные используются для заявок на обход и привязки к мобильным аккаунтам."
      title={mode === "create" ? "Создать сотрудника" : "Редактировать сотрудника"}
      actions={<>
        {mode === "edit" && onDelete ? <Button disabled={isSubmitting} onClick={deleteEmployee} variant="danger">Деактивировать</Button> : null}
        <Button disabled={isSubmitting} onClick={requestClose} variant="ghost">Отмена</Button>
        <Button disabled={isSubmitting} form={formId} type="submit" variant="primary">{isSubmitting ? "Сохранение…" : "Сохранить"}</Button>
      </>}
    >
      <form id={formId} onSubmit={submitForm} aria-busy={isSubmitting}>

        {errorMessage ? <div className="employee-form-error" role="alert">{errorMessage}</div> : null}

        <div className="form-grid">
          <label>
            ФИО
            <input
              disabled={isSubmitting}
              required
              value={draft.fullName}
              onChange={(event) => setDraft({ ...draft, fullName: event.currentTarget.value })}
            />
          </label>
          <label>
            Табельный номер
            <input
              disabled={isSubmitting}
              required
              value={draft.personnelNo}
              onChange={(event) => setDraft({ ...draft, personnelNo: event.currentTarget.value })}
            />
          </label>
          <label>
            Должность
            <input
              disabled={isSubmitting}
              list="employee-position-options"
              value={draft.position}
              onChange={(event) => setDraft({ ...draft, position: event.currentTarget.value })}
            />
          </label>
          <label>
            Участок
            <input
              disabled={isSubmitting}
              list="employee-department-options"
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.currentTarget.value })}
            />
          </label>
          <label>
            Основная группа
            <input
              disabled={isSubmitting}
              list="employee-group-options"
              value={draft.employeeGroup}
              onChange={(event) => setDraft({ ...draft, employeeGroup: event.currentTarget.value })}
              placeholder="Атом или Атом Экология"
            />
          </label>
          <label>
            Дата приема на работу
            <input
              disabled={isSubmitting}
              type="date"
              value={draft.hiredAt}
              onChange={(event) => setDraft({ ...draft, hiredAt: event.currentTarget.value })}
            />
          </label>
          <label>
            Дата рождения
            <input
              disabled={isSubmitting}
              type="date"
              value={draft.birthDate}
              onChange={(event) => setDraft({ ...draft, birthDate: event.currentTarget.value })}
            />
          </label>
          <label>
            Статус
            <select
              disabled={isSubmitting}
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
            <select disabled={isSubmitting} value={draft.shift} onChange={(event) => setDraft({ ...draft, shift: event.currentTarget.value })}>
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
              disabled={isSubmitting}
            checked={draft.hasMobileAccount}
            onChange={(event) => setDraft({ ...draft, hasMobileAccount: event.currentTarget.checked })}
            type="checkbox"
          />{" "}
          Есть привязанный мобильный аккаунт
        </label>

      </form>
    </ModalShell>{discardDialog}</>
  );
}
