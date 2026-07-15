import { useEffect, useMemo, useState } from "react";
import type {
  InventoryCustodyDocumentDto,
  InventoryCustodyRecordDto,
  InventoryDocumentDto,
  InventoryEmployeeDto,
  InventoryHistoryDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventoryOverviewDto,
  InventoryPpeCardsResponseDto,
  InventoryPpeCardDto,
  InventoryPpeModuleOptionsDto,
  InventoryReportDto,
  InventorySettingsDto,
  InventoryStockBalanceDto,
  InventorySystemLogDto,
  InventoryUserDto,
  SessionUserDto,
} from "../../api/contracts";
import { createMockInventoryRepository } from "../../repositories/mockInventoryRepository";
import { createInventoryRepository } from "../../repositories/inventoryRepository";
import type { InventoryRepository } from "../../repositories/inventoryRepository";
import { InventoryRepositoryProvider } from "../../repositories/inventoryRepositoryContext";
import type { DataSourceMode, InventoryScreenId, ScreenId } from "../../types";
import { InventoryCustodyScreen } from "./InventoryCustodyScreen";
import { InventoryEmployeesScreen } from "./InventoryEmployeesScreen";
import { InventoryHistoryScreen } from "./InventoryHistoryScreen";
import { InventoryIssueScreen } from "./InventoryIssueScreen";
import { InventoryItemsScreen } from "./InventoryItemsScreen";
import { InventoryOperationsScreen } from "./InventoryOperationsScreen";
import { InventoryOverviewScreen } from "./InventoryOverviewScreen";
import { InventoryPpeScreen } from "./InventoryPpeScreen";
import { InventoryPpeCreateScreen } from "./InventoryPpeCreateScreen";
import { InventoryPpeHistoryScreen } from "./InventoryPpeHistoryScreen";
import { InventoryReportsScreen } from "./InventoryReportsScreen";
import { InventorySettingsScreen } from "./InventorySettingsScreen";
import { InventorySystemLogScreen } from "./InventorySystemLogScreen";
import { InventoryUsersScreen } from "./InventoryUsersScreen";
import "./inventoryWeb.css";

type InventorySectionKind =
  | "overview"
  | "employees"
  | "items"
  | "documents"
  | "custody"
  | "ppe"
  | "ppeCreate"
  | "ppeHistory"
  | "history"
  | "reports"
  | "settings"
  | "users"
  | "systemLog";

type InventorySection = {
  endpoint: string;
  id: InventoryScreenId;
  kind: InventorySectionKind;
};

type InventoryLoadState = {
  custodyDocuments?: InventoryListResponseDto<InventoryCustodyDocumentDto>;
  custodyRecords?: InventoryListResponseDto<InventoryCustodyRecordDto>;
  documents?: InventoryListResponseDto<InventoryDocumentDto>;
  employees?: InventoryListResponseDto<InventoryEmployeeDto>;
  error?: string;
  history?: InventoryListResponseDto<InventoryHistoryDto>;
  items?: InventoryListResponseDto<InventoryItemDto>;
  loading: boolean;
  overview?: InventoryOverviewDto;
  ppeCards?: InventoryPpeCardsResponseDto;
  ppeOptions?: InventoryPpeModuleOptionsDto;
  reports?: InventoryListResponseDto<InventoryReportDto>;
  settings?: InventorySettingsDto;
  stock?: InventoryListResponseDto<InventoryStockBalanceDto>;
  systemLog?: InventoryListResponseDto<InventorySystemLogDto>;
  users?: InventoryListResponseDto<InventoryUserDto>;
};

