import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EmuAuditEventDto,
  EmuAddFavoriteEmployeeDto,
  EmuCompleteWorkSessionDto,
  EmuCreateReferenceDto,
  EmuCreateWorkSessionDto,
  EmuCreateWorkTemplateDto,
  EmuDashboardDto,
  EmuDeleteWorkSessionDto,
  EmuFavoriteEmployeeDto,
  EmuListResponseDto,
  EmuMetricDto,
  EmuPauseWorkSessionDto,
  EmuPlanTaskDto,
  EmuReferenceDto,
  EmuResumeWorkSessionDto,
  EmuSettingsDto,
  EmuUpdateReferenceDto,
  EmuUpdateWorkSessionDto,
  EmuUpdateWorkTemplateDto,
  EmuUpsertPlanTaskDto,
  EmuWorkSessionDto,
} from "../api/contracts";
import { createEmuRepository, type EmuWorkSessionParams } from "../repositories/emuRepository";
import type { DataSourceMode, EmployeeDirectoryItem } from "../types";

type EmuWorkspaceState = {
  auditEvents: EmuAuditEventDto[];
  dashboard: EmuDashboardDto;
  error?: string;
  loading: boolean;
  planTasks: EmuPlanTaskDto[];
  settings: EmuSettingsDto;
  sourceMode: DataSourceMode;
  workSessions: EmuListResponseDto<EmuWorkSessionDto>;
};

type LocalStore = {
  auditEvents: EmuAuditEventDto[];
  planTasks: EmuPlanTaskDto[];
  sessions: EmuWorkSessionDto[];
  settings: EmuSettingsDto;
};

const emuRepository = createEmuRepository();
const storageKey = "patrol360.emu.workspace.v1";
const apiWorkSessionPageSize = 500;

const employeeStatusWorking = "Работает";
const employeeStatusWaiting = "В ожидании";
const employeeStatusOtherWork = "На другой работе";
const employeeStatusFinished = "Завершил";
const workStatusActive = "В работе";
const workStatusWaiting = "В ожидании";
const workStatusCompleted = "Завершено";
const workStatusDeleted = "Удалено";
const planStatusPlanned = "Запланировано";
const planApprovalApproved = "Согласовано";
const planApprovalRejected = "Отклонено";

const defaultSections: EmuReferenceDto[] = [
  { id: "section-other", name: "Прочее", code: "prochee", isActive: true, sortOrder: 0 },
  { id: "section-enrichment", name: "Участок Обогащения", code: "obogashchenie", isActive: true, sortOrder: 10 },
  { id: "section-kip", name: "Участок КИПиА", code: "kipia", isActive: true, sortOrder: 20 },
  { id: "section-energy", name: "Энергетический участок", code: "energetika", isActive: true, sortOrder: 30 },
];

const defaultWaitReasons: EmuReferenceDto[] = [
  { id: "wait-equipment", name: "Нет оборудования", code: "net-oborudovaniya", isActive: true, sortOrder: 10 },
  { id: "wait-materials", name: "Нет материалов", code: "net-materialov", isActive: true, sortOrder: 20 },
  { id: "wait-other-work", name: "Отправлены на другие работы", code: "drugie-raboty", isActive: true, sortOrder: 30 },
  { id: "wait-breakdown", name: "Поломка", code: "polomka", isActive: true, sortOrder: 40 },
];

const defaultNotCompletedReasons: EmuReferenceDto[] = [
  { id: "not-equipment", name: "Нет оборудования", code: "net-oborudovaniya", isActive: true, sortOrder: 10 },
  { id: "not-materials", name: "Нет материалов", code: "net-materialov", isActive: true, sortOrder: 20 },
  { id: "not-time", name: "Не успели", code: "ne-uspeli", isActive: true, sortOrder: 30 },
  { id: "not-other-work", name: "Отправлены на другие работы", code: "drugie-raboty", isActive: true, sortOrder: 40 },
  { id: "not-other", name: "Прочее", code: "prochee", isActive: true, sortOrder: 80 },
];

const emptySettings: EmuSettingsDto = {
  favoriteEmployees: [],
  notCompletedReasons: defaultNotCompletedReasons,
  sections: defaultSections,
  waitReasons: defaultWaitReasons,
  workTemplates: [],
};

const emptyList: EmuListResponseDto<EmuWorkSessionDto> = {
  page: 1,
  pageCount: 1,
  pageSize: 100,
  rows: [],
  total: 0,
};

const demoEmployeeDirectory: EmployeeDirectoryItem[] = [
  createDemoEmployee("emu-emp-1", "Сидоров А.А.", "Слесарь", "Участок Обогащения"),
  createDemoEmployee("emu-emp-2", "Кузнецов П.В.", "Слесарь", "Участок Обогащения"),
  createDemoEmployee("emu-emp-3", "Петров М.Д.", "Электромонтер", "Энергетический участок"),
  createDemoEmployee("emu-emp-4", "Юхта С.А.", "КИП", "Участок КИПиА"),
  createDemoEmployee("emu-emp-5", "Ковязин А.С.", "КИП", "Участок КИПиА"),
  createDemoEmployee("emu-emp-6", "Пакулин Д.А.", "Слесарь", "Участок Обогащения"),
  createDemoEmployee("emu-emp-7", "Малых С.А.", "Слесарь", "Ремонтный участок"),
  createDemoEmployee("emu-emp-8", "Потапов В.К.", "Электрик", "Энергетический участок"),
];

