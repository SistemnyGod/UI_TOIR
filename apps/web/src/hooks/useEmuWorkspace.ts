import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EmuAddFavoriteEmployeeDto,
  EmuAddWorkSessionEmployeeDto,
  EmuCarryOverWorkSessionDto,
  EmuCompleteWorkSessionDto,
  EmuCreateReferenceDto,
  EmuCreateWorkSessionDto,
  EmuCreateWorkTemplateDto,
  EmuDashboardDto,
  EmuDeleteWorkSessionDto,
  EmuFinishWorkSessionEmployeeDto,
  EmuListResponseDto,
  EmuMarkMistakenWorkSessionEmployeeDto,
  EmuPauseWorkSessionDto,
  EmuPlanTaskDto,
  EmuReschedulePlanTaskDto,
  EmuResolveDecisionDto,
  EmuResumeWorkSessionDto,
  EmuUpdateEmployeeShiftDto,
  EmuUpdateReferenceDto,
  EmuUpdateWorkSessionDto,
  EmuUpdateWorkTemplateDto,
  EmuUpsertPlanTaskDto,
  EmuWorkSessionDto,
  SessionUserDto
} from "../api/contracts";
import { toEmuList as toList } from "../domain/emuLists";
import {
  buildLocalEmployeeWorkHistoryReport,
  buildLocalWorkHistoryReport,
  filterLocalSessions,
} from "../domain/emuLocalReports";
import { pageEmuWorkAudit } from "../domain/emuWorkAudit";
import { createEmuRepository, type EmuWorkSessionParams } from "../repositories/emuRepository";
import { hasPermission } from "../security/permissions";
import type { DataSourceMode, EmployeeDirectoryItem } from "../types";

import type { EmuWorkspaceState, LocalStore } from "../domain/emuLocalWorkspace";
import {
  addLocalFavoriteEmployee,
  addLocalWorkSessionEmployee,
  approveLocalPlanTask,
  approveLocalWeek,
  buildDashboardFromCollections,
  buildLocalEmployeeMonthSummary,
  buildLocalEmployeeShift,
  buildLocalEmployeeShiftSummary,
  carryOverLocalWorkSession,
  cloneStore,
  compareCreatedAt,
  comparePlanDate,
  completeLocalWorkSession,
  createEmptyStore,
  createLocalPlanTask,
  createLocalReference,
  createLocalWorkSession,
  createLocalWorkTemplate,
  deleteLocalWorkSession,
  ensureFavoriteEmployees,
  finishLocalWorkSessionEmployee,
  loadLocalStore,
  markLocalWorkSessionEmployeeMistaken,
  pauseLocalWorkSession,
  persistLocalStore,
  planApprovalApproved,
  planApprovalRejected,
  removeLocalFavoriteEmployee,
  rescheduleLocalPlanTask,
  resumeLocalWorkSession,
  toWorkspaceState,
  updateLocalPlanTask,
  updateLocalReference,
  updateLocalWorkSession,
  updateLocalWorkTemplate,
} from "../domain/emuLocalWorkspace";

