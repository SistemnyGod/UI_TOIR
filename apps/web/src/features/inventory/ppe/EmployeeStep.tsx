import type { ReactNode } from "react";
import type { InventoryEmployeeDto } from "../../../api/contracts";
import { employeeStatusLabel, ReadOnlyField } from "./ppeCommon";
import type { PpeEmployeeCardDetails } from "./ppeTypes";
import { PpePrintValidationPanel } from "./PpePrintValidationPanel";

type EmployeeStepProps = {
  employee: InventoryEmployeeDto | null;
  employeeDetails: PpeEmployeeCardDetails;
  employeePrintErrors: string[];
  employeeSelector: ReactNode;
  onPatchEmployeeDetails: (patch: Partial<PpeEmployeeCardDetails>) => void;
};

export function EmployeeStep({
  employee,
  employeeDetails,
  employeePrintErrors,
  employeeSelector,
  onPatchEmployeeDetails,
}: EmployeeStepProps) {
  return (
    <section className="inventory-ppe-wizard-panel">
      <h3>Данные сотрудника</h3>
      <div className="inventory-ppe-form-grid">
        <label className="inventory-ppe-field is-wide">
          <span>Сотрудник</span>
          {employeeSelector}
        </label>
        <ReadOnlyField label="Должность" value={employee?.position || "Не указана"} />
        <ReadOnlyField label="Подразделение" value={employee?.department || "Не указано"} />
        <ReadOnlyField label="Табельный номер" value={employee?.personnelNo || "Не указан"} />
        <ReadOnlyField label="Статус" value={employeeStatusLabel(employee?.status ?? "active")} />
      </div>
      {employee ? (
        <div className="inventory-ppe-wizard-employee">
          <span>{employee.fullName.slice(0, 1)}</span>
          <div>
            <strong>{employee.fullName}</strong>
            <small>{[employee.position, employee.department, employee.personnelNo].filter(Boolean).join(" / ")}</small>
          </div>
        </div>
      ) : null}
      <div className="inventory-ppe-document-fields">
        <div>
          <h4>Поля личной карточки</h4>
          <p>Заполняются как в бумажной форме СИЗ: рост, размеры, СИЗОД и СИЗ рук попадут в предпросмотр карточки.</p>
        </div>
        <div className="inventory-ppe-form-grid">
          <EmployeeDetailInput label="Пол" placeholder="муж. / жен." value={employeeDetails.gender} onChange={(gender) => onPatchEmployeeDetails({ gender })} />
          <EmployeeDetailInput label="Рост" placeholder="например 176" value={employeeDetails.height} onChange={(height) => onPatchEmployeeDetails({ height })} />
          <EmployeeDetailInput label="Размер одежды" placeholder="например 52-54" value={employeeDetails.clothingSize} onChange={(clothingSize) => onPatchEmployeeDetails({ clothingSize })} />
          <EmployeeDetailInput label="Размер обуви" placeholder="например 43" value={employeeDetails.shoeSize} onChange={(shoeSize) => onPatchEmployeeDetails({ shoeSize })} />
          <EmployeeDetailInput label="Размер головного убора" placeholder="например 58" value={employeeDetails.headSize} onChange={(headSize) => onPatchEmployeeDetails({ headSize })} />
          <EmployeeDetailInput label="СИЗОД" placeholder="тип / размер" value={employeeDetails.respiratorSize} onChange={(respiratorSize) => onPatchEmployeeDetails({ respiratorSize })} />
          <EmployeeDetailInput label="СИЗ рук" placeholder="например 10" value={employeeDetails.handProtectionSize} onChange={(handProtectionSize) => onPatchEmployeeDetails({ handProtectionSize })} />
          <PpePrintValidationPanel
            errors={employeePrintErrors}
            title="В личной карточке есть пустые поля"
          />
        </div>
      </div>
    </section>
  );
}

function EmployeeDetailInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  return (
    <label className="inventory-ppe-field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value ?? ""} />
    </label>
  );
}