export function useEmuWorkspace({
  dataSourceMode,
  employeeDirectory,
}: {
  dataSourceMode: DataSourceMode;
  employeeDirectory: EmployeeDirectoryItem[];
}) {
  const [store, setStore] = useState<LocalStore>(() => loadLocalStore(employeeDirectory));
  const [state, setState] = useState<EmuWorkspaceState>(() =>
    dataSourceMode === "api" ? toWorkspaceState(createEmptyStore(), true, "api") : toWorkspaceState(store, false, "mock"),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const lastWorkSyncAtRef = useRef<string | null>(null);
  const lastPlanSyncAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (dataSourceMode !== "api") {
      return;
    }

    let mounted = true;
    setState((current) => {
      const hasLoadedApiState = current.sourceMode === "api" && current.settings.sections.length > 0;
      if (hasLoadedApiState) {
        return { ...current, error: undefined, loading: false };
      }

      return current.sourceMode === "api"
        ? { ...current, error: undefined, loading: true }
        : toWorkspaceState(createEmptyStore(), true, "api");
    });
    Promise.all([
      emuRepository.getSettings(),
      emuRepository.getDashboard(),
      getAllApiWorkSessions({ includeDeleted: true }),
      emuRepository.getPlanTasks(),
    ])
      .then(([settings, dashboard, workSessions, planTasks]) => {
        if (!mounted) return;
        lastWorkSyncAtRef.current = null;
        lastPlanSyncAtRef.current = null;
        setState({
          auditEvents: dashboard.recentEvents,
          dashboard,
          loading: false,
          planTasks: planTasks.rows,
          settings,
          sourceMode: "api",
          workSessions,
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setState((current) => ({
          ...(current.sourceMode === "api" ? current : toWorkspaceState(createEmptyStore(), false, "api")),
          error: error instanceof Error ? error.message : "Не удалось загрузить ЭМУ",
          loading: false,
          sourceMode: "api",
        }));
      });

    return () => {
      mounted = false;
    };
  }, [dataSourceMode, reloadKey]);

  useEffect(() => {
    if (dataSourceMode === "api") return;
    const next = ensureFavoriteEmployees(store, employeeDirectory);
    if (next !== store) {
      setStore(next);
      persistLocalStore(next);
      setState(toWorkspaceState(next, false, "mock"));
      return;
    }

    setState(toWorkspaceState(store, false, "mock"));
  }, [dataSourceMode, employeeDirectory, store]);

  const reload = useCallback(async () => {
    setReloadKey((value) => value + 1);
  }, []);

  const refreshWorkBoard = useCallback(async () => {
    if (dataSourceMode !== "api") {
      setState(toWorkspaceState(store, false, "mock"));
      return;
    }

    try {
      const changes = await emuRepository.getWorkSessionChanges(lastWorkSyncAtRef.current ?? "1970-01-01T00:00:00.000Z");
      lastWorkSyncAtRef.current = changes.serverTime;
      setState((current) => ({
        ...(() => {
          const rows = mergeWorkSessions(current.workSessions.rows, changes.changedSessions, changes.deletedSessionIds);
          return {
            ...current,
            dashboard: buildDashboardFromCollections(rows, current.auditEvents, current.planTasks),
            error: undefined,
            loading: false,
            sourceMode: "api" as const,
            workSessions: toList(rows, rows.length, 1, Math.max(1, rows.length)),
          };
        })(),
      }));
    } catch (error) {
      lastWorkSyncAtRef.current = null;
      await reload();
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Не удалось обновить доску ЭМУ",
        loading: false,
      }));
    }
  }, [dataSourceMode, reload, store]);

  const refreshPlanBoard = useCallback(async () => {
    if (dataSourceMode !== "api") {
      setState(toWorkspaceState(store, false, "mock"));
      return;
    }

    try {
      const changes = await emuRepository.getPlanTaskChanges(lastPlanSyncAtRef.current ?? "1970-01-01T00:00:00.000Z");
      lastPlanSyncAtRef.current = changes.serverTime;
      setState((current) => {
        const planTasks = mergePlanTasks(current.planTasks, changes.changedTasks, changes.deletedTaskIds);
        return {
          ...current,
          dashboard: buildDashboardFromCollections(current.workSessions.rows, current.auditEvents, planTasks),
          error: undefined,
          loading: false,
          planTasks,
          sourceMode: "api",
        };
      });
    } catch (error) {
      lastPlanSyncAtRef.current = null;
      await reload();
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Не удалось обновить доску задач ЭМУ",
        loading: false,
      }));
    }
  }, [dataSourceMode, reload, store]);

  const runLocalMutation = useCallback(
    async <T,>(mutate: (draft: LocalStore) => T) => {
      const draft = cloneStore(store);
      const result = mutate(draft);
      setStore(draft);
      persistLocalStore(draft);
      setState(toWorkspaceState(draft, false, "mock"));
      return result;
    },
    [store],
  );

  const apiOrLocal = useMemo(
    () => ({
      async createWorkSession(payload: EmuCreateWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createWorkSession(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalWorkSession(draft, payload, employeeDirectory));
      },

      async updateWorkSession(id: string, payload: EmuUpdateWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalWorkSession(draft, id, payload, employeeDirectory));
      },

      async pauseWorkSession(id: string, payload: EmuPauseWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.pauseWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => pauseLocalWorkSession(draft, id, payload));
      },

      async resumeWorkSession(id: string, payload: EmuResumeWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.resumeWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => resumeLocalWorkSession(draft, id, payload));
      },

      async completeWorkSession(id: string, payload: EmuCompleteWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.completeWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => completeLocalWorkSession(draft, id, payload));
      },

      async deleteWorkSession(id: string, payload: EmuDeleteWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.deleteWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => deleteLocalWorkSession(draft, id, payload));
      },

      async createSection(payload: EmuCreateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createSection(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "sections", payload));
      },

      async updateSection(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateSection(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "sections", id, payload));
      },

      async createWaitReason(payload: EmuCreateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createWaitReason(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "waitReasons", payload));
      },

      async updateWaitReason(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateWaitReason(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "waitReasons", id, payload));
      },

      async createNotCompletedReason(payload: EmuCreateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createNotCompletedReason(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "notCompletedReasons", payload));
      },

      async updateNotCompletedReason(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateNotCompletedReason(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "notCompletedReasons", id, payload));
      },

      async createWorkTemplate(payload: EmuCreateWorkTemplateDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createWorkTemplate(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalWorkTemplate(draft, payload));
      },

      async updateWorkTemplate(id: string, payload: EmuUpdateWorkTemplateDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateWorkTemplate(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalWorkTemplate(draft, id, payload));
      },

      async addFavoriteEmployee(payload: EmuAddFavoriteEmployeeDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.addFavoriteEmployee(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => addLocalFavoriteEmployee(draft, payload, employeeDirectory));
      },

      async removeFavoriteEmployee(employeeId: string) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.removeFavoriteEmployee(employeeId);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => removeLocalFavoriteEmployee(draft, employeeId));
      },

      async getWorkSessionAudit(id: string) {
        if (dataSourceMode === "api") {
          return emuRepository.getWorkSessionAudit(id, { pageSize: 100 });
        }

        const rows = store.auditEvents.filter((event) => event.workSessionId === id);
        return toList(rows, rows.length);
      },

      async createPlanTask(payload: EmuUpsertPlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createPlanTask(payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalPlanTask(draft, payload));
      },

      async updatePlanTask(id: string, payload: EmuUpsertPlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updatePlanTask(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalPlanTask(draft, id, payload));
      },

      async approvePlanTask(id: string, approved: boolean, comment?: string) {
        if (dataSourceMode === "api") {
          const task = state.planTasks.find((item) => item.id === id);
          const result = await emuRepository.approvePlanTask(id, {
            approved,
            comment: comment || (approved ? planApprovalApproved : planApprovalRejected),
            rowVersion: task?.rowVersion ?? 1,
          });
          await reload();
          return result;
        }

        return runLocalMutation((draft) => approveLocalPlanTask(draft, id, approved, comment));
      },

      async approveWeek(weekStart: string, comment?: string) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.approveWeek({ comment: comment || "Массовое согласование недели", weekStart });
          await reload();
          return result;
        }

        return runLocalMutation((draft) => approveLocalWeek(draft, weekStart, comment));
      },

      async queryWorkSessions(params: EmuWorkSessionParams) {
        if (dataSourceMode === "api") {
          return params.page || params.pageSize ? emuRepository.getWorkSessions(params) : getAllApiWorkSessions(params);
        }

        const rows = filterLocalSessions(store.sessions, params);
        return toList(rows, rows.length, params.page ?? 1, params.pageSize ?? Math.max(1, rows.length));
      },
    }),
    [dataSourceMode, employeeDirectory, reload, runLocalMutation, state.planTasks, store],
  );

  return {
    ...state,
    actions: apiOrLocal,
    reload,
    refreshPlanBoard,
    refreshWorkBoard,
  };
}