const emuRepository = createEmuRepository();
const apiWorkSessionPageSize = 500;

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
  const generation = useRef(0);
  const workFlight = useRef<Promise<void> | null>(null);
  const planFlight = useRef<Promise<void> | null>(null);
  const fullLoadPending = useRef(false);
  const scope = JSON.stringify([dataSourceMode, currentUser?.id, currentUser?.permissions, currentUser?.roles]);
  const owner = useRef(scope);
  const stateOwner = useRef(scope);
  if (owner.current !== scope) {
    owner.current = scope;
    generation.current += 1;
    lastWorkSyncAtRef.current = null;
    lastPlanSyncAtRef.current = null;
    workFlight.current = null;
    planFlight.current = null;
  }
  const canViewDashboard = dataSourceMode !== "api" || hasPermission(currentUser, "emu.dashboard.view");
  const canViewPlan = dataSourceMode !== "api" || hasPermission(currentUser, "emu.plan.view");

  useEffect(() => {
    if (dataSourceMode !== "api") {
      return;
    }

    let mounted = true;
    const epoch = ++generation.current;
    fullLoadPending.current = true;
    workFlight.current = null;
    planFlight.current = null;
    setState((current) => {
      const hasLoadedApiState = stateOwner.current === scope && current.sourceMode === "api" && lastWorkSyncAtRef.current !== null;
      stateOwner.current = scope;
      if (hasLoadedApiState) {
        return { ...current, error: undefined, loading: false };
      }

      return toWorkspaceState(createEmptyStore(), true, "api");
    });
    Promise.all([
      emuRepository.getSettings(),
      canViewDashboard ? emuRepository.getDashboard() : Promise.resolve<EmuDashboardDto | null>(null),
      getAllApiWorkSessions({ boardOnly: true }),
      emuRepository.getShiftRemarks({ pageSize: 100 }),
      canViewPlan ? emuRepository.getPlanTasks() : Promise.resolve<EmuListResponseDto<EmuPlanTaskDto>>(toList([], 0)),
      emuRepository.getDecisions({ status: "new" }),
    ])
      .then(([settings, dashboard, workSessions, shiftRemarks, planTasks, decisions]) => {
        if (!mounted || epoch !== generation.current) return;
        lastWorkSyncAtRef.current = workSessions.serverTime ?? latestServerChange(workSessions.rows);
        lastPlanSyncAtRef.current = planTasks.serverTime ?? latestServerChange(planTasks.rows);
        fullLoadPending.current = false;
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
        if (!mounted || epoch !== generation.current) return;
        fullLoadPending.current = false;
        setState((current) => ({
          ...(current.sourceMode === "api" ? current : toWorkspaceState(createEmptyStore(), false, "api")),
          error: error instanceof Error ? error.message : "Не удалось загрузить ЭМУ",
          loading: false,
          sourceMode: "api",
        }));
      });

    return () => {
      mounted = false;
      if (epoch === generation.current) generation.current += 1;
    };
  }, [canViewDashboard, canViewPlan, dataSourceMode, reloadKey, scope]);

  useEffect(() => {
    if (dataSourceMode === "api") return;
    stateOwner.current = scope;
    const next = ensureFavoriteEmployees(store, employeeDirectory);
    if (next !== store) {
      setStore(next);
      persistLocalStore(next);
      setState(toWorkspaceState(next, false, "mock"));
      return;
    }

    setState(toWorkspaceState(store, false, "mock"));
  }, [dataSourceMode, employeeDirectory, scope, store]);

  const reload = useCallback(async () => {
    generation.current += 1;
    fullLoadPending.current = true;
    workFlight.current = null;
    planFlight.current = null;
    setReloadKey((value) => value + 1);
  }, []);

  const refreshWorkBoard = useCallback((): Promise<void> => {
    if (dataSourceMode !== "api") {
      setState(toWorkspaceState(store, false, "mock"));
      return Promise.resolve();
    }
    if (owner.current !== scope || fullLoadPending.current) return Promise.resolve();
    if (workFlight.current) return workFlight.current;
    const since = lastWorkSyncAtRef.current;
    if (!since) return reload();
    const epoch = generation.current;
    const flight = (async () => {
      try {
        const [changes, shiftRemarks] = await Promise.all([
          emuRepository.getWorkSessionChanges(since),
          emuRepository.getShiftRemarks({ pageSize: 100 }),
        ]);
        if (epoch !== generation.current || owner.current !== scope) return;
        if (!isCurrentChangeBatch(since, changes.serverTime)) return;
        lastWorkSyncAtRef.current = laterCursor(since, changes.serverTime);
        setState((current) => {
          if (epoch !== generation.current) return current;
          const rows = mergeWorkSessions(current.workSessions.rows, changes.changedSessions, changes.deletedSessionIds)
            .filter((row) => isWorkBoardRow(row, changes.serverTime));
          return {
            ...current,
            dashboard: buildDashboardFromCollections(rows, current.auditEvents, current.planTasks),
            error: undefined,
            loading: false,
            shiftRemarks,
            workSessions: toList(rows, rows.length, 1, Math.max(1, rows.length)),
          };
        });
      } catch (error) {
        if (epoch !== generation.current || owner.current !== scope) return;
        setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Не удалось обновить доску ЭМУ" }));
      } finally {
        if (epoch === generation.current) workFlight.current = null;
      }
    })();
    workFlight.current = flight;
    return flight;
  }, [dataSourceMode, reload, scope, store]);

  const refreshPlanBoard = useCallback((): Promise<void> => {
    if (dataSourceMode !== "api") {
      setState(toWorkspaceState(store, false, "mock"));
      return Promise.resolve();
    }
    if (!canViewPlan || owner.current !== scope || fullLoadPending.current) return Promise.resolve();
    if (planFlight.current) return planFlight.current;
    const since = lastPlanSyncAtRef.current;
    if (!since) return reload();
    const epoch = generation.current;
    const flight = (async () => {
      try {
        const changes = await emuRepository.getPlanTaskChanges(since);
        if (epoch !== generation.current || owner.current !== scope) return;
        if (!isCurrentChangeBatch(since, changes.serverTime)) return;
        lastPlanSyncAtRef.current = laterCursor(since, changes.serverTime);
        setState((current) => {
          if (epoch !== generation.current) return current;
          const planTasks = mergePlanTasks(current.planTasks, changes.changedTasks, changes.deletedTaskIds);
          return {
            ...current,
            dashboard: buildDashboardFromCollections(current.workSessions.rows, current.auditEvents, planTasks),
            error: undefined,
            loading: false,
            planTasks,
          };
        });
      } catch (error) {
        if (epoch !== generation.current || owner.current !== scope) return;
        setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Не удалось обновить доску задач ЭМУ" }));
      } finally {
        if (epoch === generation.current) planFlight.current = null;
      }
    })();
    planFlight.current = flight;
    return flight;
  }, [canViewPlan, dataSourceMode, reload, scope, store]);

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
          if (owner.current === scope) await reload();
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
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "sections", payload));
      },

      async updateSection(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateSection(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "sections", id, payload));
      },

      async createWaitReason(payload: EmuCreateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createWaitReason(payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "waitReasons", payload));
      },

      async updateWaitReason(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateWaitReason(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "waitReasons", id, payload));
      },

      async createNotCompletedReason(payload: EmuCreateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createNotCompletedReason(payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalReference(draft, "notCompletedReasons", payload));
      },

      async updateNotCompletedReason(id: string, payload: EmuUpdateReferenceDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateNotCompletedReason(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalReference(draft, "notCompletedReasons", id, payload));
      },

      async createWorkTemplate(payload: EmuCreateWorkTemplateDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createWorkTemplate(payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalWorkTemplate(draft, payload));
      },

      async updateWorkTemplate(id: string, payload: EmuUpdateWorkTemplateDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updateWorkTemplate(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalWorkTemplate(draft, id, payload));
      },

      async addFavoriteEmployee(payload: EmuAddFavoriteEmployeeDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.addFavoriteEmployee(payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => addLocalFavoriteEmployee(draft, payload, employeeDirectory));
      },

      async removeFavoriteEmployee(employeeId: string) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.removeFavoriteEmployee(employeeId);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => removeLocalFavoriteEmployee(draft, employeeId));
      },

      async getWorkSessionAudit(id: string, params: { page?: number; pageSize?: number } = {}) {
        if (dataSourceMode === "api") {
          return emuRepository.getWorkSessionAudit(id, { pageSize: 100, ...params });
        }

        return pageEmuWorkAudit(store.auditEvents, id, params);
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
          const requestGeneration = generation.current;
          const result = await emuRepository.updateEmployeeShift(id, payload);
          if (owner.current === scope && requestGeneration === generation.current) await reload();
          return result;
        }

        return buildLocalEmployeeShift(payload, store, employeeDirectory, id);
      },

      async getDecisions(status = "new") {
        if (dataSourceMode === "api") {
          const requestGeneration = generation.current;
          const decisions = await emuRepository.getDecisions({ status });
          if (owner.current === scope && requestGeneration === generation.current) setState((current) => ({ ...current, decisions }));
          return decisions;
        }

        return [];
      },

      async resolveDecision(id: string, payload: EmuResolveDecisionDto) {
        if (dataSourceMode === "api") {
          const requestGeneration = generation.current;
          const result = await emuRepository.resolveDecision(id, payload);
          if (owner.current !== scope || requestGeneration !== generation.current) return result;
          setState(current => ({ ...current, decisions: current.decisions.filter(decision => decision.id !== id) }));
          try {
            const decisions = await emuRepository.getDecisions({ status: "new" });
            if (owner.current === scope && requestGeneration === generation.current) setState((current) => ({ ...current, decisions }));
          } catch {
            if (owner.current === scope && requestGeneration === generation.current) setState(current => ({ ...current, error: "Решение сохранено. Не удалось обновить список спорных ситуаций. Обновите доску; повторное закрытие не требуется." }));
          }
          return result;
        }

        throw new Error("Решения доступны только в API-режиме");
      },

      async createPlanTask(payload: EmuUpsertPlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.createPlanTask(payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => createLocalPlanTask(draft, payload));
      },

      async updatePlanTask(id: string, payload: EmuUpsertPlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.updatePlanTask(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => updateLocalPlanTask(draft, id, payload));
      },

      async reschedulePlanTask(id: string, payload: EmuReschedulePlanTaskDto) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.reschedulePlanTask(id, payload);
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => rescheduleLocalPlanTask(draft, id, payload));
      },

      async approvePlanTask(id: string, approved: boolean, comment?: string, openedRowVersion?: number) {
        if (dataSourceMode === "api") {
          const task = state.planTasks.find((item) => item.id === id);
          const result = await emuRepository.approvePlanTask(id, {
            approved,
            comment: comment || (approved ? planApprovalApproved : planApprovalRejected),
            rowVersion: openedRowVersion ?? task?.rowVersion ?? 1,
          });
          if (owner.current === scope) await reload();
          return result;
        }

        return runLocalMutation((draft) => {
          if (openedRowVersion !== undefined && draft.planTasks.find(task => task.id === id)?.rowVersion !== openedRowVersion) throw new Error("Задача была изменена другим пользователем");
          return approveLocalPlanTask(draft, id, approved, comment);
        });
      },

      async approveWeek(weekStart: string, comment?: string) {
        if (dataSourceMode === "api") {
          const result = await emuRepository.approveWeek({ comment: comment || "Массовое согласование недели", weekStart });
          if (owner.current === scope) await reload();
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
    [dataSourceMode, employeeDirectory, reload, runLocalMutation, scope, state.planTasks, store],
  );

  return {
    ...(stateOwner.current === scope ? state : toWorkspaceState(createEmptyStore(), true, dataSourceMode)),
    actions: apiOrLocal,
    reload,
    refreshPlanBoard,
    refreshWorkBoard,
  };
}

