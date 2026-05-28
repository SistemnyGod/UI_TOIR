import { FileText, HardHat, Plus, Printer, Search } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventoryPpeCardDto,
  InventoryPpeModuleOptionsDto,
  InventorySettingsDto,
} from "../../api/contracts";
import { PpeState, printDataFromWizard } from "./ppe/ppeCommon";
import { PpeDrawerPanel } from "./ppe/ppeDrawer";
import { CardJournalTable, PpeInspector, PpeKpi } from "./ppe/ppeJournal";
import { PrintPreviewModal, printDocument } from "./ppe/ppePrint";
import { PpeItemPickerModal, PpeWizard } from "./ppe/ppeWizard";
import { usePpeJournalState } from "./ppe/usePpeJournalState";
import { usePpeRepositoryActions } from "./ppe/usePpeRepositoryActions";
import "./inventoryWeb.css";

type InventoryPpeScreenProps = {
  cards?: InventoryListResponseDto<InventoryPpeCardDto>;
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
  const employees = options?.employees ?? fallbackEmployees;
  const items = options?.items ?? fallbackItems;
  const settings = options?.settings ?? fallbackSettings;
  const rows = cards?.rows ?? [];
  const { counts, query, selectedCard, setQuery, setSelectedCardId, visibleRows } = usePpeJournalState(rows);
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
    onNotify,
    onReload,
    setSelectedCardId,
    settings,
  });

  return (
    <section className="inventory-ppe-screen">
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
            Роспись получения
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

      {!loading && !error
        ? wizard
          ? (
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
                onRemoveLine={(index) =>
                  setWizard({ ...wizard, lines: wizard.lines.filter((_, lineIndex) => lineIndex !== index) })
                }
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
            )
          : (
            <>
              <section className="inventory-ppe-kpis" aria-label="Сводка СИЗ">
                <PpeKpi label="Всего карточек" value={counts.total} />
                <PpeKpi label="Активные" tone="green" value={counts.active} />
                <PpeKpi label="Выдано строк" tone="blue" value={counts.issued} />
                <PpeKpi label="Возврат / списание" tone="slate" value={counts.closed} />
                <PpeKpi label="Проблемные" tone="red" value={counts.problem} />
              </section>

              <section className="inventory-ppe-workspace">
                <div className="inventory-ppe-journal">
                  <div className="inventory-ppe-panel-head">
                    <div>
                      <h2>Журнал карточек СИЗ</h2>
                      <p>{visibleRows.length} из {rows.length} карточек</p>
                    </div>
                  </div>
                  <label className="inventory-ppe-search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Поиск по сотруднику, должности или статусу"
                    />
                  </label>
                  {!visibleRows.length ? (
                    <PpeState
                      kind="empty"
                      text="Карточки появятся после создания или импорта данных."
                      title="Карточек СИЗ нет"
                    />
                  ) : (
                    <CardJournalTable
                      busyAction={busyAction}
                      onEdit={openEditWizard}
                      onOpen={openCard}
                      onPreview={previewSavedCard}
                      rows={visibleRows}
                      selectedCardId={selectedCard?.id ?? ""}
                      setSelectedCardId={setSelectedCardId}
                    />
                  )}
                </div>

                <PpeInspector
                  card={selectedCard}
                  onDownload={downloadFile}
                  onEdit={openEditWizard}
                  onOpen={openCard}
                  onOpenHistory={openCardLinesHistory}
                  onPreview={previewSavedCard}
                />
              </section>
            </>
            )
        : null}

      <PpeDrawerPanel
        busyAction={busyAction}
        drawer={drawer}
        onClose={() => setDrawer(null)}
        onDownload={downloadFile}
        onLineHistory={openLineHistory}
        onLineStatus={updateLineStatus}
        onPreview={(data, mode) => setPreview({ data, mode })}
        onPrint={printDocument}
      />

      {preview ? (
        <PrintPreviewModal
          data={preview.data}
          mode={preview.mode}
          onClose={() => setPreview(null)}
          onModeChange={(mode) => setPreview({ ...preview, mode })}
          onPrint={() => printDocument(preview.data, preview.mode)}
        />
      ) : null}
    </section>
  );
}