export type EmuWorkspace = ReturnType<typeof useEmuWorkspace>;

function loadLocalStore(employeeDirectory: EmployeeDirectoryItem[]): LocalStore {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        return ensureFavoriteEmployees(JSON.parse(raw) as LocalStore, employeeDirectory);
      }
    } catch {
      // Ignore damaged local state and rebuild mock data below.
    }
  }

  return ensureFavoriteEmployees(
    {
      auditEvents: [],
      planTasks: [],
      sessions: [],
      settings: emptySettings,
    },
    employeeDirectory,
  );
}

function persistLocalStore(store: LocalStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(store));
  } catch {
    // Local persistence is a convenience for mock mode.
  }
}

function ensureFavoriteEmployees(store: LocalStore, employeeDirectory: EmployeeDirectoryItem[]) {
  if (store.settings.favoriteEmployees.length > 0) {
    return store;
  }

  const sourceEmployees = employeeDirectory.length > 0 ? employeeDirectory : demoEmployeeDirectory;

  return {
    ...store,
    settings: {
      ...store.settings,
      favoriteEmployees: sourceEmployees.slice(0, 8).map((employee) => ({
        id: `fav-${employee.id}`,
        createdAt: new Date().toISOString(),
        department: employee.department,
        employeeId: employee.id,
        fullName: employee.fullName,
        isActive: true,
        personnelNo: employee.personnelNo,
        position: employee.position,
        status: employee.status,
      })),
      sections: store.settings.sections?.length ? store.settings.sections : defaultSections,
      waitReasons: store.settings.waitReasons?.length ? store.settings.waitReasons : defaultWaitReasons,
      notCompletedReasons: store.settings.notCompletedReasons?.length ? store.settings.notCompletedReasons : defaultNotCompletedReasons,
      workTemplates: store.settings.workTemplates ?? [],
    },
  };
}

function createEmptyStore(): LocalStore {
  return {
    auditEvents: [],
    planTasks: [],
    sessions: [],
    settings: cloneSettings(emptySettings),
  };
}

function cloneSettings(settings: EmuSettingsDto): EmuSettingsDto {
  return {
    favoriteEmployees: settings.favoriteEmployees.map((item) => ({ ...item })),
    notCompletedReasons: settings.notCompletedReasons.map((item) => ({ ...item })),
    sections: settings.sections.map((item) => ({ ...item })),
    waitReasons: settings.waitReasons.map((item) => ({ ...item })),
    workTemplates: settings.workTemplates.map((item) => ({ ...item })),
  };
}

