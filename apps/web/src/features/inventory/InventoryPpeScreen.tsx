import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, HardHat, Link2, Printer, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryHistoryDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPpeCardsResponseDto,
  InventoryPpeEmployeeDetailsDto,
  InventoryPpeModuleOptionsDto,
  InventoryPositionNormDto,
  InventorySettingsDto,
  UpsertInventoryPpeCardLineDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import {
  formatDate,
  formatQuantity,
  getDefaultDueDate,
  getDefaultIssuePeriodText,
  getInitials,
  itemModelDescription,
  moneyMinorToInput,
  parsePositiveQuantity,
  printDataFromDetail,
  saveApiFile,
  statusLabel,
  toItemFromNorm,
  validatePpeEmployeePrintDetails,
  PpeKpi,
  PpeState,
  PpeStatus,
} from "./ppe/ppeCommon";
import { PrintPaper, PrintPreviewModal, printDocument } from "./ppe/ppePrint";
import { PpeHistoryTable } from "./ppe/PpeDrawerTables";
import { isPpeSignatureStatus, PPE_ISSUE_STATUS_OPTIONS, PPE_STATUS, ppeIssueStatusLabel } from "./ppe/ppeStatusCatalog";
import {
  loadPpeNormMappings,
  mappedItemForNorm,
  ppeNormKey,
  ppeNormKeyFromNorm,
  savePpeNormMapping,
  type PpeNormItemCatalogMapping,
} from "./ppe/ppeNormMapping";
import type { ApiFile, PrintData, PrintMode } from "./ppe/ppeTypes";
import "./inventoryWeb.css";

type InventoryPpeScreenProps = {
  cards?: InventoryPpeCardsResponseDto;
  employees?: InventoryEmployeeDto[];
  error?: string;
  items?: InventoryItemDto[];
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  options?: InventoryPpeModuleOptionsDto;
  settings?: InventorySettingsDto;
};

type PpeTab = "employee" | "card" | "sheet" | "history" | "print";
type PpeModal =
  | { type: "issue"; row: EmployeePpeNormRow }
  | { type: "edit"; row: EmployeePpeNormRow; line: InventoryPpeCardLineDto }
  | { type: "map"; row: EmployeePpeNormRow }
  | null;

type EmployeePpeNormRow = {
  catalogItem: InventoryItemDto | null;
  existingLine: InventoryPpeCardLineDto | null;
  hasExplicitMapping: boolean;
  isSectionTitle: boolean;
  key: string;
  mapping: PpeNormItemCatalogMapping | null;
  norm: InventoryPositionNormDto | null;
  normItemName: string;
  normPoint: string;
  quantity: number;
  quantityText: string;
  issuePeriodText: string;
};

const PPE_EMPLOYEE_DETAIL_LABELS: Array<[keyof InventoryPpeEmployeeDetailsDto, string]> = [
  ["gender", "Пол"],
  ["height", "Рост"],
  ["clothingSize", "Размер одежды"],
  ["shoeSize", "Размер обуви"],
  ["headSize", "Размер головного убора"],
  ["respiratorSize", "СИЗОД"],
  ["handProtectionSize", "СИЗ рук"],
];

const PPE_ISSUE_METHOD_LABELS = {
  dispenser: "Дозатор",
  personal: "Лично",
} as const;

const EMPTY_EMPLOYEE_DETAILS: InventoryPpeEmployeeDetailsDto = {
  clothingSize: "",
  gender: "",
  handProtectionSize: "",
  headSize: "",
  height: "",
  respiratorSize: "",
  shoeSize: "",
};