const inventorySections: InventorySection[] = [
  { id: "inventory-overview", endpoint: "/api/v1/inventory/overview", kind: "overview" },
  { id: "inventory-employees", endpoint: "/api/v1/inventory/employees", kind: "employees" },
  { id: "inventory-items", endpoint: "/api/v1/inventory/items", kind: "items" },
  { id: "inventory-issue", endpoint: "/api/v1/inventory/issues", kind: "documents" },
  { id: "inventory-operations", endpoint: "/api/v1/inventory/documents", kind: "documents" },
  { id: "inventory-custody", endpoint: "/api/v1/inventory/custody/records", kind: "custody" },
  { id: "inventory-ppe", endpoint: "/api/v1/inventory/ppe/cards", kind: "ppe" },
  { id: "inventory-ppe-history", endpoint: "/api/v1/inventory/ppe/history", kind: "ppeHistory" },
  { id: "inventory-ppe-create", endpoint: "/api/v1/inventory/ppe/cards/drafts", kind: "ppeCreate" },
  { id: "inventory-history", endpoint: "/api/v1/inventory/history", kind: "history" },
  { id: "inventory-reports", endpoint: "/api/v1/inventory/reports", kind: "reports" },
  { id: "inventory-users", endpoint: "/api/v1/inventory/users", kind: "users" },
  { id: "inventory-settings", endpoint: "/api/v1/inventory/settings", kind: "settings" },
  { id: "inventory-system-log", endpoint: "/api/v1/inventory/system-log", kind: "systemLog" },
];

const sectionIds = new Set<ScreenId>(inventorySections.map((section) => section.id));

export function InventoryScreen({
  currentUser,
  dataSourceMode,
  screen,
  onNavigate,
  onNotify,
}: {
  currentUser: SessionUserDto | null;
  dataSourceMode: DataSourceMode;
  screen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
}) {
  const current = useMemo(
    () => inventorySections.find((section) => section.id === screen) ?? inventorySections[0],
    [screen],
  );
  const inventoryRepository = useMemo(
    () => (dataSourceMode === "api" ? createInventoryRepository() : createMockInventoryRepository()),
    [dataSourceMode],
  );
  const canLoad = dataSourceMode !== "api" || Boolean(currentUser);
  const [state, setState] = useState<InventoryLoadState>({ loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    if (!canLoad) {
      setState({ loading: false });
      return () => {
        mounted = false;
      };
    }

    setState((value) => ({ ...value, error: undefined, loading: true }));
    fetchSection(current, inventoryRepository)
      .then((nextState) => {
        if (mounted) setState(nextState);
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          error: error instanceof Error ? error.message : "Не удалось загрузить данные Inventory",
          loading: false,
        });
      });

    return () => {
      mounted = false;
    };
  }, [canLoad, current, inventoryRepository, reloadKey]);

  async function reload() {
    setReloadKey((value) => value + 1);
  }

  if (dataSourceMode === "api" && !currentUser) {
    return (
      <div className="inventory-web-shell inventory-web-shell-embedded">
        <main className="inventory-web-workspace">
          <section className="inventory-web-panel inventory-web-empty">
            <p className="inventory-web-eyebrow">Бухгалтерия / Inventory</p>
            <h2>Требуется вход в API</h2>
            <p>
              Раздел Inventory работает с реальными остатками, СИЗ, под запись и сотрудниками. Войдите в систему через
              API-режим, чтобы загрузить данные и выполнить операции учета.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <InventoryRepositoryProvider value={inventoryRepository}>
      <div className="inventory-web-shell inventory-web-shell-embedded">
        <main className="inventory-web-workspace">
        {current.id === "inventory-overview" ? (
          <InventoryOverviewScreen
            error={state.error}
            history={state.history}
            loading={state.loading}
            onNavigate={onNavigate}
            overview={state.overview}
          />
        ) : current.id === "inventory-items" ? (
          <InventoryItemsScreen initialSettings={state.settings} onNavigate={onNavigate} onNotify={onNotify} />
        ) : current.id === "inventory-settings" ? (
          <InventorySettingsScreen
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
            settings={state.settings}
          />
        ) : current.id === "inventory-employees" ? (
          <InventoryEmployeesScreen
            employees={state.employees}
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
          />
        ) : current.id === "inventory-users" ? (
          <InventoryUsersScreen
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
            users={state.users}
          />
        ) : current.id === "inventory-system-log" ? (
          <InventorySystemLogScreen error={state.error} loading={state.loading} rows={state.systemLog} />
        ) : current.id === "inventory-history" ? (
          <InventoryHistoryScreen error={state.error} history={state.history} loading={state.loading} />
        ) : current.id === "inventory-reports" ? (
          <InventoryReportsScreen
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            reports={state.reports}
          />
        ) : current.id === "inventory-operations" ? (
          <InventoryOperationsScreen
            documents={state.documents}
            employees={state.employees?.rows ?? []}
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
          />
        ) : current.id === "inventory-issue" ? (
          <InventoryIssueScreen
            error={state.error}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
          />
        ) : current.id === "inventory-ppe" ? (
          <InventoryPpeScreen
            onNavigate={onNavigate}
            onNotify={onNotify}
          />
        ) : current.id === "inventory-ppe-history" ? (
          <InventoryPpeHistoryScreen onNavigate={onNavigate} />
        ) : current.id === "inventory-ppe-create" ? (
          <InventoryPpeCreateScreen onNavigate={onNavigate} onNotify={onNotify} />
        ) : current.id === "inventory-custody" ? (
          <InventoryCustodyScreen
            documents={state.custodyDocuments}
            employees={state.employees?.rows ?? []}
            error={state.error}
            items={state.items?.rows ?? []}
            loading={state.loading}
            onNotify={onNotify}
            onReload={reload}
            records={state.custodyRecords}
            settings={state.settings}
          />
        ) : null}
        </main>
      </div>
    </InventoryRepositoryProvider>
  );
}