function createDemoEmployee(id: string, fullName: string, position: string, department: string): EmployeeDirectoryItem {
  return {
    brigade: "ИТР",
    birthDate: "",
    department,
    employeeGroup: "ИТР",
    email: "",
    fullName,
    hiredAt: "",
    id,
    initials: fullName.split(" ").map((part) => part[0]).join("").slice(0, 2),
    lastSeen: "сейчас",
    leader: "",
    mobileStatus: "Привязан" as EmployeeDirectoryItem["mobileStatus"],
    personnelNo: id.toUpperCase(),
    phone: "",
    position,
    routesDone: 0,
    routesTotal: 0,
    shift: "День",
    status: "Активен" as EmployeeDirectoryItem["status"],
    zone: department,
  };
}
function toWorkspaceState(store: LocalStore, loading: boolean, sourceMode: DataSourceMode): EmuWorkspaceState {
  const workSessions = toList([...store.sessions].sort(compareCreatedAt), store.sessions.length);
  return {
    auditEvents: store.auditEvents,
    dashboard: buildDashboard(store),
    loading,
    planTasks: [...store.planTasks].sort(comparePlanDate),
    settings: store.settings,
    sourceMode,
    workSessions,
  };
}

function buildDashboard(store: LocalStore): EmuDashboardDto {
  return buildDashboardFromCollections(store.sessions, store.auditEvents, store.planTasks);
}

function buildDashboardFromCollections(
  sessions: EmuWorkSessionDto[],
  auditEvents: EmuAuditEventDto[],
  planTasks: EmuPlanTaskDto[],
): EmuDashboardDto {
  const today = toDateKey(new Date());
  const activeWork = sessions.filter((session) => !session.deletedAt && !session.completedAt);
  const forgottenWork = activeWork.filter((session) => session.isCarriedOver || session.workDate < today);
  const completedToday = sessions.filter((session) => !session.deletedAt && isCompletedOnDate(session, today));
  const waiting = activeWork.filter((session) => session.employees.some((employee) => employee.status !== employeeStatusWorking)).length;
  const metrics: EmuMetricDto[] = [
    { icon: "play", label: "Активные работы", value: String(activeWork.length), delta: "сейчас", tone: "blue" },
    { icon: "pause", label: "На паузе", value: String(waiting), delta: "ожидание", tone: "orange" },
    { icon: "check", label: "Завершено сегодня", value: String(completedToday.length), delta: "за день", tone: "green" },
    { icon: "alert", label: "Требует внимания", value: String(forgottenWork.length), delta: "перенос", tone: "red" },
  ];

  return {
    activeWork: activeWork.slice(0, 12),
    forgottenWork,
    metrics,
    recentEvents: auditEvents.slice(0, 12),
    weekPlan: planTasks.slice(0, 12),
  };
}

function mergeWorkSessions(current: EmuWorkSessionDto[], changed: EmuWorkSessionDto[], deletedIds: string[]) {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item]));
  for (const item of changed) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort(compareCreatedAt);
}

function mergePlanTasks(current: EmuPlanTaskDto[], changed: EmuPlanTaskDto[], deletedIds: string[]) {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item]));
  for (const item of changed) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort(comparePlanDate);
}

function createLocalWorkSession(store: LocalStore, payload: EmuCreateWorkSessionDto, employeeDirectory: EmployeeDirectoryItem[]) {
  const employeeSource = employeeDirectory.length > 0 ? employeeDirectory : demoEmployeeDirectory;
  const planTask = payload.planTaskId ? store.planTasks.find((task) => task.id === payload.planTaskId) : undefined;
  if (payload.planTaskId && !planTask) {
    throw new Error("Плановая задача не найдена");
  }

  if (planTask && planTask.approvalStatus !== planApprovalApproved) {
    throw new Error("Плановая задача должна быть согласована перед отправкой в работу");
  }

  const conflicts = payload.employeeIds
    .filter((employeeId) =>
      store.sessions.some((session) =>
        !session.deletedAt &&
        !session.completedAt &&
        session.employees.some((employee) => employee.employeeId === employeeId && employee.status === employeeStatusWorking && !employee.finishedAt),
      ),
    )
    .map((employeeId) => employeeSource.find((employee) => employee.id === employeeId)?.fullName ?? employeeId);

  if (conflicts.length > 0) {
    throw new Error(`Сотрудник уже работает в другой карточке: ${conflicts.join(", ")}`);
  }

  const now = new Date().toISOString();
  const arrivedAt = payload.arrivedAt || now;
  const section = store.settings.sections.find((item) => item.id === payload.sectionId) ?? store.settings.sections[0];
  const session: EmuWorkSessionDto = {
    arrivedAt,
    completedAt: null,
    createdAt: now,
    deleteReason: "",
    deletedAt: null,
    employees: payload.employeeIds.map((employeeId) => {
      const employee = employeeSource.find((item) => item.id === employeeId);
      return {
        arrivedAt,
        employeeId,
        finishedAt: null,
        fullNameSnapshot: employee?.fullName ?? "Сотрудник",
        id: createId("emu-participant"),
        otherWorkMinutes: 0,
        positionSnapshot: employee?.position ?? "",
        status: employeeStatusWorking,
        waitingMinutes: 0,
        workMinutes: 0,
      };
    }),
    id: createId("emu-work"),
    isCarriedOver: false,
    otherWorkMinutes: 0,
    resultComment: "",
    resultStatus: "",
    rowVersion: 1,
    sectionId: section.id,
    sectionName: section.name,
    status: workStatusActive,
    taskDescription: payload.taskDescription,
    updatedAt: now,
    waitingMinutes: 0,
    workDate: payload.workDate,
    workMinutes: 0,
    workNumber: `ЭМУ-${payload.workDate.slice(0, 4)}-${String(store.sessions.length + 1).padStart(4, "0")}`,
  };
  if (planTask) {
    (session as EmuWorkSessionDto & { planTaskId?: string }).planTaskId = planTask.id;
  }

  store.sessions.unshift(session);
  addAudit(store, session.id, "created", "", workStatusActive, "Создана работа");
  if (planTask) {
    planTask.status = workStatusActive;
    planTask.rowVersion += 1;
    planTask.updatedAt = now;
    addAudit(store, null, "plan_started", planTask.approvalStatus, planTask.status, "Плановая задача отправлена в работу", planTask.id);
  }

  return session;
}