export function InventoryPpeScreen({
  cards,
  employees: fallbackEmployees = [],
  error,
  items: fallbackItems = [],
  loading = false,
  onNotify,
  onReload,
  options,
  settings: fallbackSettings,
}: InventoryPpeScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const employees = options?.employees ?? fallbackEmployees;
  const items = options?.items ?? fallbackItems;
  const settings = options?.settings ?? fallbackSettings;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PpeTab>("card");
  const [detail, setDetail] = useState<InventoryPpeCardDetailDto | null>(null);
  const [employeeDepartment, setEmployeeDepartment] = useState("all");
  const [employeePosition, setEmployeePosition] = useState("all");
  const [history, setHistory] = useState<InventoryHistoryDto[]>([]);
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<PpeModal>(null);
  const [preview, setPreview] = useState<{ data: PrintData; mode: PrintMode } | null>(null);
  const [mappings, setMappings] = useState<Record<string, PpeNormItemCatalogMapping>>(() => loadPpeNormMappings());
  const [employeeDetails, setEmployeeDetails] = useState<InventoryPpeEmployeeDetailsDto>(EMPTY_EMPLOYEE_DETAILS);

  const cardsByEmployeeId = useMemo(
    () => new Map((cards?.rows ?? []).map((card) => [card.employeeId, card])),
    [cards?.rows],
  );
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );
  const positionNorms = useMemo(
    () =>
      (settings?.positionNorms ?? []).filter(
        (norm) => selectedEmployee?.position && sameText(norm.positionName, selectedEmployee.position),
      ),
    [selectedEmployee?.position, settings?.positionNorms],
  );
  const employeeDepartments = useMemo(() => uniqueSorted(employees.map((employee) => employee.department)), [employees]);
  const employeePositions = useMemo(() => uniqueSorted(employees.map((employee) => employee.position)), [employees]);
  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLocaleLowerCase("ru-RU");
    return employees.filter((employee) => {
      if (employeeDepartment !== "all" && employee.department !== employeeDepartment) return false;
      if (employeePosition !== "all" && employee.position !== employeePosition) return false;
      if (!query) return true;
      return [employee.fullName, employee.personnelNo, employee.position, employee.department, employee.employeeGroup]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(query);
    });
  }, [employeeDepartment, employeePosition, employeeQuery, employees]);
  const normRows = useMemo(
    () => buildEmployeePpeRows(positionNorms, detail?.lines ?? [], itemsById, mappings, selectedEmployee?.position ?? ""),
    [detail?.lines, itemsById, mappings, positionNorms, selectedEmployee?.position],
  );
  const printData = useMemo(() => buildEmployeePrintData(selectedEmployee, detail, normRows, employeeDetails), [detail, employeeDetails, normRows, selectedEmployee]);
  const issueRows = useMemo(() => printData.lines.filter((line) => !line.isSectionTitle && isPpeSignatureStatus(line.status)), [printData.lines]);
  const printErrors = useMemo(() => validatePpeEmployeePrintDetails(employeeDetails), [employeeDetails]);
  const counts = useMemo(() => calculateEmployeePpeCounts(normRows, printErrors.length), [normRows, printErrors.length]);
  const checkSummary = useMemo(() => buildPpeCheckSummary(normRows, printData, printErrors), [normRows, printData, printErrors]);

  useEffect(() => {
    if (!selectedEmployeeId && employees.length) {
      setSelectedEmployeeId(cards?.rows?.[0]?.employeeId ?? employees[0].id);
    }
  }, [cards?.rows, employees, selectedEmployeeId]);

  const loadEmployeeCard = useCallback(
    async (employeeId: string) => {
      const cardId = cardsByEmployeeId.get(employeeId)?.id;
      if (!cardId) {
        setDetail(null);
        setHistory([]);
        setEmployeeDetails(EMPTY_EMPLOYEE_DETAILS);
        return;
      }

      try {
        setBusy("load-card");
        const [nextDetail, cardHistory, lineHistory] = await Promise.all([
          inventoryRepository.getPpeCard(cardId),
          inventoryRepository.getPpeCardHistory(cardId, { pageSize: 50 }),
          inventoryRepository.getPpeCardLinesHistory(cardId, { pageSize: 50 }),
        ]);
        setDetail(nextDetail);
        setHistory([...cardHistory.rows, ...lineHistory.rows].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
        setEmployeeDetails(nextDetail.employeeDetails ?? EMPTY_EMPLOYEE_DETAILS);
      } catch (loadError) {
        onNotify(loadError instanceof Error ? loadError.message : "Не удалось загрузить карточку СИЗ");
      } finally {
        setBusy("");
      }
    },
    [cardsByEmployeeId, inventoryRepository, onNotify],
  );

  useEffect(() => {
    if (selectedEmployeeId) void loadEmployeeCard(selectedEmployeeId);
  }, [loadEmployeeCard, selectedEmployeeId]);

  async function downloadFile(action: () => Promise<ApiFile>) {
    try {
      saveApiFile(await action());
    } catch (downloadError) {
      onNotify(downloadError instanceof Error ? downloadError.message : "Не удалось сформировать файл");
    }
  }

  async function ensureCard() {
    if (!selectedEmployee) throw new Error("Выберите сотрудника");
    if (detail) {
      return inventoryRepository.updatePpeCard(detail.id, {
        comment: detail.comment ?? null,
        employeeDetails,
        employeeId: selectedEmployee.id,
      });
    }

    return inventoryRepository.createPpeCard({
      comment: `Карточка СИЗ от ${formatDate(new Date().toISOString(), "date")}`,
      employeeDetails,
      employeeId: selectedEmployee.id,
    });
  }

  async function reloadAfterMutation(cardId: string) {
    await onReload();
    const nextDetail = await inventoryRepository.getPpeCard(cardId);
    const [cardHistory, lineHistory] = await Promise.all([
      inventoryRepository.getPpeCardHistory(cardId, { pageSize: 50 }),
      inventoryRepository.getPpeCardLinesHistory(cardId, { pageSize: 50 }),
    ]);
    setDetail(nextDetail);
    setHistory([...cardHistory.rows, ...lineHistory.rows].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
    setEmployeeDetails(nextDetail.employeeDetails ?? EMPTY_EMPLOYEE_DETAILS);
  }

  async function saveEmployeeDetails() {
    if (!selectedEmployee) return;
    try {
      setBusy("save-employee");
      const card = await ensureCard();
      await reloadAfterMutation(card.id);
      onNotify("Данные сотрудника для карточки СИЗ сохранены");
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить данные сотрудника");
    } finally {
      setBusy("");
    }
  }

  async function saveNormIssue(row: EmployeePpeNormRow, draft: PpeIssueDraft) {
    if (!selectedEmployee || row.isSectionTitle) return;
    const item = itemsById.get(draft.itemId);
    if (!item) {
      onNotify("Выберите номенклатуру для выдачи");
      return;
    }
    const quantity = parsePositiveQuantity(draft.quantityText);
    if (!quantity) {
      onNotify("Укажите количество больше нуля");
      return;
    }
    if (isPpeSignatureStatus(draft.status) && !draft.issuedAt) {
      onNotify("Укажите дату выдачи СИЗ");
      return;
    }
    const unitPriceMinor = parseMoneyToMinor(draft.priceText);
    if (unitPriceMinor === null) {
      onNotify("Проверьте цену СИЗ");
      return;
    }

    try {
      setBusy("save-line");
      const card = await ensureCard();
      const nextDraft = {
        ...draft,
        status: draft.status === PPE_STATUS.issued && quantity < row.quantity ? PPE_STATUS.partial : draft.status,
      };
      const payload = buildLinePayload(row, item, nextDraft, quantity, unitPriceMinor);
      const savedLine = row.existingLine
        ? await inventoryRepository.updatePpeCardLine(card.id, row.existingLine.id, payload)
        : await inventoryRepository.addPpeCardLine(card.id, payload);
      if (savedLine.status !== nextDraft.status) {
        await inventoryRepository.updatePpeCardLineStatus(card.id, savedLine.id, { status: nextDraft.status });
      }
      saveMappingForRow(row, item, nextDraft);
      await reloadAfterMutation(card.id);
      setModal(null);
      onNotify(row.existingLine ? "Строка СИЗ обновлена" : "Выдача СИЗ сохранена");
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить выдачу СИЗ");
    } finally {
      setBusy("");
    }
  }

  async function saveMapping(row: EmployeePpeNormRow, itemId: string, brandModelArticle: string, priceText: string, isDefault: boolean) {
    const item = itemsById.get(itemId);
    if (!item) {
      onNotify("Выберите номенклатуру для сопоставления");
      return;
    }
    savePpeNormMapping({
      brandModelArticle: brandModelArticle.trim() || itemModelDescription(item),
      isDefault,
      itemId: item.id,
      normKey: row.key,
      priceText,
    });
    setMappings(loadPpeNormMappings());
    setModal(null);
    onNotify("Сопоставление нормы с номенклатурой сохранено");
  }

  async function updateLineStatus(row: EmployeePpeNormRow, status: string) {
    if (!detail || !row.existingLine) return;
    try {
      setBusy(`status-${row.existingLine.id}`);
      await inventoryRepository.updatePpeCardLineStatus(detail.id, row.existingLine.id, { status });
      await reloadAfterMutation(detail.id);
      onNotify(`Статус обновлен: ${statusLabel(status)}`);
    } catch (statusError) {
      onNotify(statusError instanceof Error ? statusError.message : "Не удалось обновить статус СИЗ");
    } finally {
      setBusy("");
    }
  }

  function openNextIssue() {
    if (!selectedEmployee) return;
    setActiveTab("card");
    const nextRow = findNextIssueRow(normRows);
    if (!nextRow) {
      onNotify(normRows.some((row) => !row.isSectionTitle)
        ? "Все нормы сотрудника уже закрыты фактической выдачей. Откройте строку в личной карточке для правки."
        : "Для должности сотрудника нет норм СИЗ.");
      return;
    }
    setModal(nextRow.existingLine ? { type: "edit", row: nextRow, line: nextRow.existingLine } : { type: "issue", row: nextRow });
  }

  return (
    <section className="inventory-ppe-screen inventory-ppe-redesign inventory-ppe-employee-workflow">
      <header className="inventory-ppe-commandbar">
        <div className="inventory-ppe-title">
          <span className="inventory-ppe-title-icon">
            <HardHat size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>СИЗ</h1>
            <span>Личная карточка сотрудника, нормы по должности, фактическая выдача и печатные формы.</span>
          </div>
        </div>
        <div className="inventory-ppe-command-actions">
          <button className="button ghost" disabled={!selectedEmployee} onClick={() => setPreview({ data: printData, mode: "card" })} type="button">
            <FileText size={16} /> Личная карточка
          </button>
          <button className="button ghost" disabled={!selectedEmployee} onClick={() => setPreview({ data: printData, mode: "sheet" })} type="button">
            <Printer size={16} /> Лист подписи
          </button>
          <button className="button primary" disabled={!selectedEmployee || busy === "load-card"} onClick={openNextIssue} type="button">
            <ShieldCheck size={16} /> Выдать СИЗ
          </button>
        </div>
      </header>

      {error ? <PpeState kind="error" text={error} title="API СИЗ не ответил" /> : null}
      {loading ? <PpeState kind="loading" text="Получаем сотрудников, карточки СИЗ, номенклатуру и настройки." title="Загрузка данных" /> : null}

      {!loading && !error ? (
        <>
          <section className="inventory-ppe-employee-layout">
            <aside className="inventory-ppe-employee-picker" aria-label="Сотрудники">
              <div className="inventory-ppe-panel-head">
                <div>
                  <h2>Сотрудник</h2>
                  <p>{employees.length ? `Доступно ${employees.length}` : "Список пуст"}</p>
                </div>
              </div>
              <label className="inventory-ppe-search">
                <Search size={17} />
                <input
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder="ФИО, табельный, должность"
                  value={employeeQuery}
                />
              </label>
              <div className="inventory-ppe-employee-filters">
                <label>
                  <span>Подразделение</span>
                  <select value={employeeDepartment} onChange={(event) => setEmployeeDepartment(event.target.value)}>
                    <option value="all">Все</option>
                    {employeeDepartments.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Должность</span>
                  <select value={employeePosition} onChange={(event) => setEmployeePosition(event.target.value)}>
                    <option value="all">Все</option>
                    {employeePositions.map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inventory-ppe-employee-list" role="listbox">
                {filteredEmployees.map((employee) => (
                  <button
                    aria-selected={employee.id === selectedEmployeeId}
                    className={employee.id === selectedEmployeeId ? "is-active" : ""}
                    key={employee.id}
                    onClick={() => {
                      setSelectedEmployeeId(employee.id);
                      setActiveTab("card");
                    }}
                    role="option"
                    type="button"
                  >
                    <span>{getInitials(employee.fullName)}</span>
                    <strong>{employee.fullName}</strong>
                    <small>{employee.personnelNo || "Без табельного"} · {employee.position || "Должность не указана"}</small>
                  </button>
                ))}
                {!filteredEmployees.length ? (
                  <div className="inventory-ppe-employee-empty" role="status">
                    <strong>Сотрудники не найдены</strong>
                    <span>Измените поиск, подразделение или должность.</span>
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="inventory-ppe-employee-card">
              <EmployeePpeHeader
                cardDate={detail?.createdAt}
                counts={counts}
                employee={selectedEmployee}
                hasCard={Boolean(detail)}
                loading={busy === "load-card"}
              />
              <PpeTabs activeTab={activeTab} onChange={setActiveTab} />

              {activeTab === "employee" ? (
                <EmployeeDetailsTab
                  busy={busy === "save-employee"}
                  details={employeeDetails}
                  employee={selectedEmployee}
                  onChange={(patch) => setEmployeeDetails((current) => ({ ...current, ...patch }))}
                  onSave={() => void saveEmployeeDetails()}
                  printErrors={printErrors}
                />
              ) : null}

              {activeTab === "card" ? (
                <PersonalCardTab
                  busy={busy}
                  rows={normRows}
                  onEdit={(row) => row.existingLine && setModal({ type: "edit", row, line: row.existingLine })}
                  onIssue={(row) => setModal({ type: "issue", row })}
                  onMap={(row) => setModal({ type: "map", row })}
                  onStatus={(row, status) => void updateLineStatus(row, status)}
                />
              ) : null}

              {activeTab === "sheet" ? <SignatureSheetTab rows={issueRows} /> : null}

              {activeTab === "history" ? (
                <section className="inventory-ppe-tab-panel">
                  <PpeHistoryTable rows={history} />
                </section>
              ) : null}

              {activeTab === "print" ? (
                <PrintCheckTab
                  detail={detail}
                  employee={selectedEmployee}
                  errors={printErrors}
                  rows={normRows}
                  onDownload={downloadFile}
                  onPreview={(mode) => setPreview({ data: printData, mode })}
                  printData={printData}
                />
              ) : null}
            </main>

            <PpeQuickPanel
              counts={counts}
              employee={selectedEmployee}
              history={history}
              onDownload={downloadFile}
              onPreview={(mode) => setPreview({ data: printData, mode })}
              printData={printData}
              summary={checkSummary}
              detail={detail}
            />
          </section>

          {modal?.type === "issue" || modal?.type === "edit" ? (
            <PpeIssueModal
              busy={busy === "save-line"}
              items={items}
              mode={modal.type}
              onClose={() => setModal(null)}
              onSave={(draft) => void saveNormIssue(modal.row, draft)}
              row={modal.row}
            />
          ) : null}

          {modal?.type === "map" ? (
            <PpeMappingModal
              items={items}
              mapping={mappings[modal.row.key]}
              onClose={() => setModal(null)}
              onSave={(itemId, brandModelArticle, priceText, isDefault) => void saveMapping(modal.row, itemId, brandModelArticle, priceText, isDefault)}
              row={modal.row}
            />
          ) : null}
        </>
      ) : null}

      {preview ? (
        <PrintPreviewModal
          data={preview.data}
          mode={preview.mode}
          onClose={() => setPreview(null)}
          onModeChange={(mode) => setPreview({ ...preview, mode })}
          onPrint={(data, mode) => printDocument(data, mode)}
        />
      ) : null}
    </section>
  );

  function saveMappingForRow(row: EmployeePpeNormRow, item: InventoryItemDto, draft: PpeIssueDraft) {
    savePpeNormMapping({
      brandModelArticle: draft.brandModelArticle.trim() || itemModelDescription(item),
      isDefault: false,
      itemId: item.id,
      normKey: row.key,
      priceText: draft.priceText,
    });
    setMappings(loadPpeNormMappings());
  }
}

function EmployeePpeHeader({
  cardDate,
  counts,
  employee,
  hasCard,
  loading,
}: {
  cardDate?: string;
  counts: ReturnType<typeof calculateEmployeePpeCounts>;
  employee: InventoryEmployeeDto | null;
  hasCard: boolean;
  loading: boolean;
}) {
  if (!employee) {
    return <PpeState kind="empty" title="Сотрудник не выбран" text="Выберите сотрудника слева, чтобы открыть нормы СИЗ по должности." />;
  }

  return (
    <section className="inventory-ppe-employee-summary">
      <div className="inventory-ppe-employee-person">
        <span>{getInitials(employee.fullName)}</span>
        <div>
          <p>{hasCard ? "Карточка СИЗ" : "Новая карточка по нормам"}</p>
          <h2>{employee.fullName}</h2>
          <small>
            {employee.personnelNo || "Без табельного"} · {employee.position || "Должность не указана"} · {employee.department || "Подразделение не указано"}
          </small>
        </div>
      </div>
      <div className="inventory-ppe-card-date">
        <CalendarDays size={17} />
        <span>{loading ? "Загрузка..." : cardDate ? formatDate(cardDate, "date") : "Еще не сохранена"}</span>
      </div>
      <div className="inventory-ppe-kpis inventory-ppe-employee-kpis">
        <PpeKpi label="Нормы" value={counts.norms} />
        <PpeKpi label="Выдано" tone="green" value={counts.issued} />
        <PpeKpi label="Частично" tone={counts.partial ? "red" : "slate"} value={counts.partial} />
        <PpeKpi label="Не выдано" value={counts.notIssued} />
        <PpeKpi label="Просрочено" tone={counts.overdue ? "red" : "slate"} value={counts.overdue} />
        <PpeKpi label="Ошибки" tone={counts.errors ? "red" : "slate"} value={counts.errors} />
      </div>
    </section>
  );
}

function PpeTabs({ activeTab, onChange }: { activeTab: PpeTab; onChange: (tab: PpeTab) => void }) {
  const tabs: Array<[PpeTab, string]> = [
    ["employee", "Данные сотрудника"],
    ["card", "Личная карточка"],
    ["sheet", "Лист подписи"],
    ["history", "История выдачи"],
    ["print", "Проверка и печать"],
  ];

  return (
    <nav className="inventory-ppe-tabs" aria-label="Разделы карточки СИЗ">
      {tabs.map(([tab, label]) => (
        <button className={activeTab === tab ? "is-active" : ""} key={tab} onClick={() => onChange(tab)} type="button">
          {label}
        </button>
      ))}
    </nav>
  );
}

function EmployeeDetailsTab({
  busy,
  details,
  employee,
  onChange,
  onSave,
  printErrors,
}: {
  busy: boolean;
  details: InventoryPpeEmployeeDetailsDto;
  employee: InventoryEmployeeDto | null;
  onChange: (patch: Partial<InventoryPpeEmployeeDetailsDto>) => void;
  onSave: () => void;
  printErrors: string[];
}) {
  return (
    <section className="inventory-ppe-tab-panel">
      <div className="inventory-ppe-data-grid">
        <ReadOnlyPpeField label="ФИО" value={employee?.fullName || "Не выбран"} />
        <ReadOnlyPpeField label="Табельный номер" value={employee?.personnelNo || "Не указан"} />
        <ReadOnlyPpeField label="Должность" value={employee?.position || "Не указана"} />
        <ReadOnlyPpeField label="Подразделение" value={employee?.department || "Не указано"} />
        <ReadOnlyPpeField label="Дата приема" value={formatDateOrDash(employee?.hiredAt)} />
        <ReadOnlyPpeField label="Дата перевода" value="Не указана" />
      </div>
      <div className="inventory-ppe-detail-form">
        {PPE_EMPLOYEE_DETAIL_LABELS.map(([field, label]) => (
          <label key={field}>
            <span>{label}</span>
            <input value={details[field] ?? ""} onChange={(event) => onChange({ [field]: event.target.value })} />
          </label>
        ))}
      </div>
      {printErrors.length ? (
        <div className="inventory-ppe-inline-warning">
          {printErrors.length} полей для печати не заполнено. Печать останется доступной, но в бланке будут пустые строки.
        </div>
      ) : null}
      <footer className="inventory-ppe-tab-actions">
        <button className="button primary" disabled={busy || !employee} onClick={onSave} type="button">
          {busy ? "Сохранение..." : "Сохранить данные"}
        </button>
      </footer>
    </section>
  );
}

function PersonalCardTab({
  busy,
  rows,
  onEdit,
  onIssue,
  onMap,
  onStatus,
}: {
  busy: string;
  rows: EmployeePpeNormRow[];
  onEdit: (row: EmployeePpeNormRow) => void;
  onIssue: (row: EmployeePpeNormRow) => void;
  onMap: (row: EmployeePpeNormRow) => void;
  onStatus: (row: EmployeePpeNormRow, status: string) => void;
}) {
  if (!rows.length) {
    return (
      <section className="inventory-ppe-tab-panel">
        <PpeState kind="empty" title="Нормы не найдены" text="Для должности сотрудника нет норм СИЗ. Проверьте настройки норм в бухгалтерии." />
      </section>
    );
  }

  return (
    <section className="inventory-ppe-tab-panel">
      <PpeNormToolbar stats={calculatePpeNormToolbarStats(rows)} />
      <div className="inventory-ppe-norm-table-wrap">
        <table className="inventory-ppe-lines-table inventory-ppe-norm-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Наименование СИЗ</th>
              <th>Пункт норм</th>
              <th>Единица измерения, периодичность выдачи</th>
              <th>Количество на период</th>
              <th>Связанная номенклатура</th>
              <th>Статус выдачи</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className={ppeNormRowClass(row)} key={row.key}>
                <td>{row.isSectionTitle ? "" : index + 1}</td>
                <td>
                  <strong>{row.normItemName}</strong>
                  {row.isSectionTitle ? <span>Раздел личной карточки</span> : null}
                </td>
                <td>{row.isSectionTitle ? "-" : row.normPoint || "Не указан"}</td>
                <td>{row.isSectionTitle ? "-" : row.issuePeriodText || "Период не указан"}</td>
                <td>{row.isSectionTitle ? "-" : row.quantityText}</td>
                <td>
                  {row.isSectionTitle ? (
                    "-"
                  ) : (
                    <>
                      <strong>{row.hasExplicitMapping || row.existingLine ? row.catalogItem?.name || row.existingLine?.itemName || "Не сопоставлено" : "Не сопоставлено"}</strong>
                      <span>
                        {row.hasExplicitMapping
                          ? row.mapping?.brandModelArticle || row.catalogItem?.article || row.catalogItem?.sku || "Связь сохранена"
                          : row.existingLine
                            ? row.existingLine.brandModelArticle || row.existingLine.itemName
                            : "Связь не создает выдачу сама по себе"}
                      </span>
                    </>
                  )}
                </td>
                <td>{row.existingLine ? <PpeStatus status={row.existingLine.status} /> : row.isSectionTitle ? "Не выдается" : <PpeStatus status={PPE_STATUS.notIssued} />}</td>
                <td>
                  <div className="inventory-ppe-row-actions-compact">
                    {!row.isSectionTitle ? (
                      <>
                        <button className="button ghost" onClick={() => onMap(row)} type="button">
                          <Link2 size={15} /> Сопоставить
                        </button>
                        {!row.existingLine ? (
                          <button className="button primary" disabled={busy === "save-line"} onClick={() => onIssue(row)} type="button">
                            Выдать
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {row.existingLine && !row.isSectionTitle ? (
                      <>
                        <button className="button ghost" onClick={() => onEdit(row)} type="button">
                          Редактировать
                        </button>
                        <button className="button ghost" disabled={busy === `status-${row.existingLine.id}`} onClick={() => onStatus(row, PPE_STATUS.returned)} type="button">
                          Вернуть
                        </button>
                        <button className="button ghost danger" disabled={busy === `status-${row.existingLine.id}`} onClick={() => onStatus(row, PPE_STATUS.writtenOff)} type="button">
                          Списать
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignatureSheetTab({ rows }: { rows: PrintData["lines"] }) {
  const returnedCount = rows.filter((row) => row.status === PPE_STATUS.returned || row.status === PPE_STATUS.writtenOff).length;

  return (
    <section className="inventory-ppe-tab-panel">
      {rows.length ? (
        <div className="inventory-ppe-norm-table-wrap">
          <table className="inventory-ppe-lines-table inventory-ppe-signature-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Наименование СИЗ</th>
                <th>Модель / марка / артикул</th>
                <th>Дата выдачи</th>
                <th>Количество</th>
                <th>Лично / дозатор</th>
                <th>Подпись получившего</th>
                <th>Возврат: дата</th>
                <th>Возврат: кол-во</th>
                <th>Акт списания</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.itemName}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{row.printItemName || row.itemName}</td>
                  <td>{row.brandModelArticle || row.model || "-"}</td>
                  <td>{formatDate(row.issuedAt, "date")}</td>
                  <td>{row.quantityText || `${formatQuantity(row.quantity)} ${row.unit}`}</td>
                  <td>{issueMethodLabel(row)}</td>
                  <td><span className="inventory-ppe-signature-placeholder" aria-hidden="true" /></td>
                  <td>{row.status === PPE_STATUS.returned || row.status === PPE_STATUS.writtenOff ? formatDate(row.dueAt, "date") : "-"}</td>
                  <td>{row.status === PPE_STATUS.returned || row.status === PPE_STATUS.writtenOff ? row.quantityText || `${formatQuantity(row.quantity)} ${row.unit}` : "-"}</td>
                  <td>{row.status === PPE_STATUS.writtenOff ? "Требуется акт" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="inventory-ppe-table-summary">
            <strong>Выдано позиций: {rows.length}</strong>
            <strong>Возвращено / списано: {returnedCount}</strong>
          </footer>
        </div>
      ) : (
        <PpeState kind="empty" title="Лист подписи пуст" text="В лист попадают только фактически выданные строки. Нормы и разделы остаются в личной карточке." />
      )}
    </section>
  );
}

function PpeNormToolbar({ stats }: { stats: ReturnType<typeof calculatePpeNormToolbarStats> }) {
  return (
    <div className="inventory-ppe-norm-toolbar" aria-label="Сводка по нормам СИЗ">
      <div>
        <strong>Нормы по должности</strong>
        <span>Норма, номенклатура и факт выдачи разделены. Сопоставление не создает выдачу.</span>
      </div>
      <div className="inventory-ppe-norm-toolbar-metrics">
        <span><b>{stats.norms}</b> норм</span>
        <span><b>{stats.mapped}</b> сопоставлено</span>
        <span><b>{stats.issued}</b> выдано</span>
        <span className={stats.needsAction ? "is-warning" : "is-ok"}><b>{stats.needsAction}</b> требуют действия</span>
      </div>
    </div>
  );
}

function calculatePpeNormToolbarStats(rows: EmployeePpeNormRow[]) {
  const normRows = rows.filter((row) => !row.isSectionTitle);
  const issued = normRows.filter((row) => row.existingLine && isPpeSignatureStatus(row.existingLine.status)).length;
  const mapped = normRows.filter((row) => row.hasExplicitMapping || row.existingLine).length;
  const needsAction = normRows.filter((row) => !row.existingLine || !isPpeSignatureStatus(row.existingLine.status) || (!row.hasExplicitMapping && !row.existingLine)).length;
  return {
    issued,
    mapped,
    needsAction,
    norms: normRows.length,
  };
}

function ppeNormRowClass(row: EmployeePpeNormRow) {
  const classNames = ["inventory-ppe-norm-row"];
  if (row.isSectionTitle) {
    classNames.push("is-section-title");
    return classNames.join(" ");
  }
  if (!row.hasExplicitMapping && !row.existingLine) classNames.push("is-unmapped");
  if (!row.existingLine) {
    classNames.push("is-status-not-issued");
  } else {
    classNames.push(`is-status-${row.existingLine.status.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").toLowerCase()}`);
  }
  return classNames.join(" ");
}

function findNextIssueRow(rows: EmployeePpeNormRow[]) {
  const issueRows = rows.filter((row) => !row.isSectionTitle);
  return issueRows.find((row) => !row.existingLine)
    ?? issueRows.find((row) => row.existingLine?.status === PPE_STATUS.partial)
    ?? issueRows.find((row) => row.existingLine && !isPpeSignatureStatus(row.existingLine.status))
    ?? issueRows[0]
    ?? null;
}

function PrintCheckTab({
  detail,
  employee,
  errors,
  rows,
  onDownload,
  onPreview,
  printData,
}: {
  detail: InventoryPpeCardDetailDto | null;
  employee: InventoryEmployeeDto | null;
  errors: string[];
  rows: EmployeePpeNormRow[];
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onPreview: (mode: PrintMode) => void;
  printData: PrintData;
}) {
  const inventoryRepository = useInventoryRepository();
  const summary = buildPpeCheckSummary(rows, printData, errors);

  return (
    <section className="inventory-ppe-tab-panel inventory-ppe-print-check">
      <div className="inventory-ppe-print-check-grid">
        <PrintCheckCard
          count={errors.length}
          tone={errors.length ? "warning" : "ok"}
          title="Пустые поля сотрудника"
          rows={errors.map((row) => row.replace("Заполните поле ", ""))}
        />
        <PrintCheckCard
          count={summary.unmappedRows.length}
          tone={summary.unmappedRows.length ? "warning" : "ok"}
          title="Нормы без номенклатуры"
          rows={summary.unmappedRows.map((row) => row.normItemName)}
        />
        <PrintCheckCard
          count={summary.notIssuedRows.length}
          tone={summary.notIssuedRows.length ? "danger" : "ok"}
          title="Нормы без выдачи"
          rows={summary.notIssuedRows.map((row) => row.normItemName)}
        />
        <PrintCheckCard
          count={summary.overdueRows.length}
          tone={summary.overdueRows.length ? "danger" : "ok"}
          title="Просроченные выдачи"
          rows={summary.overdueRows.map((row) => row.normItemName)}
        />
        <PrintCheckCard
          count={summary.printableCardRows}
          tone="info"
          title="Попадет в личную карточку"
          rows={[`${summary.printableCardRows} строк с нормами и разделами`]}
        />
        <PrintCheckCard
          count={summary.printableSheetRows}
          tone="info"
          title="Попадет в лист подписи"
          rows={[`${summary.printableSheetRows} фактических выдач`]}
        />
      </div>
      <div className="inventory-ppe-print-actions">
        <button className="button ghost" disabled={!employee} onClick={() => onPreview("card")} type="button">
          Предпросмотр карточки
        </button>
        <button className="button ghost" disabled={!employee} onClick={() => onPreview("sheet")} type="button">
          Предпросмотр листа подписи
        </button>
        <button className="button ghost" disabled={!detail} onClick={() => detail && void onDownload(() => inventoryRepository.printPpeCard(detail.id, "card", "docx"))} type="button">
          DOCX карточка
        </button>
        <button className="button ghost" disabled={!detail} onClick={() => detail && void onDownload(() => inventoryRepository.printPpeCard(detail.id, "sheet", "docx"))} type="button">
          DOCX лист
        </button>
      </div>
      {errors.length ? (
        <div className="inventory-ppe-inline-warning">
          Перед печатью желательно заполнить: {errors.map((row) => row.replace("Заполните поле ", "")).join(", ")}.
        </div>
      ) : null}
      <div className="inventory-ppe-print-preview">
        <PrintPaper data={printData} mode="card" />
      </div>
    </section>
  );
}

function PpeQuickPanel({
  counts,
  detail,
  employee,
  history,
  onDownload,
  onPreview,
  printData,
  summary,
}: {
  counts: ReturnType<typeof calculateEmployeePpeCounts>;
  detail: InventoryPpeCardDetailDto | null;
  employee: InventoryEmployeeDto | null;
  history: InventoryHistoryDto[];
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onPreview: (mode: PrintMode) => void;
  printData: PrintData;
  summary: PpeCheckSummary;
}) {
  const inventoryRepository = useInventoryRepository();
  const recentHistory = history.slice(0, 4);

  return (
    <aside className="inventory-ppe-side-panel" aria-label="Быстрая проверка СИЗ">
      <section>
        <div className="inventory-ppe-side-head">
          <strong>Проверка</strong>
          <span>{employee ? employee.fullName : "Сотрудник не выбран"}</span>
        </div>
        <div className="inventory-ppe-side-metrics">
          <PpeSideMetric label="Нормы" value={counts.norms} />
          <PpeSideMetric label="Выдано" tone="ok" value={counts.issued} />
          <PpeSideMetric label="Частично" tone={counts.partial ? "warn" : "soft"} value={counts.partial} />
          <PpeSideMetric label="Ошибки" tone={counts.errors ? "danger" : "soft"} value={counts.errors} />
        </div>
      </section>

      <section>
        <div className="inventory-ppe-side-head">
          <strong>Документы</strong>
          <span>Что попадет в печать</span>
        </div>
        <div className="inventory-ppe-side-list">
          <span>Личная карточка <b>{summary.printableCardRows}</b></span>
          <span>Лист подписи <b>{summary.printableSheetRows}</b></span>
          <span>Не сопоставлено <b>{summary.unmappedRows.length}</b></span>
          <span>Не выдано <b>{summary.notIssuedRows.length}</b></span>
        </div>
        <div className="inventory-ppe-side-actions">
          <button className="button ghost" disabled={!employee} onClick={() => onPreview("card")} type="button">
            Предпросмотр карточки
          </button>
          <button className="button ghost" disabled={!employee} onClick={() => onPreview("sheet")} type="button">
            Предпросмотр листа
          </button>
          <button className="button ghost" disabled={!detail} onClick={() => detail && void onDownload(() => inventoryRepository.printPpeCard(detail.id, "card", "docx"))} type="button">
            DOCX карточка
          </button>
          <button className="button ghost" disabled={!detail} onClick={() => detail && void onDownload(() => inventoryRepository.printPpeCard(detail.id, "sheet", "docx"))} type="button">
            DOCX лист
          </button>
          <button className="button primary" disabled={!employee} onClick={() => printDocument(printData, "card")} type="button">
            PDF / печать
          </button>
        </div>
      </section>

      <section>
        <div className="inventory-ppe-side-head">
          <strong>Последние действия</strong>
          <span>{recentHistory.length ? `${recentHistory.length} последних` : "История пуста"}</span>
        </div>
        <div className="inventory-ppe-side-history">
          {recentHistory.length ? recentHistory.map((row) => (
            <article key={row.id}>
              <strong>{row.action}</strong>
              <span>{formatDate(row.createdAt, "datetime")}</span>
              <p>{row.description || row.itemName || "Без комментария"}</p>
            </article>
          )) : <p>После выдачи здесь появится движение по карточке.</p>}
        </div>
      </section>
    </aside>
  );
}

function PpeSideMetric({ label, tone = "soft", value }: { label: string; tone?: "danger" | "ok" | "soft" | "warn"; value: number }) {
  return (
    <div className={`inventory-ppe-side-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type PpeIssueDraft = {
  brandModelArticle: string;
  comment: string;
  dueAt: string;
  issueMethod: "personal" | "dispenser";
  issuedAt: string;
  itemId: string;
  priceText: string;
  quantityText: string;
  sizeText: string;
  status: string;
  unitText: string;
};

function PpeIssueModal({
  busy,
  items,
  mode,
  onClose,
  onSave,
  row,
}: {
  busy: boolean;
  items: InventoryItemDto[];
  mode: "issue" | "edit";
  onClose: () => void;
  onSave: (draft: PpeIssueDraft) => void;
  row: EmployeePpeNormRow;
}) {
  const line = row.existingLine;
  const initialItem = row.catalogItem ?? (line ? itemFromLine(line) : items.find((item) => item.id === row.norm?.itemId) ?? null);
  const [draft, setDraft] = useState<PpeIssueDraft>({
    brandModelArticle: line?.brandModelArticle || (initialItem ? itemModelDescription(initialItem) : ""),
    comment: "",
    dueAt: line?.dueAt?.slice(0, 10) ?? (row.norm?.lifeMonths ? getDefaultDueDate(row.norm.lifeMonths) : ""),
    issueMethod: initialItem?.isConsumable ? "dispenser" : "personal",
    issuedAt: line?.issuedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    itemId: initialItem?.id ?? row.norm?.itemId ?? items[0]?.id ?? "",
    priceText: moneyMinorToInput(line?.unitPriceMinor ?? initialItem?.defaultUnitPriceMinor ?? 0),
    quantityText: line?.quantityText || row.quantityText,
    sizeText: initialItem ? defaultItemSize(initialItem) : "",
    status: line?.status && line.status !== PPE_STATUS.notIssued ? line.status : PPE_STATUS.issued,
    unitText: line?.unit || initialItem?.unit || "шт.",
  });

  return createPortal(
    <div className="inventory-ppe-picker-backdrop" onMouseDown={onClose} role="presentation">
      <section className="inventory-ppe-picker inventory-ppe-action-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="Выдать СИЗ">
        <header className="inventory-ppe-picker-head">
          <div>
            <h2>{mode === "edit" ? "Редактировать выдачу" : "Выдать СИЗ"}</h2>
            <p>{row.normItemName}</p>
          </div>
          <button className="inventory-ppe-icon-button" onClick={onClose} type="button" aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="inventory-ppe-modal-norm-card">
          <span>Норма</span>
          <strong>{row.normItemName}</strong>
          <dl>
            <div><dt>Пункт норм</dt><dd>{row.normPoint || "Не указан"}</dd></div>
            <div><dt>Периодичность</dt><dd>{row.issuePeriodText || "Не указана"}</dd></div>
            <div><dt>Количество по норме</dt><dd>{row.quantityText || "Не указано"}</dd></div>
          </dl>
        </div>
        <div className="inventory-ppe-modal-form">
          <section className="inventory-ppe-modal-section is-wide">
            <h3>Каталог</h3>
          <label className="is-wide">
            <span>Номенклатура</span>
            <select value={draft.itemId} onChange={(event) => setDraft((current) => patchDraftForItem(current, items, event.target.value))}>
              {items.filter(isPpeItem).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="is-wide">
            <span>Модель, марка, артикул</span>
            <input value={draft.brandModelArticle} onChange={(event) => setDraft((current) => ({ ...current, brandModelArticle: event.target.value }))} />
          </label>
          </section>
          <section className="inventory-ppe-modal-section is-wide">
            <h3>Факт выдачи</h3>
          <label>
            <span>Количество</span>
            <input inputMode="decimal" value={draft.quantityText} onChange={(event) => setDraft((current) => ({ ...current, quantityText: event.target.value }))} />
          </label>
          <label>
            <span>Единица</span>
            <input value={draft.unitText} onChange={(event) => setDraft((current) => ({ ...current, unitText: event.target.value }))} />
          </label>
          <label>
            <span>Цена</span>
            <input inputMode="decimal" value={draft.priceText} onChange={(event) => setDraft((current) => ({ ...current, priceText: event.target.value }))} />
          </label>
          <label>
            <span>Дата выдачи</span>
            <input type="date" value={draft.issuedAt} onChange={(event) => setDraft((current) => ({ ...current, issuedAt: event.target.value }))} />
          </label>
          <label>
            <span>Контрольная дата</span>
            <input type="date" value={draft.dueAt} onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))} />
          </label>
          <label>
            <span>Размер</span>
            <input value={draft.sizeText} onChange={(event) => setDraft((current) => ({ ...current, sizeText: event.target.value }))} />
          </label>
          <label>
            <span>Способ выдачи</span>
            <select value={draft.issueMethod} onChange={(event) => setDraft((current) => ({ ...current, issueMethod: event.target.value as PpeIssueDraft["issueMethod"] }))}>
              <option value="personal">Лично</option>
              <option value="dispenser">Дозатор</option>
            </select>
          </label>
          <label className="is-wide">
            <span>Статус</span>
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
              {PPE_ISSUE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {ppeIssueStatusLabel(option.value)}
                </option>
              ))}
              <option value={PPE_STATUS.returned}>{ppeIssueStatusLabel(PPE_STATUS.returned)}</option>
              <option value={PPE_STATUS.writtenOff}>{ppeIssueStatusLabel(PPE_STATUS.writtenOff)}</option>
            </select>
          </label>
          <label className="is-wide">
            <span>Комментарий</span>
            <textarea value={draft.comment} onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))} />
          </label>
          </section>
        </div>
        <footer className="inventory-ppe-picker-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={busy} onClick={() => onSave(draft)} type="button">
            {busy ? "Сохранение..." : "Сохранить"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function PpeMappingModal({
  items,
  mapping,
  onClose,
  onSave,
  row,
}: {
  items: InventoryItemDto[];
  mapping?: PpeNormItemCatalogMapping;
  onClose: () => void;
  onSave: (itemId: string, brandModelArticle: string, priceText: string, isDefault: boolean) => void;
  row: EmployeePpeNormRow;
}) {
  const initialPpeItem = items.find(isPpeItem);
  const initialItemId = mapping?.itemId || row.catalogItem?.id || row.norm?.itemId || initialPpeItem?.id || "";
  const initialItem = items.find((item) => item.id === initialItemId);
  const [itemId, setItemId] = useState(initialItemId);
  const [brandModelArticle, setBrandModelArticle] = useState(mapping?.brandModelArticle || (initialItem ? itemModelDescription(initialItem) : ""));
  const [priceText, setPriceText] = useState(mapping?.priceText || moneyMinorToInput(initialItem?.defaultUnitPriceMinor ?? 0));
  const [isDefault, setIsDefault] = useState(mapping?.isDefault ?? true);
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    const ppeItems = items.filter(isPpeItem);
    if (!normalized) return ppeItems;
    return ppeItems.filter((item) =>
      [item.name, item.normItemName, item.actualItemName, item.brandName, item.modelName, item.article, item.sku, item.protectionClass]
        .some((value) => value.toLocaleLowerCase("ru-RU").includes(normalized)),
    );
  }, [items, query]);
  const selectedItem = items.find((item) => item.id === itemId);
  const visibleItems = selectedItem && !filteredItems.some((item) => item.id === selectedItem.id)
    ? [selectedItem, ...filteredItems]
    : filteredItems;
  const canSaveMapping = Boolean(itemId && visibleItems.some((item) => item.id === itemId));

  return createPortal(
    <div className="inventory-ppe-picker-backdrop" onMouseDown={onClose} role="presentation">
      <section className="inventory-ppe-picker inventory-ppe-action-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="Сопоставить норму">
        <header className="inventory-ppe-picker-head">
          <div>
            <h2>Сопоставить норму</h2>
            <p>{row.normItemName}</p>
          </div>
          <button className="inventory-ppe-icon-button" onClick={onClose} type="button" aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="inventory-ppe-modal-norm-card">
          <span>Норма</span>
          <strong>{row.normItemName}</strong>
          <dl>
            <div><dt>Пункт норм</dt><dd>{row.normPoint || "Не указан"}</dd></div>
            <div><dt>Периодичность</dt><dd>{row.issuePeriodText || "Не указана"}</dd></div>
            <div><dt>Количество</dt><dd>{row.quantityText || "Не указано"}</dd></div>
          </dl>
        </div>
        <div className="inventory-ppe-modal-form">
          <label className="is-wide">
            <span>Поиск номенклатуры</span>
            <input
              placeholder="Название, марка, модель, артикул..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="inventory-ppe-mapping-hint is-wide" role="status">
            <span>Найдено позиций: {filteredItems.length}</span>
            <strong>{selectedItem ? selectedItem.name : "Номенклатура не выбрана"}</strong>
          </div>
          <label className="is-wide">
            <span>Номенклатура каталога</span>
            <select
              disabled={!visibleItems.length}
              value={itemId}
              onChange={(event) => {
                const nextItem = items.find((item) => item.id === event.target.value);
                setItemId(event.target.value);
                setBrandModelArticle(nextItem ? itemModelDescription(nextItem) : "");
                setPriceText(moneyMinorToInput(nextItem?.defaultUnitPriceMinor ?? 0));
              }}
            >
              {!visibleItems.length ? (
                <option value="">Ничего не найдено</option>
              ) : null}
              {visibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {[item.name, itemModelDescription(item)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </label>
          <label className="is-wide">
            <span>Модель, марка, артикул по умолчанию</span>
            <input value={brandModelArticle} onChange={(event) => setBrandModelArticle(event.target.value)} />
          </label>
          <label>
            <span>Цена по умолчанию</span>
            <input inputMode="decimal" value={priceText} onChange={(event) => setPriceText(event.target.value)} />
          </label>
          <label className="inventory-ppe-checkbox-row is-wide">
            <input checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} type="checkbox" />
            <span>Использовать эту номенклатуру как связь по умолчанию для нормы</span>
          </label>
        </div>
        <footer className="inventory-ppe-picker-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={!canSaveMapping} onClick={() => onSave(itemId, brandModelArticle, priceText, isDefault)} type="button">
            Сохранить сопоставление
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function buildEmployeePpeRows(
  norms: InventoryPositionNormDto[],
  lines: InventoryPpeCardLineDto[],
  itemsById: Map<string, InventoryItemDto>,
  mappings: Record<string, PpeNormItemCatalogMapping>,
  positionName: string,
): EmployeePpeNormRow[] {
  const usedLineIds = new Set<string>();
  const rows = norms.map((norm) => {
    const key = ppeNormKeyFromNorm(norm);
    const mapping = mappings[key] ?? null;
    const existingLine = lines.find((line) => ppeNormKey(positionName || norm.positionName, line.printItemName || line.itemName, line.normPoint) === key) ?? null;
    if (existingLine) usedLineIds.add(existingLine.id);
    const mappedItem = mappedItemForNorm(norm, itemsById, mappings);
    const catalogItem = mappedItem ?? (existingLine ? itemsById.get(existingLine.itemId) ?? itemFromLine(existingLine) : null);
    const isSectionTitle = Boolean(norm.isSectionTitle || (norm.normItemName || norm.itemName).trim().endsWith(":"));
    return {
      catalogItem,
      existingLine,
      hasExplicitMapping: Boolean(mapping),
      isSectionTitle,
      key,
      mapping,
      norm,
      normItemName: norm.normItemName || norm.itemName,
      normPoint: isSectionTitle ? "" : norm.normPoint || "",
      quantity: norm.quantity || 1,
      quantityText: isSectionTitle ? "" : norm.quantityText || `${formatQuantity(norm.quantity || 1)} шт.`,
      issuePeriodText: isSectionTitle ? "" : norm.issuePeriodText || getDefaultIssuePeriodText(norm.lifeMonths),
    };
  });

  const orphanRows = lines
    .filter((line) => !usedLineIds.has(line.id))
    .map((line): EmployeePpeNormRow => {
      const key = ppeNormKey(positionName, line.printItemName || line.itemName, line.normPoint);
      const isSectionTitle = Boolean(line.isSectionTitle || (line.printItemName || line.itemName).trim().endsWith(":"));
      return {
        catalogItem: itemsById.get(line.itemId) ?? itemFromLine(line),
        existingLine: line,
        hasExplicitMapping: false,
        isSectionTitle,
        key,
        mapping: null,
        norm: null,
        normItemName: line.printItemName || line.itemName,
        normPoint: isSectionTitle ? "" : line.normPoint || "",
        quantity: line.quantity,
        quantityText: isSectionTitle ? "" : line.quantityText || `${formatQuantity(line.quantity)} ${line.unit || "шт."}`,
        issuePeriodText: isSectionTitle ? "" : line.issuePeriodText || "",
      };
    });

  return [...rows, ...orphanRows];
}

function buildEmployeePrintData(
  employee: InventoryEmployeeDto | null,
  detail: InventoryPpeCardDetailDto | null,
  rows: EmployeePpeNormRow[],
  employeeDetails: InventoryPpeEmployeeDetailsDto,
): PrintData {
  if (detail) {
    const detailData = printDataFromDetail({
      ...detail,
      employeeDetails,
      lines: rows.map((row) => lineFromPrintRow(row)),
    });
    return detailData;
  }

  return {
    cardId: undefined,
    createdAt: new Date().toISOString(),
    employee,
    employeeDetails,
    employeeName: employee?.fullName ?? "Сотрудник не выбран",
    lines: rows.map((row) => {
      const item = row.catalogItem ?? (row.norm ? toItemFromNorm(row.norm) : null);
      const isSectionTitle = row.isSectionTitle;
      return {
        amount: 0,
        brandModelArticle: isSectionTitle ? "" : item ? itemModelDescription(item) : "",
        catalogName: item?.name ?? row.normItemName,
        dueAt: isSectionTitle ? null : row.norm?.lifeMonths ? getDefaultDueDate(row.norm.lifeMonths) : null,
        issuePeriodText: row.issuePeriodText,
        issuedAt: null,
        isSectionTitle,
        itemName: item?.name ?? row.normItemName,
        model: isSectionTitle ? "" : item ? itemModelDescription(item) : "",
        normPoint: row.normPoint,
        printItemName: row.normItemName,
        quantity: row.quantity,
        quantityText: row.quantityText,
        status: PPE_STATUS.notIssued,
        unit: item?.unit || "шт.",
        unitPrice: 0,
      };
    }),
    position: employee?.position ?? "",
  };
}

function lineFromNormRow(row: EmployeePpeNormRow): InventoryPpeCardLineDto {
  const item = row.catalogItem ?? (row.norm ? toItemFromNorm(row.norm) : null);
  return {
    amountMinor: 0,
    brandModelArticle: row.isSectionTitle ? "" : item ? itemModelDescription(item) : "",
    dueAt: null,
    id: row.key,
    isSectionTitle: row.isSectionTitle,
    issuedAt: null,
    issuePeriodText: row.issuePeriodText,
    itemId: item?.id ?? row.key,
    itemName: item?.name ?? row.normItemName,
    modelDescription: row.isSectionTitle ? "" : item ? itemModelDescription(item) : "",
    normPoint: row.normPoint,
    printItemName: row.normItemName,
    quantity: row.quantity,
    quantityText: row.quantityText,
    status: PPE_STATUS.notIssued,
    unit: item?.unit || "шт.",
    unitPriceMinor: 0,
    warehouseId: null,
    warehouseName: "",
  };
}

function lineFromPrintRow(row: EmployeePpeNormRow): InventoryPpeCardLineDto {
  const normLine = lineFromNormRow(row);
  const existingLine = row.existingLine;

  if (!existingLine || row.isSectionTitle) {
    return normLine;
  }

  return {
    ...normLine,
    amountMinor: existingLine.amountMinor ?? normLine.amountMinor,
    brandModelArticle: existingLine.brandModelArticle || existingLine.modelDescription || normLine.brandModelArticle,
    dueAt: existingLine.dueAt ?? normLine.dueAt,
    id: existingLine.id,
    issuedAt: existingLine.issuedAt ?? normLine.issuedAt,
    itemId: existingLine.itemId || normLine.itemId,
    modelDescription: existingLine.modelDescription || existingLine.brandModelArticle || normLine.modelDescription,
    status: existingLine.status,
    unitPriceMinor: existingLine.unitPriceMinor ?? normLine.unitPriceMinor,
    warehouseId: existingLine.warehouseId ?? normLine.warehouseId,
    warehouseName: existingLine.warehouseName ?? normLine.warehouseName,
  };
}

function buildLinePayload(
  row: EmployeePpeNormRow,
  item: InventoryItemDto,
  draft: PpeIssueDraft,
  quantity: number,
  unitPriceMinor: number,
): UpsertInventoryPpeCardLineDto {
  return {
    brandModelArticle: draft.brandModelArticle.trim() || itemModelDescription(item) || null,
    comment: draft.comment.trim() || null,
    dueAt: draft.dueAt || null,
    issuedAt: isPpeSignatureStatus(draft.status) ? new Date(draft.issuedAt || new Date()).toISOString() : null,
    issuePeriodText: row.issuePeriodText || getDefaultIssuePeriodText(item.defaultLifeMonths),
    isSectionTitle: false,
    itemId: item.id,
    normPoint: row.normPoint || null,
    printItemName: row.normItemName || item.normItemName || item.name,
    quantity,
    quantityText: draft.quantityText.trim() || `${formatQuantity(quantity)} ${draft.unitText.trim() || item.unit || "шт."}`,
    status: draft.status,
    unitPriceMinor,
    warehouseId: null,
  };
}

function calculateEmployeePpeCounts(rows: EmployeePpeNormRow[], printErrors: number) {
  const issueRows = rows.filter((row) => !row.isSectionTitle);
  const issued = issueRows.filter((row) => row.existingLine && isPpeSignatureStatus(row.existingLine.status)).length;
  const partial = issueRows.filter((row) => row.existingLine?.status === PPE_STATUS.partial).length;
  const overdue = issueRows.filter((row) => {
    if (!row.existingLine?.dueAt || !isPpeSignatureStatus(row.existingLine.status)) return false;
    return new Date(row.existingLine.dueAt).getTime() < Date.now();
  }).length;
  const zeroPrices = issueRows.filter((row) => row.existingLine && (row.existingLine.unitPriceMinor ?? 0) === 0).length;
  const unmapped = issueRows.filter((row) => !row.hasExplicitMapping && !row.existingLine).length;

  return {
    errors: printErrors + zeroPrices + unmapped,
    issued,
    norms: issueRows.length,
    notIssued: Math.max(0, issueRows.length - issued),
    overdue,
    partial,
  };
}

type PpeCheckSummary = {
  notIssuedRows: EmployeePpeNormRow[];
  overdueRows: EmployeePpeNormRow[];
  printableCardRows: number;
  printableSheetRows: number;
  unmappedRows: EmployeePpeNormRow[];
};

function buildPpeCheckSummary(rows: EmployeePpeNormRow[], printData: PrintData, errors: string[]): PpeCheckSummary {
  void errors;
  const printableCardRows = printData.lines.length;
  const printableSheetRows = printData.lines.filter((line) => !line.isSectionTitle && isPpeSignatureStatus(line.status)).length;
  const unmappedRows = rows.filter((row) => !row.isSectionTitle && !row.hasExplicitMapping && !row.existingLine);
  const notIssuedRows = rows.filter((row) => !row.isSectionTitle && !row.existingLine);
  const overdueRows = rows.filter((row) => {
    if (!row.existingLine?.dueAt || !isPpeSignatureStatus(row.existingLine.status)) return false;
    return new Date(row.existingLine.dueAt).getTime() < Date.now();
  });

  return {
    notIssuedRows,
    overdueRows,
    printableCardRows,
    printableSheetRows,
    unmappedRows,
  };
}

function patchDraftForItem(current: PpeIssueDraft, items: InventoryItemDto[], itemId: string): PpeIssueDraft {
  const item = items.find((row) => row.id === itemId);
  return {
    ...current,
    brandModelArticle: item ? itemModelDescription(item) : current.brandModelArticle,
    issueMethod: item?.isConsumable ? "dispenser" : current.issueMethod,
    itemId,
    priceText: moneyMinorToInput(item?.defaultUnitPriceMinor ?? 0),
    sizeText: item ? defaultItemSize(item) : current.sizeText,
    unitText: item?.unit || current.unitText,
  };
}

function PrintCheckCard({
  count,
  rows,
  title,
  tone,
}: {
  count: number;
  rows: string[];
  title: string;
  tone: "danger" | "info" | "ok" | "warning";
}) {
  const visibleRows = rows.filter(Boolean).slice(0, 3);
  return (
    <article className={`inventory-ppe-print-check-card is-${tone}`}>
      <div>
        <strong>{title}</strong>
        <span>{count}</span>
      </div>
      {visibleRows.length ? (
        <ul>
          {visibleRows.map((row) => <li key={row}>{row}</li>)}
        </ul>
      ) : (
        <p>Замечаний нет</p>
      )}
    </article>
  );
}

function formatDateOrDash(value?: string | null) {
  return value ? formatDate(value, "date") : "Не указана";
}

function issueMethodLabel(line: PrintData["lines"][number]) {
  if (line.issueMethod) return PPE_ISSUE_METHOD_LABELS[line.issueMethod];
  return line.dueAt ? PPE_ISSUE_METHOD_LABELS.personal : PPE_ISSUE_METHOD_LABELS.dispenser;
}

function defaultItemSize(item: InventoryItemDto) {
  return [item.clothingSize, item.heightSize, item.shoeSize, item.headSize, item.gloveSize, item.respiratorSize]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" / ");
}

function itemFromLine(line: InventoryPpeCardLineDto): InventoryItemDto {
  return {
    actualItemName: line.itemName,
    article: "",
    balance: 0,
    brandName: "",
    category: "",
    categoryId: null,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: 12,
    defaultUnitPriceMinor: line.unitPriceMinor ?? 0,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: line.itemId,
    isActive: true,
    isConsumable: false,
    itemKind: "ppe",
    minStockQty: 0,
    modelName: "",
    name: line.itemName,
    normItemName: line.printItemName || line.itemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: line.unit || "шт.",
    unitId: null,
  };
}

function parseMoneyToMinor(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  if (!/^\d+(\.\d*)?$/.test(normalized)) return null;
  const [rublesPart, minorPart = ""] = normalized.split(".");
  const rubles = Number(rublesPart);
  if (!Number.isSafeInteger(rubles)) return null;
  return rubles * 100 + Number(minorPart.padEnd(2, "0").slice(0, 2));
}

function ReadOnlyPpeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="inventory-ppe-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isPpeItem(item: InventoryItemDto) {
  const value = [item.itemKind, item.trackingType, item.category].join(" ").toLocaleLowerCase("ru-RU");
  return item.isActive && (value.includes("ppe") || value.includes("сиз") || value.includes("спец"));
}

function sameText(left: string, right: string) {
  return left.trim().toLocaleLowerCase("ru-RU") === right.trim().toLocaleLowerCase("ru-RU");
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right, "ru-RU"));
}
