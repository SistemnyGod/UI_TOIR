import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EmuDecisionDto,
  SessionUserDto,
} from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import { useStoredState } from "../../hooks/useStoredState";
import { hasPermission } from "../../security/permissions";
import type { EmployeeDirectoryItem } from "../../types";
import { Button, FilterBar, PageHeader, Panel } from "../../shared/ui";
import {
  buildEmuEmployeeWorkload,
  filterEmuWorkBySection,
  groupEmuWorkBySection,
} from "../../domain/emuWorkBoard";
import {
  emuCreateWorkDraftKey,
  emuWorkAccountingPreferencesKey,
  planBoardRefreshMs,
  realtimeJitterMs,
  workBoardRefreshMs,
  type EmuEmployeeOption,
  type EmuWorkAccountingPreferences,
  type ModalKind,
  type WorkCardFilter,
  type WorkDensity,
  type WorkSideSelection,
} from "./work-accounting/types";
import {
  DensitySwitch,
  SectionQuickFilter,
  WorkAttentionSummary,
  WorkBoardSection,
  WorkCard,
  WorkFilterTabs,
  WorkSearchFilter,
} from "./work-accounting/WorkAccountingBoard";
import { MobileShiftRemarksPanel } from "./work-accounting/board/MobileShiftRemarksPanel";
import { initialWorkloadView, type EmployeeWorkloadView } from "./work-accounting/side/EmployeeWorkloadPanel";
import { buildCreateWorkEmployeeOptions } from "./work-accounting/createWorkOptions";
import "./work-accounting/workAccountingWorkspace.css";
import { ResolveDecisionModal, WorkSidePanel } from "./work-accounting/WorkSidePanel";
import {
  AddEmployeeToWorkModal,
  CarryOverWorkModal,
  CompleteWorkModal,
  CreateWorkModal,
  DeleteWorkModal,
  EditWorkModal,
  FinishEmployeeParticipationModal,
  MarkMistakenEmployeeModal,
  PauseWorkModal,
  ResumeWorkModal,
  WorkDetailsModal,
} from "./work-accounting/modals/WorkSessionModals";
import { CatalogsModal } from "./work-accounting/modals/CatalogsModal";
import { FavoritesModal } from "./work-accounting/modals/FavoritesModal";
import { PlanBoardModal } from "./work-accounting/modals/PlanBoardModal";
import {
  activeSections,
  buildWorkFilterCounts,
  isEmuWorkAccountingPreferences,
  isVisibleOnDailyBoard,
  resolveWorkCardState,
  toggle,
} from "./work-accounting/workAccountingUtils";


