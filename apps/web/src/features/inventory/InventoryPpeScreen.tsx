import { FileText, HardHat, Plus, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardsResponseDto,
  InventoryPpeModuleOptionsDto,
  InventorySettingsDto,
} from "../../api/contracts";
import { PpeState, printDataFromWizard, statusLabel } from "./ppe/ppeCommon";
import { PpeDrawerPanel } from "./ppe/ppeDrawer";
import { CardJournalTable, PpeInspector } from "./ppe/ppeJournal";
import { PrintPreviewModal, printDocument } from "./ppe/ppePrint";
import { PpeItemPickerModal, PpeWizard } from "./ppe/ppeWizard";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { usePpeJournalState } from "./ppe/usePpeJournalState";
import { usePpeRepositoryActions } from "./ppe/usePpeRepositoryActions";
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
  const [cardsView, setCardsView] = useState(cards);
  const [journalLoading, setJournalLoading] = useState(false);
  const [page, setPage] = useState(cards?.page ?? 1);
  const [pageSize, setPageSize] = useState(cards?.pageSize ?? 25);
  const employees = options?.employees ?? fallbackEmployees;
  const items = options?.items ?? fallbackItems;
  const settings = options?.settings ?? fallbackSettings;
  const rows = cardsView?.rows ?? [];
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const {
    departmentFilter,
    departmentOptions,
    priceFilter,
    query,
    resetFilters,
    selectedCard,
    setDepartmentFilter,
    setPriceFilter,
    setQuery,
    setSelectedCardId,
    setStatusFilter,
    statusFilter,
    statusOptions,
    visibleRows,
  } = usePpeJournalState(rows, employees);
  const pageCount = Math.max(1, cardsView?.pageCount ?? 1);
  const total = cardsView?.total ?? rows.length;
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, pageStart + rows.length - 1);
  const hasJournalFilters = Boolean(query.trim() || departmentFilter || statusFilter || priceFilter);
  const {
    addWizardLines,
    busyAction,
    downloadFile,
    drawer,
    openCard,
    openCardLinesHistory,
    openCreateWizard,
    openEditWizard,
    openLineHistory,
    patchWizardLine,
    pickerOpen,
    preview,
    previewSavedCard,
    saveWizard,
    setDrawer,
    setPickerOpen,
    setPreview,
    setWizard,
    updateLineStatus,
    wizard,
    wizardEmployee,
  } = usePpeRepositoryActions({
    employees,
    items,
    onNotify,
    onReload,
    setSelectedCardId,
  });

  useEffect(() => {
    setCardsView(cards);
    if (cards?.page) setPage(cards.page);
    if (cards?.pageSize) setPageSize(cards.pageSize);
  }, [cards]);

  const loadJournal = useCallback(
    (signal: { cancelled: boolean }) => {
      setJournalLoading(true);
      inventoryRepository
        .getPpeCards({
          department: departmentFilter,
          includeLines: false,
          page,
          pageSize,
          priceState: priceFilter,
          query,
          status: statusFilter,
        })
        .then((nextCards) => {
          if (!signal.cancelled) {
            setCardsView(nextCards);
            if (nextCards.page !== page) setPage(nextCards.page);
          }
        })
        .catch((loadError) => {
          if (!signal.cancelled) onNotify(loadError instanceof Error ? loadError.message : "Не удалось обновить журнал СИЗ");
        })
        .finally(() => {
          if (!signal.cancelled) setJournalLoading(false);
        });
    },
    [departmentFilter, inventoryRepository, onNotify, page, pageSize, priceFilter, query, statusFilter],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    const timeout = window.setTimeout(() => {
      loadJournal(signal);
    }, 180);

    return () => {
      signal.cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [loadJournal]);

  const resetJournalFilters = () => {
    setPage(1);
    resetFilters();
  };

  const handlePageSize = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  return (
    <section className="inventory-ppe-screen inventory-ppe-redesign">
      <header className="inventory-ppe-commandbar">
        <div className="inventory-ppe-title">
          <span className="inventory-ppe-title-icon">
            <HardHat size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>СИЗ</h1>
            <span>Личные карточки, нормы по должности, выдача, возврат и печатные формы.</span>
          </div>
        </div>
        <div className="inventory-ppe-command-actions">
          <button className="button primary" onClick={openCreateWizard} type="button">
            <Plus size={16} />
            Создать карточку
          </button>
          <button
            className="button ghost"
            disabled={!selectedCard}
            onClick={() => (selectedCard ? void previewSavedCard(selectedCard.id, "card") : undefined)}
            type="button"
          >
            <FileText size={16} />
            Личная карточка
          </button>
          <button
            className="button ghost"
            disabled={!selectedCard}
            onClick={() => (selectedCard ? void previewSavedCard(selectedCard.id, "sheet") : undefined)}
            type="button"
          >
            <Printer size={16} />
            Лист подписи
          </button>
        </div>
      </header>

      {error ? <PpeState kind="error" text={error} title="API СИЗ не ответил" /> : null}
      {loading ? (
        <PpeState
          kind="loading"
          text="Получаем карточки СИЗ, сотрудников, номенклатуру и настройки учета."
          title="Загрузка данных"
        />
      ) : null}

      {!loading && !error && wizard ? (
        <>
          <PpeWizard
            busy={busyAction === "wizard-save"}
            employee={wizardEmployee}
            employees={employees}
            onAddItems={() => setPickerOpen(true)}
            onBackToJournal={() => {
              setWizard(null);
              setPickerOpen(false);
            }}
            onDownload={downloadFile}
            onPatchLine={patchWizardLine}
            onPreview={(mode) => setPreview({ data: printDataFromWizard(wizard, wizardEmployee), mode })}
            onPrint={(mode) => printDocument(printDataFromWizard(wizard, wizardEmployee), mode)}
            onRemoveLine={(index) => setWizard({ ...wizard, lines: wizard.lines.filter((_, lineIndex) => lineIndex !== index) })}
            onSave={(confirmIssue) => void saveWizard(confirmIssue)}
            onStepChange={(step) => setWizard({ ...wizard, step })}
            onWizardChange={setWizard}
            printData={printDataFromWizard(wizard, wizardEmployee)}
            settings={settings}
            wizard={wizard}
          />
          <PpeItemPickerModal
            employee={wizardEmployee}
            isOpen={pickerOpen}
            items={items}
            onAdd={addWizardLines}
            onClose={() => setPickerOpen(false)}
            settings={settings}
          />
        </>
      ) : null}

      {!loading && !error && !wizard ? (
        <>
          <section className="inventory-ppe-workspace">
            <div className="inventory-ppe-journal">
              <div className="inventory-ppe-panel-head">
                <div>
                  <h2>Журнал карточек СИЗ</h2>
                  <p>
                    {journalLoading
                      ? "Обновление..."
                      : total
                        ? `Показано ${pageStart}-${pageEnd} из ${total}`
                        : "Карточек по фильтрам нет"}
                  </p>
                </div>
                <div className="inventory-ppe-page-size">
                  <span>На странице</span>
                  {[25, 50, 100, 200].map((size) => (
                    <button
                      aria-pressed={pageSize === size}
                      className={pageSize === size ? "is-active" : ""}
                      key={size}
                      onClick={() => handlePageSize(size)}
                      type="button"
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="inventory-ppe-picker-filters inventory-ppe-journal-filters">
                <label className="inventory-ppe-search">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => {
                      setPage(1);
                      setQuery(event.target.value);
                    }}
                    placeholder="ФИО, табельный номер или карточка"
                  />
                </label>
                <select
                  value={departmentFilter}
                  onChange={(event) => {
                    setPage(1);
                    setDepartmentFilter(event.target.value);
                  }}
                >
                  <option value="">Все подразделения</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);
                    setStatusFilter(event.target.value);
                  }}
                >
                  <option value="">Все статусы</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
                <select
                  value={priceFilter}
                  onChange={(event) => {
                    setPage(1);
                    setPriceFilter(event.target.value);
                  }}
                >
                  <option value="">Все цены</option>
                  <option value="missing">Цена не указана</option>
                  <option value="priced">С ценой</option>
                </select>
                <button className="button ghost" onClick={resetJournalFilters} type="button">
                  Сбросить
                </button>
              </div>
              {!visibleRows.length ? (
                <PpeState
                  kind="empty"
                  text={hasJournalFilters ? "Измените поиск, подразделение, статус или фильтр цены." : "Карточки появятся после создания или импорта данных."}
                  title={hasJournalFilters ? "По фильтрам карточек нет" : "Карточек СИЗ нет"}
                />
              ) : (
                <CardJournalTable
                  busyAction={busyAction}
                  onEdit={openEditWizard}
                  onOpen={openCard}
                  onPreview={previewSavedCard}
                  employeesById={employeesById}
                  rows={visibleRows}
                  selectedCardId={selectedCard?.id ?? ""}
                  setSelectedCardId={setSelectedCardId}
                />
              )}
              <div className="inventory-ppe-pagination">
                <span>{total ? `Показано ${pageStart}-${pageEnd} из ${total}` : "Нет записей"}</span>
                <div>
                  <button className="button ghost" disabled={page <= 1 || journalLoading} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
                    Назад
                  </button>
                  <strong>
                    {page} / {pageCount}
                  </strong>
                  <button
                    className="button ghost"
                    disabled={page >= pageCount || journalLoading}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    type="button"
                  >
                    Вперед
                  </button>
                </div>
              </div>
            </div>

            <PpeInspector
              card={selectedCard}
              employee={selectedCard ? employeesById.get(selectedCard.employeeId) ?? null : null}
              onDownload={downloadFile}
              onEdit={openEditWizard}
              onOpen={openCard}
              onOpenHistory={openCardLinesHistory}
              onPreview={previewSavedCard}
            />
          </section>
        </>
      ) : null}

      <PpeDrawerPanel
        busyAction={busyAction}
        drawer={drawer}
        onClose={() => setDrawer(null)}
        onDownload={downloadFile}
        onLineHistory={openLineHistory}
        onLineStatus={updateLineStatus}
        items={items}
        onPreview={(data, mode) => setPreview({ data, mode })}
        onPrint={printDocument}
      />

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
}