function updateLocalWorkSession(store: LocalStore, id: string, payload: EmuUpdateWorkSessionDto, employeeDirectory: EmployeeDirectoryItem[]) {
  const session = requireSession(store, id);
  if (session.completedAt) {
    throw new Error("Завершенную работу нельзя изменить");
  }

  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  const taskDescription = payload.taskDescription.trim();
  if (!taskDescription) {
    throw new Error("Заполните задачу");
  }

  const section = store.settings.sections.find((item) => item.id === payload.sectionId && item.isActive);
  if (!section) {
    throw new Error("Участок не найден");
  }

  const employeeSource = employeeDirectory.length > 0 ? employeeDirectory : demoEmployeeDirectory;
  const requestedEmployeeIds = payload.employeeIds ? [...new Set(payload.employeeIds)] : null;
  if (requestedEmployeeIds) {
    if (requestedEmployeeIds.length === 0) {
      throw new Error("Выберите хотя бы одного сотрудника");
    }

    const conflicts = requestedEmployeeIds
      .filter((employeeId) =>
        store.sessions.some((item) =>
          item.id !== session.id &&
          !item.deletedAt &&
          !item.completedAt &&
          item.employees.some((employee) => employee.employeeId === employeeId && employee.status === employeeStatusWorking && !employee.finishedAt),
        ),
      )
      .map((employeeId) => employeeSource.find((employee) => employee.id === employeeId)?.fullName ?? employeeId);

    if (conflicts.length > 0) {
      throw new Error(`Сотрудник уже работает в другой карточке: ${conflicts.join(", ")}`);
    }

    if (session.employees.some((employee) => employee.finishedAt)) {
      throw new Error("Нельзя менять сотрудников после частичного завершения работы");
    }
  }

  const oldSection = session.sectionName;
  const oldTask = session.taskDescription;
  const oldDate = session.workDate;
  const oldArrivedAt = session.arrivedAt;
  const oldEmployees = session.employees.map((employee) => employee.fullNameSnapshot).join(", ");
  const workDateChanged = Boolean(payload.workDate && payload.workDate !== oldDate);
  const arrivedAtChanged = Boolean(payload.arrivedAt && payload.arrivedAt !== oldArrivedAt);
  if ((workDateChanged || arrivedAtChanged) && !payload.comment.trim()) {
    throw new Error("Укажите комментарий для ручной корректировки даты или времени");
  }

  session.sectionId = section.id;
  session.sectionName = section.name;
  session.taskDescription = taskDescription;
  if (payload.workDate) {
    session.workDate = payload.workDate;
  }

  if (payload.arrivedAt) {
    session.arrivedAt = payload.arrivedAt;
    for (const employee of session.employees.filter((item) => !item.finishedAt)) {
      employee.arrivedAt = payload.arrivedAt;
    }
  }

  if (requestedEmployeeIds) {
    session.employees = requestedEmployeeIds.map((employeeId) => {
      const existing = session.employees.find((employee) => employee.employeeId === employeeId);
      if (existing) return existing;
      const employee = employeeSource.find((item) => item.id === employeeId);
      return {
        arrivedAt: session.arrivedAt,
        employeeId,
        finishedAt: null,
        fullNameSnapshot: employee?.fullName ?? "Сотрудник",
        id: createId("emu-participant"),
        otherWorkMinutes: 0,
        positionSnapshot: employee?.position ?? "",
        status: employeeStatusWorking,
        waitingMinutes: 0,
        workMinutes: 0,
      };
    });
  }

  touchSession(session);
  if (oldSection !== session.sectionName) addAudit(store, session.id, "section_changed", oldSection, session.sectionName, payload.comment);
  if (oldTask !== session.taskDescription) addAudit(store, session.id, "task_changed", oldTask, session.taskDescription, payload.comment);
  if (workDateChanged) addAudit(store, session.id, "work_date_changed", oldDate, session.workDate, buildManualDateComment("рабочей даты", session.workDate, payload.comment));
  if (arrivedAtChanged) addAudit(store, session.id, "arrived_at_changed", oldArrivedAt, session.arrivedAt, buildManualTimeComment("времени прихода", session.arrivedAt, payload.comment));
  const newEmployees = session.employees.map((employee) => employee.fullNameSnapshot).join(", ");
  if (oldEmployees !== newEmployees) addAudit(store, session.id, "employees_changed", oldEmployees, newEmployees, payload.comment);
  addAudit(store, session.id, "updated", session.status, session.status, payload.comment || "Карточка изменена");
  return session;
}