export function EmuWorkAccountingScreen({
  currentUser,
  employeeDirectory,
  onNotify,
  workspace,
}: {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [sideSelection, setSideSelection] = useState<WorkSideSelection>(null);
  const [workloadView, setWorkloadView] = useState<EmployeeWorkloadView>(initialWorkloadView);
  const returnToDetails = useRef("");
  const [preferences, setPreferences] = useStoredState<EmuWorkAccountingPreferences>(
    emuWorkAccountingPreferencesKey,
    { collapsedSections: [], density: "compact", sectionFilter: "", workFilter: "all" },
    { validate: isEmuWorkAccountingPreferences, version: 1 },
  );
  const [workFilter, setWorkFilter] = useState<WorkCardFilter>(preferences.workFilter);
  const [sectionFilter, setSectionFilter] = useState(preferences.sectionFilter);
  const [workSearch, setWorkSearch] = useState("");
  const [density, setDensity] = useState<WorkDensity>(preferences.density);
  const [collapsedSections, setCollapsedSections] = useState<string[]>(preferences.collapsedSections);
  const [createPresetEmployeeId, setCreatePresetEmployeeId] = useState("");
  const [decisionModal, setDecisionModal] = useState<EmuDecisionDto | null>(null);
  const [liveClock, setLiveClock] = useState<Date>(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function refreshBoard() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try { await workspace.refreshWorkBoard(); }
    catch (error) { if (alive.current) onNotify(error instanceof Error ? error.message : "Не удалось обновить доску работ"); }
    finally { refreshingRef.current = false; if (alive.current) setRefreshing(false); }
  }
  const boardWork = useMemo(
    () =>
      [...workspace.workSessions.rows]
        .filter(isVisibleOnDailyBoard)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [workspace.workSessions.rows],
  );
  const sectionFilteredBoardWork = useMemo(
    () => filterEmuWorkBySection(boardWork, sectionFilter),
    [boardWork, sectionFilter],
  );
  const filteredBoardWork = useMemo(() => {
    const query = workSearch.trim().toLocaleLowerCase("ru-RU");

    return sectionFilteredBoardWork.filter((work) => {
      if (!query) return true;

      return [
        work.workNumber,
        work.sectionName,
        work.taskDescription,
        work.createdByName,
        ...work.employees.map((employee) => employee.fullNameSnapshot),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(query);
    });
  }, [sectionFilteredBoardWork, workSearch]);
  const ongoingWork = filteredBoardWork;
  const visibleShiftRemarks = useMemo(
    () => workspace.shiftRemarks.rows.filter((remark) => !sectionFilter || remark.sectionId === sectionFilter),
    [sectionFilter, workspace.shiftRemarks.rows],
  );
  const workFilterCounts = useMemo(() => buildWorkFilterCounts(filteredBoardWork), [filteredBoardWork]);
  const visibleWork = useMemo(
    () => filteredBoardWork.filter((work) => workFilter === "all" || resolveWorkCardState(work) === workFilter),
    [filteredBoardWork, workFilter],
  );
  const hasActiveBoardFilters = Boolean(sectionFilter || workSearch.trim() || workFilter !== "all");
  const carriedOverWork = useMemo(() => visibleWork.filter((work) => work.isCarriedOver && !work.completedAt), [visibleWork]);
  const regularVisibleWork = useMemo(() => visibleWork.filter((work) => !work.isCarriedOver), [visibleWork]);
  const boardSections = useMemo(() => groupEmuWorkBySection(regularVisibleWork), [regularVisibleWork]);
  const selectedWork = selectedWorkId ? workspace.workSessions.rows.find((item) => item.id === selectedWorkId) : undefined;
  const selectedWorkEmployee = selectedWork && selectedEmployeeId ? selectedWork.employees.find((employee) => employee.employeeId === selectedEmployeeId) : undefined;
  const canCreate = hasPermission(currentUser, "emu.work.create");
  const canUpdate = hasPermission(currentUser, "emu.work.update");
  const canPause = hasPermission(currentUser, "emu.work.pause");
  const canComplete = hasPermission(currentUser, "emu.work.complete");
  const canDelete = hasPermission(currentUser, "emu.work.delete");
  const canManageDirectories = hasPermission(currentUser, "emu.directories.manage");
  const canManageFavorites = hasPermission(currentUser, "emu.favorite-employees.manage");
  const canAdjustShift = hasPermission(currentUser, "emu.shift.adjust");
  const canResolveDecision = hasPermission(currentUser, "emu.decision.resolve");
  const canViewPlan = hasPermission(currentUser, "emu.plan.view");
  const canManagePlan = hasPermission(currentUser, "emu.plan.manage");
  const canApprovePlan = hasPermission(currentUser, "emu.plan.approve");
  const employeeOptions = useMemo<EmuEmployeeOption[]>(
    () => buildCreateWorkEmployeeOptions(employeeDirectory, workspace.settings.favoriteEmployees).employees,
    [employeeDirectory, workspace.settings.favoriteEmployees],
  );
  const employeeWorkload = useMemo(
    () => buildEmuEmployeeWorkload(workspace.settings.favoriteEmployees, workspace.workSessions.rows, employeeDirectory),
    [employeeDirectory, workspace.settings.favoriteEmployees, workspace.workSessions.rows],
  );

  useEffect(() => {
    setPreferences({
      collapsedSections,
      density,
      sectionFilter,
      workFilter,
    });
  }, [collapsedSections, density, sectionFilter, setPreferences, workFilter]);
  const openDecisions = useMemo(() => workspace.decisions.filter((decision) => decision.status === "new"), [workspace.decisions]);
  const openDecisionWorkIds = useMemo(
    () => new Set(openDecisions.map((decision) => decision.workSessionId).filter((value): value is string => Boolean(value))),
    [openDecisions],
  );
  const selectedSideWork = sideSelection?.kind === "work" ? workspace.workSessions.rows.find((work) => work.id === sideSelection.workId) : undefined;
  const selectedSideEmployee = sideSelection?.kind === "employee" ? employeeWorkload.find((employee) => employee.employeeId === sideSelection.employeeId) : undefined;

  function openModal(kind: ModalKind, id?: string) {
    if (!canOpenModal(kind)) {
      onNotify("Недостаточно прав для действия ЭМУ.");
      return;
    }

    returnToDetails.current = "";
    if (id) setSelectedWorkId(id);
    setModal(kind);
  }

  function openDetailsAction(kind: ModalKind, employeeId = "") {
    if (!selectedWork || !canOpenModal(kind)) return;
    openModal(kind, selectedWork.id);
    setSelectedEmployeeId(employeeId);
    returnToDetails.current = selectedWork.id;
  }

  function closeWorkDialog() {
    const workId = returnToDetails.current;
    returnToDetails.current = "";
    setSelectedEmployeeId("");
    if (workId) setSelectedWorkId(workId);
    setModal(workId ? "details" : null);
  }

  function canOpenModal(kind: ModalKind) {
    switch (kind) {
      case "create":
        return canCreate;
      case "edit":
      case "carryOver":
      case "addEmployee":
      case "mistakenEmployee":
        return canUpdate;
      case "pause":
      case "resume":
        return canPause;
      case "complete":
      case "finishEmployee":
        return canComplete;
      case "delete":
        return canDelete;
      case "catalogs":
        return canManageDirectories;
      case "favorites":
        return canManageFavorites;
      case "plan":
        return canViewPlan;
      case "details":
      case null:
        return true;
      default:
        return false;
    }
  }

  function toggleSectionGroup(sectionId: string) {
    setCollapsedSections((value) => toggle(value, sectionId));
  }

  function clearBoardFilters() {
    setSectionFilter("");
    setWorkSearch("");
    setWorkFilter("all");
  }

  function createWorkForEmployee(employeeId: string) {
    setCreatePresetEmployeeId(employeeId);
    setSideSelection({ employeeId, kind: "employee" });
    openModal("create");
  }

  function openEmployeeModal(kind: ModalKind, workId: string, employeeId: string) {
    setSelectedEmployeeId(employeeId);
    openModal(kind, workId);
  }

  function selectWork(workId: string) {
    setSelectedWorkId(workId);
    setSideSelection({ kind: "work", workId });
  }

  useEffect(() => {
    if (workspace.sourceMode !== "api" || modal) return;

    let cancelled = false;
    let workTimer: number | undefined;
    let planTimer: number | undefined;

    const withJitter = (baseMs: number) => baseMs + Math.floor(Math.random() * realtimeJitterMs);
    const canRefresh = () => !cancelled && document.visibilityState === "visible";

    const scheduleWorkRefresh = (delayMs = withJitter(workBoardRefreshMs)) => {
      workTimer = window.setTimeout(() => {
        if (!canRefresh()) {
          scheduleWorkRefresh();
          return;
        }

        void workspace.refreshWorkBoard().finally(() => {
          if (!cancelled) {
            setLiveClock(new Date());
            scheduleWorkRefresh();
          }
        });
      }, delayMs);
    };

    const schedulePlanRefresh = (delayMs = withJitter(planBoardRefreshMs)) => {
      planTimer = window.setTimeout(() => {
        if (!canRefresh()) {
          schedulePlanRefresh();
          return;
        }

        void workspace.refreshPlanBoard().finally(() => {
          if (!cancelled) schedulePlanRefresh();
        });
      }, delayMs);
    };

    scheduleWorkRefresh(Math.floor(Math.random() * realtimeJitterMs));
    schedulePlanRefresh(withJitter(planBoardRefreshMs));

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void workspace.refreshWorkBoard().finally(() => setLiveClock(new Date()));
        void workspace.refreshPlanBoard();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (workTimer !== undefined) window.clearTimeout(workTimer);
      if (planTimer !== undefined) window.clearTimeout(planTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [modal, workspace.refreshPlanBoard, workspace.refreshWorkBoard, workspace.sourceMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="emu-page emu-work-accounting-workspace">
      <PageHeader
        className="emu-page-heading emu-work-accounting-heading"
        description="Задачи, исполнители и состояние работ на участках."
        eyebrow="ЭМУ"
        title="Учет работ ЭМУ"
        actions={(
          <div className="emu-heading-actions">
          <Button variant="ghost" disabled={refreshing} isLoading={refreshing} onClick={() => void refreshBoard()}>Обновить доску</Button>
          {canViewPlan ? (
            <Button variant="secondary" onClick={() => openModal("plan")}>
              Доска задач
            </Button>
          ) : null}
          {canCreate ? (
            <Button variant="primary" onClick={() => openModal("create")}>Создать работу</Button>
          ) : null}
          </div>
        )}
      />

      {workspace.error ? <div className="emu-alert" role="alert">{workspace.error}</div> : null}

      <WorkAttentionSummary activeWork={ongoingWork} />
      <MobileShiftRemarksPanel remarks={visibleShiftRemarks} total={workspace.shiftRemarks.total} />

      <div className="emu-work-layout">
        <Panel
          className="emu-work-main"
          note={`Незавершённых работ: ${boardWork.length}. Завершённые работы доступны в истории.`}
          title="Карточки работ"
          actions={(
            <>
              {canManageDirectories ? <Button variant="secondary" onClick={() => openModal("catalogs")}>Справочники</Button> : null}
              {canManageFavorites ? <Button variant="secondary" onClick={() => openModal("favorites")}>Избранные</Button> : null}
            </>
          )}
        >

          <FilterBar ariaLabel="Фильтры карточек работ" className="emu-work-board-toolbar">
            <div className="emu-work-board-toolbar-main">
              <SectionQuickFilter sections={activeSections(workspace)} value={sectionFilter} onChange={setSectionFilter} />
              <WorkSearchFilter onChange={setWorkSearch} onClear={() => setWorkSearch("")} value={workSearch} />
            </div>
            <div className="emu-work-board-toolbar-secondary">
              <DensitySwitch value={density} onChange={setDensity} />
              <WorkFilterTabs counts={workFilterCounts} onChange={setWorkFilter} value={workFilter} />
            </div>
          </FilterBar>

          <div className={`emu-board-stack density-${density}`}>
            {carriedOverWork.length > 0 ? (
              <section className="emu-board-section emu-carry-over-section">
                <header className="emu-board-section-header">
                  <div>
                    <strong>Перенесенные</strong>
                    <span>{carriedOverWork.length} незавершенных работ с прошлой смены или дня</span>
                  </div>
                </header>
                <div className="emu-card-grid">
                  {carriedOverWork.map((work) => (
                    <WorkCard
                      selected={selectedSideWork?.id === work.id}
                      canComplete={canComplete}
                      canDelete={canDelete}
                      canPause={canPause}
                      canUpdate={canUpdate}
                      density={density}
                      key={work.id}
                      onCarryOver={() => openModal("carryOver", work.id)}
                      onComplete={() => openModal("complete", work.id)}
                      onDelete={() => openModal("delete", work.id)}
                      onDetails={() => openModal("details", work.id)}
                      onEdit={() => openModal("edit", work.id)}
                      onPause={() => openModal("pause", work.id)}
                      onResume={() => openModal("resume", work.id)}
                      onSelect={() => selectWork(work.id)}
                      now={liveClock}
                      requiresDecision={openDecisionWorkIds.has(work.id)}
                      work={work}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {boardSections.length > 0 ? (
              boardSections.map((section) => (
                <WorkBoardSection
                  selectedWorkId={selectedSideWork?.id}
                  canComplete={canComplete}
                  canDelete={canDelete}
                  canPause={canPause}
                  canUpdate={canUpdate}
                  collapsed={collapsedSections.includes(section.sectionId)}
                  density={density}
                  key={section.sectionId}
                  onComplete={(id) => openModal("complete", id)}
                  onCarryOver={(id) => openModal("carryOver", id)}
                  onDelete={(id) => openModal("delete", id)}
                  onDetails={(id) => openModal("details", id)}
                  onEdit={(id) => openModal("edit", id)}
                  onPause={(id) => openModal("pause", id)}
                  onResume={(id) => openModal("resume", id)}
                  onSelect={selectWork}
                  onToggle={() => toggleSectionGroup(section.sectionId)}
                  now={liveClock}
                  openDecisionWorkIds={openDecisionWorkIds}
                  section={section}
                />
              ))
            ) : carriedOverWork.length === 0 ? (
              <div className="emu-empty-state emu-work-empty-state" role="status" aria-live="polite">
                <span className="emu-empty-state-copy">
                  {boardWork.length === 0
                    ? "Карточек на суточной доске нет. Создайте работу или откройте историю выполненных работ."
                    : filteredBoardWork.length === 0
                      ? "По выбранным фильтрам карточки не найдены."
                      : "Карточек с выбранным состоянием нет."}
                </span>
                {hasActiveBoardFilters ? (
                  <Button className="emu-empty-state-action" onClick={clearBoardFilters} variant="secondary">
                    Сбросить фильтры
                  </Button>
                ) : boardWork.length === 0 && canCreate ? (
                  <Button className="emu-empty-state-action" onClick={() => openModal("create")} variant="primary">
                    Создать работу
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>

        <WorkSidePanel
          workloadView={workloadView}
          onWorkloadViewChange={setWorkloadView}
          key={selectedSideWork?.id ?? selectedSideEmployee?.employeeId ?? "overview"}
          onClearSelection={() => setSideSelection(null)}
          onOpenWorkDetails={id => openModal("details", id)}
          canAdjustShift={canAdjustShift}
          canCreate={canCreate}
          canComplete={canComplete}
          canPause={canPause}
          canResolveDecision={canResolveDecision}
          canUpdate={canUpdate}
          decisions={openDecisions}
          employeeWorkload={employeeWorkload}
          now={liveClock}
          onNotify={onNotify}
          onAddEmployee={(workId) => openModal("addEmployee", workId)}
          onCreateForEmployee={createWorkForEmployee}
          onFinishEmployee={(workId, employeeId) => openEmployeeModal("finishEmployee", workId, employeeId)}
          onMistakenEmployee={(workId, employeeId) => openEmployeeModal("mistakenEmployee", workId, employeeId)}
          onPauseEmployee={(workId, employeeId) => openEmployeeModal("pause", workId, employeeId)}
          onResumeEmployee={(workId, employeeId) => openEmployeeModal("resume", workId, employeeId)}
          onResolveDecision={(decision) => setDecisionModal(decision)}
          onSelectEmployee={(employeeId) => setSideSelection({ employeeId, kind: "employee" })}
          onSelectWork={selectWork}
          problemWork={ongoingWork.filter((work) => work.isCarriedOver || resolveWorkCardState(work) === "attention")}
          selectedEmployee={selectedSideEmployee}
          selectedWork={selectedSideWork}
          workspace={workspace}
          workSessions={workspace.workSessions.rows}
        />
      </div>

      {modal === "create" && canCreate ? (
        <CreateWorkModal
          draftStorageKey={`${emuCreateWorkDraftKey}:${currentUser?.id ?? "mock"}`}
          employeeOptions={employeeOptions}
          initialSectionId={sectionFilter}
          initialEmployeeId={createPresetEmployeeId}
          onClose={() => {
            setCreatePresetEmployeeId("");
            setModal(null);
          }}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
      {modal === "edit" && selectedWork && canUpdate ? (
        <EditWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} employeeOptions={employeeOptions} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "pause" && selectedWork && canPause ? (
        <PauseWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} initialEmployeeId={selectedEmployeeId} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "resume" && selectedWork && canPause ? (
        <ResumeWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} initialEmployeeId={selectedEmployeeId} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "complete" && selectedWork && canComplete ? (
        <CompleteWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "carryOver" && selectedWork && canUpdate ? (
        <CarryOverWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "addEmployee" && selectedWork && canUpdate ? (
        <AddEmployeeToWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} employeeOptions={employeeOptions} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "finishEmployee" && selectedWork && selectedWorkEmployee && canComplete ? (
        <FinishEmployeeParticipationModal key={`${selectedWork.id}:${selectedEmployeeId}`} employee={selectedWorkEmployee} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "mistakenEmployee" && selectedWork && selectedWorkEmployee && canUpdate ? (
        <MarkMistakenEmployeeModal key={`${selectedWork.id}:${selectedEmployeeId}`} employee={selectedWorkEmployee} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "delete" && selectedWork && canDelete ? (
        <DeleteWorkModal key={`${selectedWork.id}:${selectedEmployeeId}`} onClose={closeWorkDialog} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "details" && selectedWork ? (
        <WorkDetailsModal key={`${selectedWork.id}:${selectedEmployeeId}`} controls={{ canUpdate, canPause, canComplete, onEdit: () => openDetailsAction("edit"), onAddEmployee: () => openDetailsAction("addEmployee"), onComplete: () => openDetailsAction("complete"), onEmployeeAction: openDetailsAction }} canViewAudit={workspace.sourceMode !== "api" || hasPermission(currentUser, "emu.audit.view")} now={liveClock} onClose={() => setModal(null)} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "catalogs" && canManageDirectories ? (
        <CatalogsModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} />
      ) : null}
      {modal === "favorites" && canManageFavorites ? (
        <FavoritesModal employeeOptions={employeeOptions} onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} />
      ) : null}
      {modal === "plan" && canViewPlan ? (
        <PlanBoardModal
          canApprovePlan={canApprovePlan}
          canCreateWork={canCreate}
          canManagePlan={canManagePlan}
          employeeOptions={employeeOptions}
          onClose={() => setModal(null)}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
      {decisionModal && canResolveDecision ? (
        <ResolveDecisionModal
          key={decisionModal.id}
          decision={decisionModal}
          onClose={() => setDecisionModal(null)}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
    </section>
  );
}
