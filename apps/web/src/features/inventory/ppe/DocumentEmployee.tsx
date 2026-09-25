import { EmployeeCombobox } from "./EmployeeCombobox";
import { CheckCircle2, UserRound } from "lucide-react";
import type { InventoryEmployeeDto, InventoryPpeEmployeeDetailsDto, InventoryPpeNormSetDto, InventoryPpeNormRowDto } from "../../../api/contracts";

const fields: Array<[keyof InventoryPpeEmployeeDetailsDto, string]> = [["gender", "Пол"], ["height", "Рост"], ["clothingSize", "Размер одежды"], ["shoeSize", "Размер обуви"], ["headSize", "Размер головы"], ["handProtectionSize", "Размер перчаток"], ["respiratorSize", "Размер СИЗОД"]];
type Props = {
  canSelectEmployee: boolean; editable: boolean; employees: InventoryEmployeeDto[]; employeeId: string;
  norms: InventoryPpeNormSetDto[]; normSetId: string; date: string; responsibleName: string; basis: string;
  employeeDetails: InventoryPpeEmployeeDetailsDto;
  onEmployee: (value: string) => void; onNorm: (value: string) => void; onDate: (value: string) => void;
  onResponsibleName: (value: string) => void; onBasis: (value: string) => void;
  onEmployeeDetails: (value: InventoryPpeEmployeeDetailsDto) => void;
};
export function StepEmployee(p: Props) {
  const employee = p.employees.find(row => row.id === p.employeeId);

  return <div className="ppe-employee-layout">
    <section className="ppe-ref-panel">
      <h2>Сотрудник из общей базы</h2>
      <div className="ppe-ref-fields">
        <EmployeeCombobox employees={p.employees} value={p.employeeId} disabled={!p.canSelectEmployee} onChange={p.onEmployee} />
        {employee ? <div className="ppe-employee-facts ppe-span-all"><span>Табельный №<strong>{employee.personnelNo || "—"}</strong></span><span>Подразделение<strong>{employee.department || "—"}</strong></span><span>Должность<strong>{employee.position || "—"}</strong></span></div> : null}
      </div>
      <h2>Характеристики для подбора</h2>
      <p className="ppe-ref-muted">Укажите актуальные размеры. Неизвестные значения можно уточнить до подтверждения.</p>
      <div className="ppe-ref-fields">{fields.map(([field, label]) => <label key={field}>{label}<input maxLength={field === "gender" || field === "height" ? 40 : 80} disabled={!p.editable} value={p.employeeDetails[field]} onChange={event => p.onEmployeeDetails({ ...p.employeeDetails, [field]: event.target.value })} /></label>)}</div>
      <h2>Основание выдачи</h2>
      <div className="ppe-ref-fields">
        <label>Дата документа<input disabled={!p.editable} type="date" value={p.date} onChange={event => p.onDate(event.target.value)} /></label>
        <label>Ответственный<input disabled={!p.editable} maxLength={240} value={p.responsibleName} onChange={event => p.onResponsibleName(event.target.value)} /></label>
        <label className="ppe-span-all">Нормативный набор<select disabled={!p.editable} value={p.normSetId} onChange={event => p.onNorm(event.target.value)}><option value="">Выберите применимую норму</option>{p.norms.map(norm => <option key={norm.id} value={norm.id}>{norm.positionName} · {norm.versionName}</option>)}</select></label>
        {employee && !p.norms.length ? <p className="ppe-span-all ppe-ref-muted">Нет опубликованной нормы для этого сотрудника на выбранную дату. Проверьте применимость нормы в настройках СИЗ.</p> : null}
        <label className="ppe-span-all">Основание<textarea disabled={!p.editable} maxLength={4000} value={p.basis} onChange={event => p.onBasis(event.target.value)} /></label>
      </div>
    </section>
    <EmployeeCheck employee={employee} details={p.employeeDetails} norm={p.norms.find(row => row.id === p.normSetId)?.versionName} />
  </div>;
}
export function EmployeeCheck({ employee, details, norm, onEdit, rows = [] }: { rows?: InventoryPpeNormRowDto[]; employee?: InventoryEmployeeDto; details: InventoryPpeEmployeeDetailsDto; norm?: string; onEdit?: () => void }) {
  return <section className="ppe-ref-panel ppe-employee-check"><h2>{onEdit ? "Проверка данных" : "Перед подбором СИЗ"}</h2>
    <div className="ppe-employee-identity"><UserRound size={28} /><div><strong>{employee?.fullName || "Сотрудник не выбран"}</strong><small>{employee ? `${employee.personnelNo} · ${employee.position}` : "Выберите сотрудника из базы"}</small></div></div>
    <dl><dt>Подразделение</dt><dd>{employee?.department || "—"}</dd>{fields.map(([field, label]) => <div className="ppe-fact-row" key={field}><dt>{label}</dt><dd>{details[field] || "Не указано"}</dd></div>)}</dl>
    <p className={norm ? "ppe-ref-success" : "ppe-ref-muted"}>{norm ? <CheckCircle2 size={18} /> : null}{norm || "Применимая норма ещё не выбрана"}</p>
    <p className="ppe-ref-muted">На следующем этапе выберите товары, количество, срок носки и цены. Соответствие норме проверяется при сохранении.</p>
    {rows.length ? <section><h2>Применимая норма</h2><ul>{rows.map(row => <li key={row.id}>{row.normItemName}<small> · {row.quantityText || row.quantity} · {row.issuePeriodText}</small></li>)}</ul></section> : null}
    {onEdit ? <button className="button secondary" onClick={onEdit} type="button">Уточнить характеристики</button> : null}
  </section>;
}