export type EmuWorkspace = ReturnType<typeof useEmuWorkspace>;

async function getAllApiWorkSessions(params: EmuWorkSessionParams = {}) {
  const rows: EmuWorkSessionDto[] = [];
  let page = 1;
  let pageCount = 1;
  let total = 0;
  let serverTime: string | null | undefined;

  do {
    const result = await emuRepository.getWorkSessions({ ...params, page, pageSize: apiWorkSessionPageSize });
    if (page === 1) serverTime = result.serverTime;
    rows.push(...result.rows);
    pageCount = result.pageCount;
    total = result.total;
    page += 1;
  } while (page <= pageCount);

  return { ...toList(rows, total, 1, apiWorkSessionPageSize), serverTime };
}


function mergeWorkSessions(current: EmuWorkSessionDto[], changed: EmuWorkSessionDto[], deletedIds: string[]) {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item]));
  for (const item of changed) {
    const previous = byId.get(item.id);
    if (!deleted.has(item.id) && (!previous || item.rowVersion >= previous.rowVersion)) byId.set(item.id, item);
  }

  return [...byId.values()].sort(compareCreatedAt);
}

function mergePlanTasks(current: EmuPlanTaskDto[], changed: EmuPlanTaskDto[], deletedIds: string[]) {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item]));
  for (const item of changed) {
    const previous = byId.get(item.id);
    if (!deleted.has(item.id) && (!previous || item.rowVersion >= previous.rowVersion)) byId.set(item.id, item);
  }

  return [...byId.values()].sort(comparePlanDate);
}

function laterCursor(current: string, incoming: string) {
  return Date.parse(incoming) > Date.parse(current) ? incoming : current;
}

function isCurrentChangeBatch(since: string, serverTime: string) {
  const timestamp = Date.parse(serverTime);
  if (!Number.isFinite(timestamp)) throw new Error("Сервер вернул некорректное время обновления ЭМУ.");
  return timestamp >= Date.parse(since);
}

function latestServerChange(rows: Array<{ updatedAt?: string }>) {
  return rows.reduce((latest, row) => row.updatedAt ? laterCursor(latest, row.updatedAt) : latest, new Date(0).toISOString());
}

const businessDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" });
function isWorkBoardRow(row: EmuWorkSessionDto, now: string) {
  return !row.deletedAt && (!row.completedAt || businessDate.format(new Date(row.completedAt)) >= businessDate.format(new Date(now)));
}