export function isInventoryScreen(screen: ScreenId): screen is InventoryScreenId {
  return sectionIds.has(screen);
}

async function fetchSection(current: InventorySection, inventoryRepository: InventoryRepository): Promise<InventoryLoadState> {
  switch (current.kind) {
    case "overview": {
      const [overview, history] = await Promise.all([
        inventoryRepository.getOverview(),
        inventoryRepository.getHistory({ pageSize: 12 }),
      ]);
      return { history, loading: false, overview };
    }

    case "employees": {
      return { loading: false };
    }

    case "items": {
      const settings = await inventoryRepository.getSettings();
      return { loading: false, settings };
    }

    case "documents": {
      if (current.id === "inventory-operations") {
        const [documents, options] = await Promise.all([
          inventoryRepository.getDocuments({ pageSize: 100 }),
          inventoryRepository.getOperationsOptions(),
        ]);
        return {
          documents,
          employees: { rows: options.employees, total: options.employees.length, page: 1, pageSize: options.employees.length, pageCount: 1 },
          items: { rows: options.items, total: options.items.length, page: 1, pageSize: options.items.length, pageCount: 1 },
          loading: false,
          settings: options.settings,
          stock: { rows: options.stock, total: options.stock.length, page: 1, pageSize: options.stock.length, pageCount: 1 },
        };
      }

      return { loading: false };
    }

    case "custody": {
      const [custodyDocuments, custodyRecords, custodyOptions, settings] = await Promise.all([
        inventoryRepository.getCustodyDocuments({ pageSize: 100 }),
        inventoryRepository.getCustodyRecords({ pageSize: 100 }),
        inventoryRepository.getCustodyOptions(),
        inventoryRepository.getSettings(),
      ]);
      return {
        custodyDocuments,
        custodyRecords,
        employees: { rows: custodyOptions.employees, total: custodyOptions.employees.length, page: 1, pageSize: custodyOptions.employees.length, pageCount: 1 },
        items: { rows: custodyOptions.items, total: custodyOptions.items.length, page: 1, pageSize: custodyOptions.items.length, pageCount: 1 },
        loading: false,
        settings: { ...settings, custodyCategories: custodyOptions.custodyCategories, warehouses: custodyOptions.warehouses },
      };
    }

    case "ppe": {
      return { loading: false };
    }

    case "ppeCreate":
    case "ppeHistory":
      return { loading: false };

    case "history": {
      return { loading: false };
    }

    case "reports": {
      const reports = await inventoryRepository.getReports({ pageSize: 100 });
      return { loading: false, reports };
    }

    case "settings": {
      return { loading: false };
    }

    case "users": {
      return { loading: false };
    }

    case "systemLog": {
      return { loading: false };
    }
  }
}
