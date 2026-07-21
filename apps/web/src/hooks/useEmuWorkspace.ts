import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EmuAuditEventDto,
  EmuAddFavoriteEmployeeDto,
  EmuAddWorkSessionEmployeeDto,
  EmuCompleteWorkSessionDto,
  EmuCarryOverWorkSessionDto,
  EmuCreateReferenceDto,
  EmuCreateWorkSessionDto,
  EmuCreateWorkTemplateDto,
  EmuDashboardDto,
  EmuDecisionDto,
  EmuDeleteWorkSessionDto,
  EmuEmployeeShiftDto,
  EmuEmployeeMonthSummaryDto,
  EmuEmployeeShiftSummaryDto,
  EmuEmployeeWorkHistoryReportDto,
  EmuFavoriteEmployeeDto,
  EmuFinishWorkSessionEmployeeDto,
  EmuListResponseDto,
  EmuMarkMistakenWorkSessionEmployeeDto,
  EmuMetricDto,
  EmuPauseWorkSessionDto,
  EmuPlanTaskDto,
  EmuReferenceDto,
  EmuResolveDecisionDto,
  EmuReschedulePlanTaskDto,
  EmuResumeWorkSessionDto,
  EmuSettingsDto,
  EmuShiftRemarkDto,
  EmuUpdateEmployeeShiftDto,
  EmuUpdateReferenceDto,
  EmuUpdateWorkSessionDto,
  EmuUpdateWorkTemplateDto,
  EmuUpsertPlanTaskDto,
  EmuWorkSessionEmployeeDto,
  EmuWorkSessionDto,
  EmuWorkHistoryReportDto,
  SessionUserDto,
} from "../api/contracts";
import { createEmuRepository, type EmuWorkSessionParams } from "../repositories/emuRepository";
import {
  buildLocalEmployeeWorkHistoryReport,
  buildLocalWorkHistoryReport,
  filterLocalSessions,
} from "../domain/emuLocalReports";
import { hasPermission } from "../security/permissions";
import type { DataSourceMode, EmployeeDirectoryItem } from "../types";

