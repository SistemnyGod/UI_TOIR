import { useId, useRef, useState } from "react";
import type { CreateEmployeeDto, InventoryEmployeeDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { useEmployeeDialogAction } from "./useEmployeeDialogAction";

export type EmployeeFormState = CreateEmployeeDto;
export type EmployeeFormMode = "create" | "edit";
const emptyEmployeeForm: EmployeeFormState = { birthDate: null, department: "", employeeGroup: "", fullName: "", hasMobileAccount: false, hiredAt: null, personnelNo: "", position: "", shift: "Пятидневка", status: "active" };

export function EmployeeFormDialog({ busy, employee, mode, onCancel, onConfirm, referenceOptions }: {
  busy: boolean;
  employee: InventoryEmployeeDto | null;
  mode: EmployeeFormMode;
  onCancel: () => void;
  onConfirm: (payload: EmployeeFormState) => Promise<boolean | void>;
  referenceOptions: { departments: string[]; employeeGroups: string[]; positions: string[] };
}) {
  const [form, setForm] = useState<EmployeeFormState>(() => employee ? employeeToForm(employee) : { ...emptyEmployeeForm, hiredAt: new Date().toISOString().slice(0, 10) });
  const initial = useRef(JSON.stringify(form));
  const action = useEmployeeDialogAction(busy);
  const formId = useId();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(form) !== initial.current, pending: action.pending, onClose: onCancel });
  const patch = (changes: Partial<EmployeeFormState>) => { setForm(current => ({ ...current, ...changes })); action.clearError(); };
  return <><ModalShell title={mode === "edit" ? "Редактирование сотрудника" : "Создание сотрудника"} subtitle="Справочник сотрудников учёта" className="inventory-employee-dialog inventory-employee-editor" pending={action.pending} onClose={requestClose}
    actions={<><Button disabled={action.pending} onClick={requestClose} variant="ghost">Отмена</Button><Button disabled={action.pending || !form.fullName.trim()} form={formId} type="submit" variant="primary">{action.pending ? "Сохранение…" : mode === "edit" ? "Сохранить изменения" : "Создать"}</Button></>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); if (form.fullName.trim()) void action.run(() => onConfirm(form)); }}>
      <fieldset disabled={action.pending}>
        <div className="inventory-employee-fields">
          <label className="is-wide">
            <span>ФИО</span>
            <input autoFocus required value={form.fullName} onChange={(event) => patch({ fullName: event.target.value })} placeholder="Иванов Иван Иванович" />
          </label>
          <label>
            <span>Табельный номер</span>
            <input value={form.personnelNo} onChange={(event) => patch({ personnelNo: event.target.value })} placeholder="Можно оставить пустым" />
          </label>
          <label>
            <span>Статус</span>
            <select value={form.status} onChange={(event) => patch({ status: event.target.value })}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="disabled">Отключен</option>
              <option value="archived">Архив</option>
            </select>
          </label>
          <label>
            <span>Должность</span>
            <input list={`${formId}-positions`} value={form.position} onChange={(event) => patch({ position: event.target.value })} placeholder="Сотрудник" />
          </label>
          <label>
            <span>Подразделение</span>
            <input list={`${formId}-departments`} value={form.department} onChange={(event) => patch({ department: event.target.value })} placeholder="Не указано" />
          </label>
          <label>
            <span>Основная группа</span>
            <input list={`${formId}-groups`} value={form.employeeGroup} onChange={(event) => patch({ employeeGroup: event.target.value })} placeholder="Атом / Атом Экология / Подрядчики" />
          </label>
          <label>
            <span>Смена</span>
            <select value={form.shift} onChange={(event) => patch({ shift: event.target.value })}>
              <option value="Пятидневка">Пятидневка</option>
              <option value="День">День</option>
              <option value="Ночь">Ночь</option>
              <option value="11-часовая">11-часовая</option>
              <option value="Индивидуальная">Индивидуальная</option>
            </select>
          </label>
          <label>
            <span>Дата приема</span>
            <input value={form.hiredAt ?? ""} onChange={(event) => patch({ hiredAt: event.target.value || null })} type="date" />
          </label>
          <label>
            <span>Дата рождения</span>
            <input value={form.birthDate ?? ""} onChange={(event) => patch({ birthDate: event.target.value || null })} type="date" />
          </label>
        </div>
        <datalist id={`${formId}-positions`}>
          {referenceOptions.positions.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id={`${formId}-departments`}>
          {referenceOptions.departments.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id={`${formId}-groups`}>
          {referenceOptions.employeeGroups.map((value) => <option key={value} value={value} />)}
        </datalist>


      </fieldset>
    </form>
    <p className="inventory-employee-hint">Должность, подразделение и группу можно ввести вручную. Сохранённые значения доступны в поиске и фильтрах справочника.</p>
    {action.error ? <p className="field-error" role="alert">{action.error}</p> : null}
  </ModalShell>{discardDialog}</>;
}

function employeeToForm(employee: InventoryEmployeeDto): EmployeeFormState {
  return {
    birthDate: employee.birthDate,
    department: employee.department,
    employeeGroup: employee.employeeGroup,
    fullName: employee.fullName,
    hasMobileAccount: false,
    hiredAt: employee.hiredAt,
    personnelNo: employee.personnelNo,
    position: employee.position,
    shift: "Пятидневка",
    status: employee.status || "active",
  };
}