function pauseLocalWorkSession(store: LocalStore, id: string, payload: EmuPauseWorkSessionDto) {
  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  const employeeIds = payload.employeeIds.length ? payload.employeeIds : session.employees.map((employee) => employee.employeeId);
  for (const employee of session.employees) {
    if (employeeIds.includes(employee.employeeId) && !employee.finishedAt) {
      employee.status = payload.markAsOtherWork ? employeeStatusOtherWork : employeeStatusWaiting;
    }
  }

  session.status = session.employees.some((employee) => employee.status === employeeStatusWorking && !employee.finishedAt) ? workStatusActive : workStatusWaiting;
  touchSession(session);
  addAudit(store, session.id, "paused", workStatusActive, session.status, payload.comment || "Пауза");
  return session;
}

function resumeLocalWorkSession(store: LocalStore, id: string, payload: EmuResumeWorkSessionDto) {
  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  const employeeIds = payload.employeeIds.length ? payload.employeeIds : session.employees.map((employee) => employee.employeeId);
  for (const employee of session.employees) {
    if (employeeIds.includes(employee.employeeId) && !employee.finishedAt) {
      employee.status = employeeStatusWorking;
    }
  }

  session.status = workStatusActive;
  touchSession(session);
  addAudit(store, session.id, "resumed", workStatusWaiting, workStatusActive, payload.comment || "Работа возобновлена");
  return session;
}

function completeLocalWorkSession(store: LocalStore, id: string, payload: EmuCompleteWorkSessionDto) {
  if (!payload.resultComment.trim()) {
    throw new Error("Заполните результат работы");
  }

  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  if (payload.resultStatus === "Не выполнено" && !payload.notCompletedReasonId) {
    throw new Error("Укажите причину невыполнения");
  }

  const now = payload.completedAt || new Date().toISOString();
  const targetIds = payload.employeeIds?.length ? payload.employeeIds : session.employees.map((employee) => employee.employeeId);
  const targetEmployees = session.employees.filter((employee) => targetIds.includes(employee.employeeId) && !employee.finishedAt);
  if (targetEmployees.length === 0) {
    throw new Error("Нет активных сотрудников для завершения");
  }

  if (new Date(now).getTime() < Math.min(...targetEmployees.map((employee) => new Date(employee.arrivedAt).getTime()))) {
    throw new Error("Время окончания не может быть раньше времени прихода");
  }

  for (const employee of targetEmployees) {
    employee.status = employeeStatusFinished;
    employee.finishedAt = now;
  }

  if (session.employees.every((employee) => employee.finishedAt)) {
    session.completedAt = now;
    session.status = workStatusCompleted;
  }

  session.resultStatus = payload.resultStatus;
  session.resultComment = payload.resultComment;
  touchSession(session);
  addAudit(store, session.id, "completed", workStatusActive, session.status, payload.resultComment);
  if (payload.completedAt) {
    addAudit(store, session.id, "completed_at_changed", "", payload.completedAt, buildManualTimeComment("времени окончания", payload.completedAt, payload.resultComment));
  }

  const planTask = store.planTasks.find((task) => task.id && task.id === (session as EmuWorkSessionDto & { planTaskId?: string }).planTaskId);
  if (planTask && session.completedAt) {
    planTask.status = payload.resultStatus;
    planTask.rowVersion += 1;
    planTask.updatedAt = new Date().toISOString();
  }

  return session;
}

function deleteLocalWorkSession(store: LocalStore, id: string, payload: EmuDeleteWorkSessionDto) {
  if (!payload.reason.trim()) {
    throw new Error("Укажите причину удаления");
  }

  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  session.deletedAt = new Date().toISOString();
  session.deleteReason = payload.reason;
  session.status = workStatusDeleted;
  touchSession(session);
  addAudit(store, session.id, "deleted", "", workStatusDeleted, payload.reason);
  return session;
}

type ReferenceCollectionKey = "sections" | "waitReasons" | "notCompletedReasons";

function createLocalReference(store: LocalStore, key: ReferenceCollectionKey, payload: EmuCreateReferenceDto) {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("Укажите название");
  }

  const collection = store.settings[key];
  const item: EmuReferenceDto = {
    code: createCode(name),
    id: createId(`emu-${key}`),
    isActive: true,
    name,
    sortOrder: payload.sortOrder ?? nextSortOrder(collection),
  };
  collection.push(item);
  collection.sort(compareSortOrder);
  addAudit(store, null, `${key}_created`, "", item.name, item.name);
  return item;
}

function updateLocalReference(store: LocalStore, key: ReferenceCollectionKey, id: string, payload: EmuUpdateReferenceDto) {
  const item = store.settings[key].find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error("Запись справочника не найдена");
  }

  if (key === "sections" && item.code === "prochee" && !payload.isActive) {
    throw new Error("Системный участок «Прочее» нельзя скрыть");
  }

  const oldValue = `${item.name} / ${item.isActive ? "активно" : "скрыто"}`;
  item.name = payload.name.trim();
  item.isActive = payload.isActive;
  item.sortOrder = payload.sortOrder;
  store.settings[key].sort(compareSortOrder);
  addAudit(store, null, `${key}_updated`, oldValue, `${item.name} / ${item.isActive ? "активно" : "скрыто"}`, item.name);
  return item;
}

function createLocalWorkTemplate(store: LocalStore, payload: EmuCreateWorkTemplateDto) {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("Укажите название типовой работы");
  }

  const section = payload.sectionId ? store.settings.sections.find((item) => item.id === payload.sectionId) : undefined;
  const item = {
    description: payload.description.trim(),
    id: createId("emu-template"),
    isActive: true,
    name,
    sectionId: payload.sectionId ?? null,
    sectionName: section?.name ?? "",
    sortOrder: payload.sortOrder ?? nextSortOrder(store.settings.workTemplates),
  };
  store.settings.workTemplates.push(item);
  store.settings.workTemplates.sort(compareSortOrder);
  addAudit(store, null, "work_template_created", "", item.name, item.description);
  return item;
}

