import { useState } from "react";
import { Boxes, FileText } from "lucide-react";
import type {
  InventoryCustodyDocumentDto,
  InventoryCustodyRecordDto,
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventorySettingsDto,
} from "../../api/contracts";
import { CustodyState } from "./custody/custodyCommon";
import { CustodyComposer } from "./custody/custodyComposer";
import { CustodyDetailDrawer } from "./custody/custodyDrawer";
import { CustodyInspector, CustodyJournal, CustodyKpis, CustodyRecordsSection } from "./custody/custodyJournal";
import { useCustodyJournalState } from "./custody/useCustodyJournalState";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { useCustodyRepositoryActions } from "./custody/useCustodyRepositoryActions";
import type { CustodyDrawer } from "./custody/custodyTypes";
import "./inventoryWeb.css";

type InventoryCustodyScreenProps = {
  documents?: InventoryListResponseDto<InventoryCustodyDocumentDto>;
  employees: InventoryEmployeeDto[];
  error?: string;
  items: InventoryItemDto[];
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  records?: InventoryListResponseDto<InventoryCustodyRecordDto>;
  settings?: InventorySettingsDto;
};

export function InventoryCustodyScreen({
  documents,
  employees,
  error,
  items,
  loading = false,
  onNotify,
  onReload,
  records,
  settings,
}: InventoryCustodyScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const documentRows = documents?.rows ?? [];
  const recordRows = records?.rows ?? [];
  const [drawer, setDrawer] = useState<CustodyDrawer>(null);
  const {
    query,
    selectedDocument,
    setQuery,
    setSelectedDocumentId,
  } = useCustodyJournalState(documentRows);
  const {
    archiveRecord,
    busyAction,
    downloadFile,
    openDocument,
    openRecordHistory,
    updateDocumentState,
    updateRecordStatus,
  } = useCustodyRepositoryActions({ onNotify, onReload, setDrawer });

  return (
    <section className="inventory-custody-screen">
      <header className="inventory-custody-commandbar">
        <div className="inventory-custody-title">
          <span className="inventory-custody-title-icon">
            <Boxes size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Под запись</h1>
            <span>Акты материальной ответственности, строки выдачи, возвраты, списания и печатные формы.</span>
          </div>
        </div>
        <div className="inventory-custody-command-actions">
          <button className="button ghost" disabled={!selectedDocument} onClick={() => selectedDocument ? void openDocument(selectedDocument.id) : undefined} type="button">
            <FileText size={16} />
            Открыть акт
          </button>
          <button className="button ghost" disabled={!selectedDocument} onClick={() => selectedDocument ? void downloadFile(() => inventoryRepository.printCustodyDocument(selectedDocument.id, "pdf")) : undefined} type="button">
            PDF
          </button>
          <button className="button ghost" disabled={!selectedDocument} onClick={() => selectedDocument ? void downloadFile(() => inventoryRepository.printCustodyDocument(selectedDocument.id, "docx")) : undefined} type="button">
            DOCX
          </button>
        </div>
      </header>

      {error ? <CustodyState kind="error" text={error} title="API под запись не ответил" /> : null}
      {loading ? <CustodyState kind="loading" text="Получаем акты, строки, сотрудников, номенклатуру и настройки учета." title="Загрузка данных" /> : null}

      {!loading && !error ? (
        <>
          <CustodyComposer employees={employees} items={items} onNotify={onNotify} onReload={onReload} settings={settings} />
          <CustodyKpis documents={documentRows} records={recordRows} />

          {!documentRows.length && !recordRows.length ? (
            <CustodyState
              kind="empty"
              text="Создайте запись под ответственность в верхней форме или импортируйте legacy-акты."
              title="Актов под запись пока нет"
            />
          ) : (
            <>
              <div className="inventory-custody-workspace">
                <CustodyJournal
                  busyAction={busyAction}
                  documents={documentRows}
                  onDownload={downloadFile}
                  onOpenDocument={openDocument}
                  onSelectDocument={setSelectedDocumentId}
                  query={query}
                  selectedDocument={selectedDocument}
                  setQuery={setQuery}
                />
                <CustodyInspector document={selectedDocument} onDownload={downloadFile} onOpenDocument={openDocument} />
              </div>

              <CustodyRecordsSection
                busyAction={busyAction}
                documents={documentRows}
                onArchiveRecord={archiveRecord}
                onOpenRecordHistory={openRecordHistory}
                onUpdateRecordStatus={updateRecordStatus}
                query={query}
                records={recordRows}
              />
            </>
          )}
        </>
      ) : null}

      <CustodyDetailDrawer
        busyAction={busyAction}
        drawer={drawer}
        onArchiveRecord={archiveRecord}
        onClose={() => setDrawer(null)}
        onDownload={downloadFile}
        onOpenRecordHistory={openRecordHistory}
        onUpdateDocumentState={updateDocumentState}
        onUpdateRecordStatus={updateRecordStatus}
      />
    </section>
  );
}