type EmuWorkspaceState = {
  auditEvents: EmuAuditEventDto[];
  dashboard: EmuDashboardDto;
  decisions: EmuDecisionDto[];
  error?: string;
  loading: boolean;
  planTasks: EmuPlanTaskDto[];
  settings: EmuSettingsDto;
  shiftRemarks: EmuListResponseDto<EmuShiftRemarkDto>;
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
const employeeStatusPartial = "Частично выполнено";
const employeeStatusMistaken = "Добавлен ошибочно";
const participationStatusPaused = "На паузе";
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

const emptyShiftRemarkList: EmuListResponseDto<EmuShiftRemarkDto> = {
  page: 1,
  pageCount: 1,
  pageSize: 50,
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
  currentUser,
  dataSourceMode,
  employeeDirectory,
}: {
  currentUser: SessionUserDto | null;
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
  const canViewDashboard = dataSourceMode !== "api" || hasPermission(currentUser, "emu.dashboard.view");
  const canViewPlan = dataSourceMode !== "api" || hasPermission(currentUser, "emu.plan.view");

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
      canViewDashboard ? emuRepository.getDashboard() : Promise.resolve<EmuDashboardDto | null>(null),
      getAllApiWorkSessions(),
      emuRepository.getShiftRemarks({ pageSize: 100 }),
      canViewPlan ? emuRepository.getPlanTasks() : Promise.resolve<EmuListResponseDto<EmuPlanTaskDto>>(toList([], 0)),
      emuRepository.getDecisions({ status: "new" }),
    ])
      .then(([settings, dashboard, workSessions, shiftRemarks, planTasks, decisions]) => {
        if (!mounted) return;
        lastWorkSyncAtRef.current = maxUpdatedAt(workSessions.rows) ?? new Date().toISOString();
        lastPlanSyncAtRef.current = maxUpdatedAt(planTasks.rows) ?? new Date().toISOString();
        const planRows = planTasks.rows;
        setState({
          auditEvents: dashboard?.recentEvents ?? [],
          dashboard: dashboard ?? buildDashboardFromCollections(workSessions.rows, [], planRows),
          decisions,
          loading: false,
          planTasks: planRows,
          settings,
          shiftRemarks,
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
  }, [canViewDashboard, canViewPlan, dataSourceMode, reloadKey]);

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

    const since = lastWorkSyncAtRef.current;
    if (!since) {
      await reload();
      return;
    }

    try {
      const [changes, shiftRemarks] = await Promise.all([
        emuRepository.getWorkSessionChanges(since),
        emuRepository.getShiftRemarks({ pageSize: 100 }),
      ]);
      lastWorkSyncAtRef.current = changes.serverTime;
      setState((current) => ({
        ...(() => {
          const rows = mergeWorkSessions(current.workSessions.rows, changes.changedSessions, changes.deletedSessionIds);
          return {
            ...current,
            dashboard: buildDashboardFromCollections(rows, current.auditEvents, current.planTasks),
            error: undefined,
            loading: false,
            shiftRemarks,
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

    if (!canViewPlan) {
      return;
    }

    const since = lastPlanSyncAtRef.current;
    if (!since) {
      await reload();
      return;
    }

    try {
      const changes = await emuRepository.getPlanTaskChanges(since);
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
  }, [canViewPlan, dataSourceMode, reload, store]);

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

      async addWorkSessionEmployee(id: string, payload: EmuAddWorkSessionEmployeeDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.addWorkSessionEmployee(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => addLocalWorkSessionEmployee(draft, id, payload, employeeDirectory));
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

      async carryOverWorkSession(id: string, payload: EmuCarryOverWorkSessionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.carryOverWorkSession(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => carryOverLocalWorkSession(draft, id, payload));
      },

      async finishWorkSessionEmployee(id: string, employeeId: string, payload: EmuFinishWorkSessionEmployeeDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.finishWorkSessionEmployee(id, employeeId, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => finishLocalWorkSessionEmployee(draft, id, employeeId, payload));
      },

      async markWorkSessionEmployeeMistaken(id: string, employeeId: string, payload: EmuMarkMistakenWorkSessionEmployeeDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.markWorkSessionEmployeeMistaken(id, employeeId, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => markLocalWorkSessionEmployeeMistaken(draft, id, employeeId, payload));
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

      async getEmployeeShiftSummary(employeeId: string, date: string) {
        if (dataSourceMode === "api") {
          return emuRepository.getEmployeeShiftSummary(employeeId, date);
        }

        return buildLocalEmployeeShiftSummary(employeeId, date, store, employeeDirectory);
      },

      async getEmployeeMonthSummary(employeeId: string, month: string) {
        if (dataSourceMode === "api") {
          return emuRepository.getEmployeeMonthSummary(employeeId, month);
        }

        return buildLocalEmployeeMonthSummary(employeeId, month, store, employeeDirectory);
      },

      async updateEmployeeShift(id: string, payload: EmuUpdateEmployeeShiftDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateEmployeeShift(id, payload);
          await reload();
          return result;
        }

        return buildLocalEmployeeShift(payload, store, employeeDirectory, id);
      },

      async getDecisions(status = "new") {
        if (dataSourceMode === "api") {
          const decisions = await emuRepository.getDecisions({ status });
          setState((current) => ({ ...current, decisions }));
          return decisions;
        }

        return [];
      },

      async resolveDecision(id: string, payload: EmuResolveDecisionDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.resolveDecision(id, payload);
          const decisions = await emuRepository.getDecisions({ status: "new" });
          setState((current) => ({ ...current, decisions }));
          return result;
        }

        throw new Error("Решения доступны только в API-режиме");
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

      async reschedulePlanTask(id: string, payload: EmuReschedulePlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.reschedulePlanTask(id, payload);
          await reload();
          return result;
        }

        return runLocalMutation((draft) => rescheduleLocalPlanTask(draft, id, payload));
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
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? Math.max(1, rows.length);
        return toList(rows.slice((page - 1) * pageSize, page * pageSize), rows.length, page, pageSize);
      },

      async queryWorkHistoryReport(params: EmuWorkSessionParams) {
        if (dataSourceMode === "api") {
          return emuRepository.getWorkHistoryReport(params);
        }

        return buildLocalWorkHistoryReport(filterLocalSessions(store.sessions, params), params);
      },

      async queryEmployeeWorkHistoryReport(employeeId: string, params: EmuWorkSessionParams) {
        if (dataSourceMode === "api") {
          return emuRepository.getEmployeeWorkHistoryReport(employeeId, params);
        }

        return buildLocalEmployeeWorkHistoryReport(employeeId, filterLocalSessions(store.sessions, { ...params, employeeId }), params, employeeDirectory);
      },

      async exportWorkSessions(params: EmuWorkSessionParams) {
        if (dataSourceMode !== "api") {
          throw new Error("Серверный экспорт доступен только в API-режиме");
        }

        return emuRepository.exportWorkSessions(params);
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

function buildLocalEmployeeShiftSummary(
  employeeId: string,
  date: string,
  store: LocalStore,
  employeeDirectory: EmployeeDirectoryItem[],
): EmuEmployeeShiftSummaryDto {
  const shift = buildLocalEmployeeShift({ shiftDate: date, shiftType: "day", lunchTaken: true, lunchOverridden: false, reason: "mock", rowVersion: 1 }, store, employeeDirectory, `mock-shift-${employeeId}-${date}`, employeeId);
  const effectiveStart = new Date(shift.actualStartAt);
  const effectiveEnd = new Date(shift.actualEndAt);
  const lunchStart = new Date(shift.lunchStartAt);
  const lunchEnd = new Date(shift.lunchEndAt);
  const workIntervals = store.sessions.flatMap((session) =>
    session.employees
      .filter((employee) => employee.employeeId === employeeId)
      .flatMap((employee) =>
        (employee.intervals ?? []).map((interval) => ({
          endedAt: interval.endedAt ?? new Date().toISOString(),
          reason: interval.reason,
          startedAt: interval.startedAt,
          status: interval.status,
          workNumber: session.workNumber,
          workSessionId: session.id,
        })),
      ),
  );
  const workRanges = workIntervals
    .filter((interval) => isWorkingParticipationStatus(interval.status))
    .map((interval) => toRange(interval.startedAt, interval.endedAt));
  const pauseRanges = workIntervals
    .filter((interval) => !isWorkingParticipationStatus(interval.status))
    .map((interval) => toRange(interval.startedAt, interval.endedAt));
  const occupiedRanges = [...workRanges, ...pauseRanges, ...(shift.lunchTaken ? [{ start: lunchStart, end: lunchEnd }] : [])];
  const freeRanges = buildFreeDateRanges(effectiveStart, effectiveEnd, occupiedRanges);
  const intervals = [
    ...workIntervals.map((interval) => ({
      endedAt: interval.endedAt,
      label: isWorkingParticipationStatus(interval.status) ? "Работа" : "Пауза",
      minutes: diffMinutes(new Date(interval.startedAt), new Date(interval.endedAt)),
      reason: interval.reason,
      startedAt: interval.startedAt,
      type: isWorkingParticipationStatus(interval.status) ? "work" : "pause",
      workNumber: interval.workNumber,
      workSessionId: interval.workSessionId,
    })),
    ...(shift.lunchTaken
      ? [
          {
            endedAt: shift.lunchEndAt,
            label: "Обед",
            minutes: diffMinutes(lunchStart, lunchEnd),
            reason: "",
            startedAt: shift.lunchStartAt,
            type: "lunch",
            workNumber: "",
            workSessionId: null,
          },
        ]
      : []),
    ...freeRanges.map((range) => ({
      endedAt: range.end.toISOString(),
      label: "Свободно",
      minutes: diffMinutes(range.start, range.end),
      reason: "",
      startedAt: range.start.toISOString(),
      type: "free",
      workNumber: "",
      workSessionId: null,
    })),
  ].sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime());

  return {
    beforeShiftWorkMinutes: sumClippedMinutes(workRanges, new Date(0), effectiveStart),
    decisions: [],
    freeMinutes: freeRanges.reduce((sum, range) => sum + diffMinutes(range.start, range.end), 0),
    intervals,
    overtimeMinutes: (() => {
      const minutes = sumClippedMinutes(workRanges, effectiveEnd, new Date(8640000000000000));
      return minutes > 60 ? minutes : 0;
    })(),
    pauseMinutes: sumClippedMinutes(pauseRanges, effectiveStart, effectiveEnd),
    questionableOvertimeMinutes: (() => {
      const minutes = sumClippedMinutes(workRanges, effectiveEnd, new Date(8640000000000000));
      return minutes > 30 && minutes <= 60 ? minutes : 0;
    })(),
    shift,
    workMinutes: sumClippedMinutes(workRanges, effectiveStart, effectiveEnd),
  };
}

function buildLocalEmployeeMonthSummary(
  employeeId: string,
  month: string,
  store: LocalStore,
  employeeDirectory: EmployeeDirectoryItem[],
): EmuEmployeeMonthSummaryDto {
  const [year, monthNumber] = month.split("-").map((part) => Number(part));
  const safeYear = Number.isFinite(year) && year > 0 ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12 ? monthNumber : new Date().getMonth() + 1;
  const start = new Date(Date.UTC(safeYear, safeMonth - 1, 1));
  const end = new Date(Date.UTC(safeYear, safeMonth, 1));
  const shifts: EmuEmployeeShiftSummaryDto[] = [];

  for (const cursor = new Date(start); cursor.getTime() < end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const summary = buildLocalEmployeeShiftSummary(employeeId, date, store, employeeDirectory);
    if (isMeaningfulLocalMonthShift(summary)) {
      shifts.push(summary);
    }
  }

  const employeeName =
    shifts[0]?.shift.employeeName ??
    employeeDirectory.find((employee) => employee.id === employeeId)?.fullName ??
    store.settings.favoriteEmployees.find((employee) => employee.employeeId === employeeId)?.fullName ??
    "Сотрудник";
  const plannedMinutes = shifts.reduce((sum, summary) => sum + diffMinutes(new Date(summary.shift.plannedStartAt), new Date(summary.shift.plannedEndAt)), 0);
  const workMinutes = shifts.reduce((sum, summary) => sum + summary.workMinutes, 0);
  const pauseMinutes = shifts.reduce((sum, summary) => sum + summary.pauseMinutes, 0);
  const freeMinutes = shifts.reduce((sum, summary) => sum + summary.freeMinutes, 0);
  const beforeShiftWorkMinutes = shifts.reduce((sum, summary) => sum + summary.beforeShiftWorkMinutes, 0);
  const overtimeMinutes = shifts.reduce((sum, summary) => sum + summary.overtimeMinutes, 0);
  const questionableOvertimeMinutes = shifts.reduce((sum, summary) => sum + summary.questionableOvertimeMinutes, 0);
  const presenceMinutes = shifts.reduce((sum, summary) => {
    const hasFact = summary.shift.source !== "default" || summary.workMinutes > 0 || summary.pauseMinutes > 0 || summary.freeMinutes > 0;
    return sum + (hasFact ? diffMinutes(new Date(summary.shift.actualStartAt), new Date(summary.shift.actualEndAt)) : 0);
  }, 0);

  return {
    beforeShiftWorkMinutes,
    employeeId,
    employeeName,
    freeMinutes,
    month: `${safeYear}-${String(safeMonth).padStart(2, "0")}`,
    overtimeMinutes,
    pauseMinutes,
    plannedMinutes,
    presenceMinutes,
    questionableOvertimeMinutes,
    shiftCount: shifts.length,
    shifts,
    undertimeMinutes: Math.max(0, plannedMinutes - presenceMinutes),
    workMinutes,
  };
}

function isMeaningfulLocalMonthShift(summary: EmuEmployeeShiftSummaryDto) {
  return (
    summary.shift.source !== "default" ||
    summary.workMinutes > 0 ||
    summary.pauseMinutes > 0 ||
    summary.freeMinutes > 0 ||
    summary.beforeShiftWorkMinutes > 0 ||
    summary.overtimeMinutes > 0 ||
    summary.decisions.length > 0
  );
}

function buildLocalEmployeeShift(
  payload: EmuUpdateEmployeeShiftDto,
  store: LocalStore,
  employeeDirectory: EmployeeDirectoryItem[],
  id: string,
  employeeId?: string,
): EmuEmployeeShiftDto {
  const resolvedEmployeeId = employeeId ?? store.settings.favoriteEmployees[0]?.employeeId ?? employeeDirectory[0]?.id ?? "";
  const employee =
    store.settings.favoriteEmployees.find((item) => item.employeeId === resolvedEmployeeId) ??
    employeeDirectory.find((item) => item.id === resolvedEmployeeId);
  const shiftType = payload.shiftType || "day";
  const base = buildShiftDateTimes(payload.shiftDate, shiftType);
  const plannedStartAt = payload.plannedStartAt ?? base.plannedStartAt;
  const plannedEndAt = payload.plannedEndAt ?? base.plannedEndAt;
  const actualStartAt = payload.actualStartAt ?? plannedStartAt;
  const actualEndAt = payload.actualEndAt ?? plannedEndAt;
  const lunchStartAt = payload.lunchStartAt ?? base.lunchStartAt;
  const lunchEndAt = payload.lunchEndAt ?? base.lunchEndAt;

  return {
    actualEndAt,
    actualStartAt,
    adjustedAt: payload.reason === "mock" ? null : new Date().toISOString(),
    adjustedByName: payload.reason === "mock" ? "" : "mock",
    comment: payload.comment ?? "",
    employeeId: resolvedEmployeeId,
    employeeName: employee?.fullName ?? "Сотрудник",
    id,
    lunchEndAt,
    lunchOverridden: payload.lunchOverridden,
    lunchStartAt,
    lunchTaken: payload.lunchTaken,
    plannedEndAt,
    plannedStartAt,
    reason: payload.reason,
    rowVersion: payload.rowVersion + 1,
    shiftDate: payload.shiftDate,
    shiftType,
    shiftTypeName: getShiftTypeName(shiftType),
    source: payload.reason === "mock" ? "default" : "manual",
    templateId: payload.templateId ?? null,
  };
}

function buildShiftDateTimes(date: string, shiftType: string) {
  const startDate = new Date(`${date}T00:00:00`);
  const plannedStart = new Date(startDate);
  const plannedEnd = new Date(startDate);
  const lunchStart = new Date(startDate);
  const lunchEnd = new Date(startDate);

  if (shiftType === "night") {
    plannedStart.setHours(20, 0, 0, 0);
    plannedEnd.setDate(plannedEnd.getDate() + 1);
    plannedEnd.setHours(8, 0, 0, 0);
    lunchStart.setDate(lunchStart.getDate() + 1);
    lunchStart.setHours(0, 0, 0, 0);
    lunchEnd.setDate(lunchEnd.getDate() + 1);
    lunchEnd.setHours(1, 0, 0, 0);
  } else {
    plannedStart.setHours(8, 0, 0, 0);
    plannedEnd.setHours(shiftType === "day11" ? 20 : 17, 0, 0, 0);
    lunchStart.setHours(12, 0, 0, 0);
    lunchEnd.setHours(13, 0, 0, 0);
  }

  return {
    lunchEndAt: lunchEnd.toISOString(),
    lunchStartAt: lunchStart.toISOString(),
    plannedEndAt: plannedEnd.toISOString(),
    plannedStartAt: plannedStart.toISOString(),
  };
}

function getShiftTypeName(shiftType: string) {
  if (shiftType === "night") return "Ночная";
  if (shiftType === "day11") return "11-часовая";
  if (shiftType === "individual") return "Индивидуальная";
  return "Дневная";
}

function isWorkingParticipationStatus(status: string) {
  return status === employeeStatusWorking || status === "Работает";
}

function toRange(startedAt: string, endedAt: string) {
  return { start: new Date(startedAt), end: new Date(endedAt) };
}

function diffMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function sumClippedMinutes(ranges: Array<{ start: Date; end: Date }>, windowStart: Date, windowEnd: Date) {
  return ranges.reduce((sum, range) => {
    const start = new Date(Math.max(range.start.getTime(), windowStart.getTime()));
    const end = new Date(Math.min(range.end.getTime(), windowEnd.getTime()));
    return sum + diffMinutes(start, end);
  }, 0);
}

function buildFreeDateRanges(
  start: Date,
  end: Date,
  occupiedRanges: Array<{ start: Date; end: Date }>,
) {
  const ranges = occupiedRanges
    .map((range) => ({
      start: new Date(Math.max(range.start.getTime(), start.getTime())),
      end: new Date(Math.min(range.end.getTime(), end.getTime())),
    }))
    .filter((range) => range.end.getTime() > range.start.getTime())
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const free: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);

  for (const range of ranges) {
    if (range.start.getTime() > cursor.getTime()) {
      free.push({ start: new Date(cursor), end: new Date(range.start) });
    }

    if (range.end.getTime() > cursor.getTime()) {
      cursor = new Date(range.end);
    }
  }

  if (cursor.getTime() < end.getTime()) {
    free.push({ start: cursor, end: new Date(end) });
  }

  return free;
}

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
    decisions: [],
    loading,
    planTasks: [...store.planTasks].sort(comparePlanDate),
    settings: store.settings,
    shiftRemarks: emptyShiftRemarkList,
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
  const sessionId = createId("emu-work");
  const session: EmuWorkSessionDto = {
    arrivedAt,
    completedAt: null,
    createdAt: now,
    deleteReason: "",
    deletedAt: null,
    employees: payload.employeeIds.map((employeeId) => {
      const employee = employeeSource.find((item) => item.id === employeeId);
      const participantId = createId("emu-participant");
      return {
        arrivedAt,
        employeeId,
        finishedAt: null,
        fullNameSnapshot: employee?.fullName ?? "Сотрудник",
        id: participantId,
        otherWorkMinutes: 0,
        participationStatus: employeeStatusWorking,
        personalPauseMinutes: 0,
        personalWorkMinutes: 0,
        positionSnapshot: employee?.position ?? "",
        status: employeeStatusWorking,
        waitingMinutes: 0,
        workMinutes: 0,
        intervals: [createLocalParticipationInterval(sessionId, participantId, employeeId, employeeStatusWorking, arrivedAt, "")],
      };
    }),
    id: sessionId,
    isCarriedOver: false,
    otherWorkMinutes: 0,
    operationalStatus: workStatusActive,
    planTaskId: planTask?.id ?? null,
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
      const participantId = createId("emu-participant");
      return {
        arrivedAt: session.arrivedAt,
        employeeId,
        finishedAt: null,
        fullNameSnapshot: employee?.fullName ?? "Сотрудник",
        id: participantId,
        intervals: [createLocalParticipationInterval(session.id, participantId, employeeId, employeeStatusWorking, session.arrivedAt, payload.comment)],
        otherWorkMinutes: 0,
        participationStatus: employeeStatusWorking,
        personalPauseMinutes: 0,
        personalWorkMinutes: 0,
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

function addLocalWorkSessionEmployee(store: LocalStore, id: string, payload: EmuAddWorkSessionEmployeeDto, employeeDirectory: EmployeeDirectoryItem[]) {
  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  if (session.completedAt) {
    throw new Error("В завершенную работу нельзя добавить сотрудника");
  }

  if (session.employees.some((employee) => employee.employeeId === payload.employeeId && !employee.finishedAt)) {
    throw new Error("Сотрудник уже есть в активном составе работы");
  }

  const employeeSource = employeeDirectory.length > 0 ? employeeDirectory : demoEmployeeDirectory;
  const employee = employeeSource.find((item) => item.id === payload.employeeId);
  const startedAt = payload.startedAt || new Date().toISOString();
  const participantId = createId("emu-participant");
  session.employees.push({
    arrivedAt: startedAt,
    employeeId: payload.employeeId,
    finishedAt: null,
    fullNameSnapshot: employee?.fullName ?? "Сотрудник",
    id: participantId,
    intervals: [createLocalParticipationInterval(session.id, participantId, payload.employeeId, employeeStatusWorking, startedAt, payload.comment)],
    otherWorkMinutes: 0,
    participationStatus: employeeStatusWorking,
    personalPauseMinutes: 0,
    personalWorkMinutes: 0,
    positionSnapshot: employee?.position ?? "",
    status: employeeStatusWorking,
    waitingMinutes: 0,
    workMinutes: 0,
  });
  session.status = workStatusActive;
  session.operationalStatus = workStatusActive;
  touchSession(session);
  addAudit(store, session.id, "employee_added", "", employee?.fullName ?? payload.employeeId, payload.comment);
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
      closeLocalParticipationIntervals(employee, payload.startedAt || new Date().toISOString());
      employee.status = payload.markAsOtherWork ? employeeStatusOtherWork : employeeStatusWaiting;
      employee.participationStatus = payload.markAsOtherWork ? employeeStatusOtherWork : participationStatusPaused;
      employee.intervals = [
        ...(employee.intervals ?? []),
        createLocalParticipationInterval(session.id, employee.id, employee.employeeId, employee.participationStatus, payload.startedAt || new Date().toISOString(), payload.comment),
      ];
    }
  }

  session.status = session.employees.some((employee) => employee.status === employeeStatusWorking && !employee.finishedAt) ? workStatusActive : workStatusWaiting;
  session.operationalStatus = session.status;
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
      closeLocalParticipationIntervals(employee, payload.resumedAt || new Date().toISOString());
      employee.status = employeeStatusWorking;
      employee.participationStatus = employeeStatusWorking;
      employee.intervals = [
        ...(employee.intervals ?? []),
        createLocalParticipationInterval(session.id, employee.id, employee.employeeId, employeeStatusWorking, payload.resumedAt || new Date().toISOString(), payload.comment),
      ];
    }
  }

  session.status = workStatusActive;
  session.operationalStatus = workStatusActive;
  touchSession(session);
  addAudit(store, session.id, "resumed", workStatusWaiting, workStatusActive, payload.comment || "Работа возобновлена");
  return session;
}

function finishLocalWorkSessionEmployee(store: LocalStore, id: string, employeeId: string, payload: EmuFinishWorkSessionEmployeeDto) {
  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  const employee = session.employees.find((item) => item.employeeId === employeeId && !item.finishedAt);
  if (!employee) {
    throw new Error("Активный сотрудник в карточке не найден");
  }

  const finishedAt = payload.finishedAt || new Date().toISOString();
  const status = payload.participationStatus === employeeStatusPartial ? employeeStatusPartial : employeeStatusFinished;
  closeLocalParticipationIntervals(employee, finishedAt);
  employee.status = status;
  employee.participationStatus = status;
  employee.finishedAt = finishedAt;
  session.status = session.employees.some((item) => item.status === employeeStatusWorking && !item.finishedAt) ? workStatusActive : workStatusWaiting;
  session.operationalStatus = session.status;
  touchSession(session);
  addAudit(store, session.id, "employee_finished", employeeStatusWorking, status, payload.comment);
  return session;
}

function markLocalWorkSessionEmployeeMistaken(store: LocalStore, id: string, employeeId: string, payload: EmuMarkMistakenWorkSessionEmployeeDto) {
  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  const employee = session.employees.find((item) => item.employeeId === employeeId);
  if (!employee) {
    throw new Error("Сотрудник в карточке не найден");
  }

  const finishedAt = new Date().toISOString();
  closeLocalParticipationIntervals(employee, finishedAt);
  employee.status = employeeStatusMistaken;
  employee.participationStatus = employeeStatusMistaken;
  employee.finishedAt = finishedAt;
  employee.workMinutes = 0;
  employee.waitingMinutes = 0;
  employee.otherWorkMinutes = 0;
  employee.personalWorkMinutes = 0;
  employee.personalPauseMinutes = 0;
  session.status = session.employees.some((item) => item.status === employeeStatusWorking && !item.finishedAt) ? workStatusActive : workStatusWaiting;
  session.operationalStatus = session.status;
  touchSession(session);
  addAudit(store, session.id, "employee_marked_mistaken", "", employeeStatusMistaken, payload.comment);
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
    closeLocalParticipationIntervals(employee, now);
    employee.status = employeeStatusFinished;
    employee.participationStatus = employeeStatusFinished;
    employee.finishedAt = now;
  }

  if (session.employees.every((employee) => employee.finishedAt)) {
    session.completedAt = now;
    session.operationalStatus = workStatusCompleted;
  }

  session.resultStatus = payload.resultStatus;
  if (session.completedAt) {
    session.status = payload.resultStatus;
  }
  session.resultComment = payload.resultComment;
  touchSession(session);
  addAudit(store, session.id, "completed", workStatusActive, session.status, payload.resultComment);
  if (payload.completedAt) {
    addAudit(store, session.id, "completed_at_changed", "", payload.completedAt, buildManualTimeComment("времени окончания", payload.completedAt, payload.resultComment));
  }

  const planTask = store.planTasks.find((task) => task.id && task.id === session.planTaskId);
  if (planTask && session.completedAt) {
    planTask.status = payload.resultStatus;
    planTask.rowVersion += 1;
    planTask.updatedAt = new Date().toISOString();
  }

  return session;
}

function carryOverLocalWorkSession(store: LocalStore, id: string, payload: EmuCarryOverWorkSessionDto) {
  if (!payload.comment.trim()) {
    throw new Error("Укажите причину переноса работы");
  }

  const session = requireSession(store, id);
  if (payload.rowVersion !== session.rowVersion) {
    throw new Error("Карточка была изменена другим пользователем");
  }

  if (session.completedAt) {
    throw new Error("Завершенную работу нельзя перенести");
  }

  if (payload.toDate <= session.workDate) {
    throw new Error("Новая дата должна быть позже текущей даты работы");
  }

  const previousDate = session.workDate;
  session.workDate = payload.toDate;
  session.isCarriedOver = true;
  touchSession(session);
  addAudit(store, session.id, "carried_over", previousDate, payload.toDate, payload.comment);
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
  session.operationalStatus = workStatusDeleted;
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

function rescheduleLocalPlanTask(store: LocalStore, id: string, payload: EmuReschedulePlanTaskDto) {
  const task = store.planTasks.find((item) => item.id === id);
  if (!task) throw new Error("Задача плана не найдена");
  if (payload.rowVersion !== task.rowVersion) {
    throw new Error("Задача была изменена другим пользователем");
  }

  const comment = payload.comment.trim();
  if (!comment) {
    throw new Error("Укажите причину переноса плановой задачи");
  }

  if (task.plannedDate === payload.newPlannedDate) {
    throw new Error("Новая дата должна отличаться от текущей");
  }

  const oldDate = task.plannedDate;
  task.plannedDate = payload.newPlannedDate;
  task.rowVersion += 1;
  task.updatedAt = new Date().toISOString();
  addAudit(store, null, "plan_rescheduled", oldDate, task.plannedDate, comment, task.id);
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
  const start = parseDateKey(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const updated = store.planTasks.filter((task) => {
    const date = parseDateKey(task.plannedDate);
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

function maxUpdatedAt(rows: Array<{ updatedAt?: string }>) {
  return rows.reduce<string | null>((latest, row) => {
    if (!row.updatedAt) return latest;
    if (!latest || new Date(row.updatedAt).getTime() > new Date(latest).getTime()) return row.updatedAt;
    return latest;
  }, null);
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

function createLocalParticipationInterval(
  workSessionId: string,
  workSessionEmployeeId: string,
  employeeId: string,
  status: string,
  startedAt: string,
  reason: string,
) {
  return {
    createdAt: new Date().toISOString(),
    createdByName: "mock",
    employeeId,
    endedAt: null,
    id: createId("emu-interval"),
    reason,
    startedAt,
    status,
    workSessionEmployeeId,
    workSessionId,
  };
}

function closeLocalParticipationIntervals(employee: EmuWorkSessionEmployeeDto, endedAt: string) {
  employee.intervals = (employee.intervals ?? []).map((interval) =>
    interval.endedAt
      ? interval
      : {
          ...interval,
          endedAt: new Date(endedAt).getTime() < new Date(interval.startedAt).getTime() ? interval.startedAt : endedAt,
        },
  );
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(dateKey);
  }

  return new Date(year, month - 1, day);
}

function isCompletedOnDate(session: EmuWorkSessionDto, dateKey: string) {
  return Boolean(session.completedAt && toDateKey(new Date(session.completedAt)) === dateKey);
}