function updateLocalWorkTemplate(store: LocalStore, id: string, payload: EmuUpdateWorkTemplateDto) {
  const item = store.settings.workTemplates.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error("Типовая работа не найдена");
  }

  const section = payload.sectionId ? store.settings.sections.find((candidate) => candidate.id === payload.sectionId) : undefined;
  const oldValue = `${item.name} / ${item.isActive ? "активно" : "скрыто"}`;
  item.description = payload.description.trim();
  item.isActive = payload.isActive;
  item.name = payload.name.trim();
  item.sectionId = payload.sectionId ?? null;
  item.sectionName = section?.name ?? "";
  item.sortOrder = payload.sortOrder;
  store.settings.workTemplates.sort(compareSortOrder);
  addAudit(store, null, "work_template_updated", oldValue, `${item.name} / ${item.isActive ? "активно" : "скрыто"}`, item.description);
  return item;
}

function addLocalFavoriteEmployee(store: LocalStore, payload: EmuAddFavoriteEmployeeDto, employeeDirectory: EmployeeDirectoryItem[]) {
  const sourceEmployees = employeeDirectory.length > 0 ? employeeDirectory : demoEmployeeDirectory;
  const employee = sourceEmployees.find((item) => item.id === payload.employeeId);
  if (!employee) {
    throw new Error("Сотрудник не найден в общем справочнике");
  }

  const existing = store.settings.favoriteEmployees.find((item) => item.employeeId === payload.employeeId);
  if (existing) {
    existing.department = employee.department;
    existing.fullName = employee.fullName;
    existing.isActive = true;
    existing.personnelNo = employee.personnelNo;
    existing.position = employee.position;
    existing.status = employee.status;
    addAudit(store, null, "favorite_employee_restored", "", employee.fullName, "Сотрудник возвращен в избранное ЭМУ");
    return existing;
  }

  const item: EmuFavoriteEmployeeDto = {
    createdAt: new Date().toISOString(),
    department: employee.department,
    employeeId: employee.id,
    fullName: employee.fullName,
    id: createId("emu-favorite"),
    isActive: true,
    personnelNo: employee.personnelNo,
    position: employee.position,
    status: employee.status,
  };
  store.settings.favoriteEmployees.push(item);
  addAudit(store, null, "favorite_employee_added", "", item.fullName, "Сотрудник добавлен в избранное ЭМУ");
  return item;
}

function removeLocalFavoriteEmployee(store: LocalStore, employeeId: string) {
  const item = store.settings.favoriteEmployees.find((candidate) => candidate.employeeId === employeeId);
  if (!item) {
    throw new Error("Сотрудник не найден в избранном ЭМУ");
  }

  item.isActive = false;
  addAudit(store, null, "favorite_employee_removed", item.fullName, "", "Сотрудник скрыт из избранного ЭМУ");
  return item;
}

function createLocalPlanTask(store: LocalStore, payload: EmuUpsertPlanTaskDto) {
  const now = new Date().toISOString();
  const section = resolveLocalPlanSection(store, payload.sectionId);
  if (!section) {
    throw new Error("Участок не найден");
  }

  const task: EmuPlanTaskDto = {
    approvalStatus: "Черновик",
    createdAt: now,
    description: payload.description,
    employeeIds: payload.employeeIds,
    id: createId("emu-plan"),
    isRecurring: payload.isRecurring,
    plannedDate: payload.plannedDate,
    priority: payload.priority || "Обычный",
    recurrenceRule: payload.recurrenceRule,
    rowVersion: 1,
    sectionId: section.id,
    sectionName: section.name,
    status: planStatusPlanned,
    title: payload.title,
    updatedAt: now,
  };
  store.planTasks.unshift(task);
  addAudit(store, null, "plan_created", "", task.status, task.title, task.id);
  return task;
}

function updateLocalPlanTask(store: LocalStore, id: string, payload: EmuUpsertPlanTaskDto) {
  const task = store.planTasks.find((item) => item.id === id);
  if (!task) throw new Error("Задача плана не найдена");
  if (payload.rowVersion !== undefined && payload.rowVersion !== task.rowVersion) {
    throw new Error("Задача была изменена другим пользователем");
  }

  const section = resolveLocalPlanSection(store, payload.sectionId);
  if (!section) {
    throw new Error("Участок не найден");
  }

  task.description = payload.description;
  task.employeeIds = payload.employeeIds;
  task.isRecurring = payload.isRecurring;
  task.plannedDate = payload.plannedDate;
  task.priority = payload.priority || "Обычный";
  task.recurrenceRule = payload.recurrenceRule;
  task.rowVersion += 1;
  task.sectionId = section.id;
  task.sectionName = section.name;
  task.title = payload.title;
  task.updatedAt = new Date().toISOString();
  addAudit(store, null, "plan_updated", task.status, task.status, task.title, task.id);
  return task;
}

function approveLocalPlanTask(store: LocalStore, id: string, approved: boolean, comment?: string) {
  const task = store.planTasks.find((item) => item.id === id);
  if (!task) throw new Error("Задача плана не найдена");
  const normalizedComment = comment?.trim() || (approved ? planApprovalApproved : "");
  if (!approved && !normalizedComment) {
    throw new Error("Укажите комментарий для отклонения задачи");
  }

  task.approvalStatus = approved ? planApprovalApproved : planApprovalRejected;
  task.rowVersion += 1;
  task.updatedAt = new Date().toISOString();
  addAudit(store, null, approved ? "plan_approved" : "plan_rejected", "", task.approvalStatus, normalizedComment, task.id);
  return task;
}

