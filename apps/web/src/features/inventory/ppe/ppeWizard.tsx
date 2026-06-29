import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Search, Settings2, UserRound, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { INVENTORY_PPE_WIZARD_STEPS } from "./inventoryPpeConfig";
import { CardParamsStep } from "./CardParamsStep";
import { EmployeeStep } from "./EmployeeStep";
import { IssueChecklistStep } from "./IssueChecklistStep";
import { PrintPreviewStep } from "./PrintPreviewStep";
import { WizardLinesTable } from "./WizardLinesTable";
import {
  ReadOnlyField,
  validatePpeEmployeePrintDetails,
} from "./ppeCommon";
import { PrintPaper } from "./ppePrint";
import type {
  ApiFile,
  PpeEmployeeCardDetails,
  PpeWizardLine,
  PpeWizardState,
  PrintData,
  PrintMode,
} from "./ppeTypes";
import {
  parsePriceText,
  PPE_WIZARD_STEP_DETAILS,
} from "./ppeWizardDomain";

type EmployeeComboboxProps = {
  employees: InventoryEmployeeDto[];
  onChange: (employeeId: string) => void;
  value: string;
};

export function PpeWizard({
  busy,
  employee,
  employees,
  onAddItems,
  onBackToJournal,
  onDownload,
  onPatchLine,
  onPreview,
  onPrint,
  onRemoveLine,
  onSave,
  onStepChange,
  onWizardChange,
  printData,
  settings,
  wizard,
}: {
  busy: boolean;
  employee: InventoryEmployeeDto | null;
  employees: InventoryEmployeeDto[];
  onAddItems: () => void;
  onBackToJournal: () => void;
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onPatchLine: (index: number, patch: Partial<PpeWizardLine>) => void;
  onPreview: (mode: PrintMode) => void;
  onPrint: (mode: PrintMode) => void;
  onRemoveLine: (index: number) => void;
  onSave: (confirmIssue: boolean) => void;
  onStepChange: (step: number) => void;
  onWizardChange: (wizard: PpeWizardState) => void;
  printData: PrintData;
  settings?: InventorySettingsDto;
  wizard: PpeWizardState;
}) {
  const inventoryRepository = useInventoryRepository();
  const currentStep = PPE_WIZARD_STEP_DETAILS[wizard.step] ?? PPE_WIZARD_STEP_DETAILS[0];
  const issuedLines = wizard.lines.filter((line) => line.status === "issued").length;
  const zeroPriceLines = wizard.lines.filter((line) => parsePriceText(line.priceText) === 0).length;
  const [printPreviewMode, setPrintPreviewMode] = useState<PrintMode>("card");
  const stepIcons = [UserRound, Settings2, ClipboardList, FileText];
  const stepReady = [
    Boolean(wizard.employeeId),
    Boolean(wizard.comment.trim()),
    wizard.lines.length > 0 && zeroPriceLines === 0,
    wizard.lines.length > 0,
  ];
  const employeeDetails = wizard.employeeDetails ?? {};
  const employeePrintErrors = validatePpeEmployeePrintDetails(employeeDetails);
  const isPrintBlockedByEmployeeDetails = employeePrintErrors.length > 0;
  const printBlockTitle = isPrintBlockedByEmployeeDetails
    ? "Заполните поля личной карточки сотрудника перед печатью."
    : undefined;

  function patchEmployeeDetails(patch: Partial<PpeEmployeeCardDetails>) {
    onWizardChange({
      ...wizard,
      employeeDetails: {
        ...employeeDetails,
        ...patch,
      },
    });
  }

  return (
    <section className="inventory-ppe-wizard">
      <header className="inventory-ppe-wizard-head">
        <div>
          <h2>{wizard.mode === "edit" ? "Редактирование карточки СИЗ" : "Создание карточки СИЗ"}</h2>
          <p>{currentStep.title} · {currentStep.description}</p>
        </div>
        <div className="inventory-ppe-command-actions">
          <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => onPreview("card")} title={printBlockTitle} type="button">
            Предпросмотр
          </button>
          <button
            className="button ghost"
            disabled={!wizard.cardId || isPrintBlockedByEmployeeDetails}
            onClick={() =>
              wizard.cardId
                ? void onDownload(() => inventoryRepository.printPpeCard(wizard.cardId!, "card", "docx"))
                : undefined
            }
            title={printBlockTitle}
            type="button"
          >
            Карточка DOCX
          </button>
          <button
            className="button ghost"
            disabled={!wizard.cardId || isPrintBlockedByEmployeeDetails}
            onClick={() =>
              wizard.cardId
                ? void onDownload(() => inventoryRepository.printPpeCard(wizard.cardId!, "sheet", "docx"))
                : undefined
            }
            title={printBlockTitle}
            type="button"
          >
            Лист DOCX
          </button>
        </div>
      </header>

      <div className="inventory-ppe-wizard-stage" aria-live="polite">
        <div>
          <span>Текущий шаг</span>
          <strong>{currentStep.title}</strong>
          <small>{currentStep.description}</small>
        </div>
        <div className="inventory-ppe-wizard-stage-metrics">
          <ReadOnlyField label="Строки" value={String(wizard.lines.length)} />
          <ReadOnlyField label="Выдано" value={String(issuedLines)} />
          <ReadOnlyField label="Проверить" value={zeroPriceLines ? `${zeroPriceLines} без цены` : "Ошибок нет"} />
        </div>
      </div>

      <nav className="inventory-ppe-wizard-steps" aria-label="Шаги карточки СИЗ">
        {PPE_WIZARD_STEP_DETAILS.map((step, index) => {
          const Icon = stepIcons[index] ?? ClipboardList;
          return (
            <button
              className={`${wizard.step === index ? "is-active" : ""} ${stepReady[index] ? "is-ready" : ""}`}
              key={step.title}
              onClick={() => onStepChange(index)}
              type="button"
            >
              <span className="inventory-ppe-wizard-step-icon">
                {stepReady[index] ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </span>
              <span className="inventory-ppe-wizard-step-text">
                <strong>{step.short}</strong>
                <small>{step.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="inventory-ppe-wizard-layout">
        <div className="inventory-ppe-wizard-main">
          {wizard.step === 0 ? (
            <EmployeeStep
              employee={employee}
              employeeDetails={employeeDetails}
              employeePrintErrors={employeePrintErrors}
              employeeSelector={(
                <EmployeeCombobox
                  employees={employees}
                  onChange={(employeeId) => onWizardChange({ ...wizard, employeeId })}
                  value={wizard.employeeId}
                />
              )}
              onPatchEmployeeDetails={patchEmployeeDetails}
            />
          ) : null}

          {wizard.step === 1 ? (
            <CardParamsStep
              comment={wizard.comment}
              linesCount={wizard.lines.length}
              onCommentChange={(comment) => onWizardChange({ ...wizard, comment })}
            />
          ) : null}

          {wizard.step === 2 ? (
            <IssueChecklistStep
              hasZeroPrice={wizard.lines.some((line) => parsePriceText(line.priceText) === 0)}
              linesTable={<WizardLinesTable lines={wizard.lines} onPatchLine={onPatchLine} onRemoveLine={onRemoveLine} />}
              onAddItems={onAddItems}
            />
          ) : null}

          {wizard.step === 3 ? (
            <PrintPreviewStep
              mode={printPreviewMode}
              onModeChange={setPrintPreviewMode}
              onPreview={onPreview}
              onPrint={onPrint}
              printData={printData}
            />
          ) : null}

          <footer className="inventory-ppe-wizard-actions">
            <button className="button ghost" onClick={onBackToJournal} type="button">
              Назад к журналу
            </button>
            <div>
              <button
                className="button ghost"
                disabled={wizard.step === 0}
                onClick={() => onStepChange(Math.max(0, wizard.step - 1))}
                type="button"
              >
                Назад
              </button>
              <button
                className="button ghost"
                disabled={wizard.step === INVENTORY_PPE_WIZARD_STEPS.length - 1}
                onClick={() => onStepChange(Math.min(INVENTORY_PPE_WIZARD_STEPS.length - 1, wizard.step + 1))}
                type="button"
              >
                Далее
              </button>
              <button className="button ghost" disabled={!wizard.lines.length || busy} onClick={() => onSave(true)} type="button">
                Подтвердить выдачу
              </button>
              <button className="button primary" disabled={!wizard.employeeId || busy} onClick={() => onSave(false)} type="button">
                {busy ? "Сохранение..." : "Сохранить карточку"}
              </button>
            </div>
          </footer>
        </div>

        <aside className="inventory-ppe-wizard-preview">
          <div className="inventory-ppe-preview-head">
            <div>
              <h3>Предпросмотр печати</h3>
              <p>Клиентский бланк до сохранения. DOCX доступен после сохранения карточки.</p>
            </div>
            <div className="inventory-ppe-print-tabs is-compact" role="tablist" aria-label="Быстрый предпросмотр">
              <button
                className={printPreviewMode === "card" ? "is-active" : ""}
                onClick={() => setPrintPreviewMode("card")}
                type="button"
              >
                Карточка
              </button>
              <button
                className={printPreviewMode === "sheet" ? "is-active" : ""}
                onClick={() => setPrintPreviewMode("sheet")}
                type="button"
              >
                Лист
              </button>
            </div>
          </div>
          <PrintPaper data={printData} mode={printPreviewMode} />
        </aside>
      </div>
    </section>
  );
}

function EmployeeCombobox({ employees, onChange, value }: EmployeeComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedEmployee = employees.find((employee) => employee.id === value) ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    setQuery(selectedEmployee ? formatEmployeeOption(selectedEmployee) : "");
  }, [selectedEmployee]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedEmployee ? formatEmployeeOption(selectedEmployee) : "");
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedEmployee]);

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          employees
            .filter((employee) => employee.status !== "archived")
            .map((employee) => employee.department.trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, "ru")),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (employee.status === "archived") {
        return false;
      }

      if (department && employee.department !== department) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return [employee.fullName, employee.personnelNo, employee.position, employee.department]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [department, employees, query]);

  return (
    <div className="inventory-ppe-combobox" ref={rootRef}>
      <div className="inventory-ppe-combobox-controls">
        <div className="inventory-ppe-combobox-input">
          <Search size={16} />
          <input
            aria-expanded={isOpen}
            aria-label="Поиск сотрудника"
            onChange={(event) => {
              const nextValue = event.target.value;
              setQuery(nextValue);
              setIsOpen(true);
              if (!nextValue.trim() && value) {
                onChange("");
              }
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="ФИО, табельный номер, должность"
            role="combobox"
            value={query}
          />
          {value ? (
            <button
              aria-label="Очистить сотрудника"
              className="inventory-ppe-combobox-clear"
              onClick={() => {
                onChange("");
                setQuery("");
                setIsOpen(true);
              }}
              type="button"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <select
          aria-label="Фильтр сотрудников по подразделению"
          className="inventory-ppe-combobox-department"
          onChange={(event) => {
            setDepartment(event.target.value);
            setIsOpen(true);
          }}
          value={department}
        >
          <option value="">Все подразделения</option>
          {departmentOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {isOpen ? (
        <div className="inventory-ppe-combobox-list" role="listbox">
          {filteredEmployees.length ? (
            filteredEmployees.slice(0, 12).map((employee) => (
              <button
                className={employee.id === value ? "is-selected" : ""}
                key={employee.id}
                onClick={() => {
                  onChange(employee.id);
                  setQuery(formatEmployeeOption(employee));
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <strong>{employee.fullName}</strong>
                <small>{[employee.position, employee.department, employee.personnelNo].filter(Boolean).join(" / ")}</small>
              </button>
            ))
          ) : (
            <div className="inventory-ppe-combobox-empty">Сотрудник не найден. Измените поиск или подразделение.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatEmployeeOption(employee: InventoryEmployeeDto) {
  return [employee.fullName, employee.personnelNo].filter(Boolean).join(" / ");
}


export { PpeItemPickerModal } from "./PpeItemPickerModal";