function approveLocalWeek(store: LocalStore, weekStart: string, comment?: string) {
  const normalizedComment = comment?.trim() || "Неделя согласована";
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const updated = store.planTasks.filter((task) => {
    const date = new Date(task.plannedDate);
    return date >= start && date < end && task.approvalStatus !== planApprovalApproved;
  });
  for (const task of updated) {
    task.approvalStatus = planApprovalApproved;
    task.rowVersion += 1;
    task.updatedAt = new Date().toISOString();
  }

  addAudit(store, null, "week_approved", "", planApprovalApproved, normalizedComment);
  return updated;
}

function resolveLocalPlanSection(store: LocalStore, sectionId?: string | null) {
  if (sectionId) {
    return store.settings.sections.find((item) => item.id === sectionId && item.isActive);
  }

  return store.settings.sections.find((item) => item.isActive && item.code === "prochee") ?? store.settings.sections.find((item) => item.isActive);
}

function requireSession(store: LocalStore, id: string) {
  const session = store.sessions.find((item) => item.id === id);
  if (!session) throw new Error("Работа не найдена");
  return session;
}

function addAudit(store: LocalStore, workSessionId: string | null, eventType: string, fromStatus: string, toStatus: string, comment: string, planTaskId: string | null = null) {
  store.auditEvents.unshift({
    actor: "Пользователь панели",
    comment,
    createdAt: new Date().toISOString(),
    eventType,
    fromStatus,
    id: createId("emu-audit"),
    planTaskId,
    toStatus,
    workSessionId,
  });
}

function buildManualTimeComment(fieldName: string, enteredValue: string, comment: string) {
  return `Ручная корректировка ${fieldName}. Серверное время операции: ${new Date().toISOString()}; введенное время: ${enteredValue}; комментарий: ${comment}`;
}

function buildManualDateComment(fieldName: string, enteredValue: string, comment: string) {
  return `Ручная корректировка ${fieldName}. Серверное время операции: ${new Date().toISOString()}; введенная дата: ${enteredValue}; комментарий: ${comment}`;
}

function touchSession(session: EmuWorkSessionDto) {
  session.rowVersion += 1;
  session.updatedAt = new Date().toISOString();
}

function filterLocalSessions(sessions: EmuWorkSessionDto[], params: EmuWorkSessionParams) {
  return sessions
    .filter((session) => (params.includeDeleted ? true : !session.deletedAt))
    .filter((session) => (params.dateFrom ? session.workDate >= params.dateFrom : true))
    .filter((session) => (params.dateTo ? session.workDate <= params.dateTo : true))
    .filter((session) => (params.sectionId ? session.sectionId === params.sectionId : true))
    .filter((session) => (params.status ? session.status === params.status : true))
    .filter((session) => (params.employeeId ? session.employees.some((employee) => employee.employeeId === params.employeeId) : true))
    .sort(compareCreatedAt);
}

function toList<T>(rows: T[], total: number, page = 1, pageSize = 100): EmuListResponseDto<T> {
  const safePageSize = Math.max(1, pageSize);
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    pageSize: safePageSize,
    rows,
    total,
  };
}

async function getAllApiWorkSessions(params: EmuWorkSessionParams = {}) {
  const rows: EmuWorkSessionDto[] = [];
  let page = 1;
  let pageCount = 1;
  let total = 0;

  do {
    const result = await emuRepository.getWorkSessions({ ...params, page, pageSize: apiWorkSessionPageSize });
    rows.push(...result.rows);
    pageCount = result.pageCount;
    total = result.total;
    page += 1;
  } while (page <= pageCount);

  return toList(rows, total, 1, apiWorkSessionPageSize);
}

function cloneStore(store: LocalStore): LocalStore {
  return JSON.parse(JSON.stringify(store)) as LocalStore;
}

function compareCreatedAt(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function comparePlanDate(a: EmuPlanTaskDto, b: EmuPlanTaskDto) {
  return a.plannedDate.localeCompare(b.plannedDate) || compareCreatedAt(a, b);
}

function compareSortOrder(a: { name: string; sortOrder: number }, b: { name: string; sortOrder: number }) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
}

function nextSortOrder(collection: Array<{ sortOrder: number }>) {
  return collection.length ? Math.max(...collection.map((item) => item.sortOrder)) + 10 : 10;
}

function createCode(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[а]/g, "a")
    .replace(/[б]/g, "b")
    .replace(/[в]/g, "v")
    .replace(/[г]/g, "g")
    .replace(/[д]/g, "d")
    .replace(/[её]/g, "e")
    .replace(/[ж]/g, "zh")
    .replace(/[з]/g, "z")
    .replace(/[и]/g, "i")
    .replace(/[й]/g, "y")
    .replace(/[к]/g, "k")
    .replace(/[л]/g, "l")
    .replace(/[м]/g, "m")
    .replace(/[н]/g, "n")
    .replace(/[о]/g, "o")
    .replace(/[п]/g, "p")
    .replace(/[р]/g, "r")
    .replace(/[с]/g, "s")
    .replace(/[т]/g, "t")
    .replace(/[у]/g, "u")
    .replace(/[ф]/g, "f")
    .replace(/[х]/g, "h")
    .replace(/[ц]/g, "c")
    .replace(/[ч]/g, "ch")
    .replace(/[шщ]/g, "sh")
    .replace(/[ъь]/g, "")
    .replace(/[ы]/g, "y")
    .replace(/[э]/g, "e")
    .replace(/[ю]/g, "yu")
    .replace(/[я]/g, "ya")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCompletedOnDate(session: EmuWorkSessionDto, dateKey: string) {
  return Boolean(session.completedAt && toDateKey(new Date(session.completedAt)) === dateKey);
}
