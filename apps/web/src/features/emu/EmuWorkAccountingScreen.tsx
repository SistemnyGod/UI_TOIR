import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EmuDecisionDto,
  EmuShiftRemarkDto,
  SessionUserDto,
} from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import { useStoredState } from "../../hooks/useStoredState";
import { hasPermission } from "../../security/permissions";
import type { EmployeeDirectoryItem } from "../../types";
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
  CatalogSummary,
  DensitySwitch,
  SectionQuickFilter,
  WorkAttentionSummary,
  WorkBoardSection,
  WorkCard,
  WorkFilterTabs,
} from "./work-accounting/WorkAccountingBoard";
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
import { CatalogsModal, FavoritesModal } from "./work-accounting/modals/DirectoryModals";
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
  const [preferences, setPreferences] = useStoredState<EmuWorkAccountingPreferences>(
    emuWorkAccountingPreferencesKey,
    { collapsedSections: [], density: "compact", sectionFilter: "", workFilter: "all" },
    { validate: isEmuWorkAccountingPreferences, version: 1 },
  );
  const [workFilter, setWorkFilter] = useState<WorkCardFilter>(preferences.workFilter);
  const [sectionFilter, setSectionFilter] = useState(preferences.sectionFilter);
  const [density, setDensity] = useState<WorkDensity>(preferences.density);
  const [collapsedSections, setCollapsedSections] = useState<string[]>(preferences.collapsedSections);
  const [createPresetEmployeeId, setCreatePresetEmployeeId] = useState("");
  const [decisionModal, setDecisionModal] = useState<EmuDecisionDto | null>(null);
  const [liveClock, setLiveClock] = useState<Date>(() => new Date());
  const boardWork = useMemo(
    () =>
      workspace.workSessions.rows
        .filter(isVisibleOnDailyBoard)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [workspace.workSessions.rows],
  );
  const sectionFilteredBoardWork = useMemo(
    () => filterEmuWorkBySection(boardWork, sectionFilter),
    [boardWork, sectionFilter],
  );
  const ongoingWork = sectionFilteredBoardWork;
  const visibleShiftRemarks = useMemo(
    () => workspace.shiftRemarks.rows.filter((remark) => !sectionFilter || remark.sectionId === sectionFilter),
    [sectionFilter, workspace.shiftRemarks.rows],
  );
  const workFilterCounts = useMemo(() => buildWorkFilterCounts(sectionFilteredBoardWork), [sectionFilteredBoardWork]);
  const visibleWork = useMemo(
    () => sectionFilteredBoardWork.filter((work) => workFilter === "all" || resolveWorkCardState(work) === workFilter),
    [sectionFilteredBoardWork, workFilter],
  );
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
  const employeeOptions = useMemo<EmuEmployeeOption[]>(() => {
    const activeFavoriteIds = new Set(workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => employee.employeeId));
    const source =
      employeeDirectory.length > 0
        ? employeeDirectory
        : workspace.settings.favoriteEmployees.map((employee) => ({
            department: employee.department,
            fullName: employee.fullName,
            id: employee.employeeId,
            personnelNo: employee.personnelNo,
            position: employee.position,
            status: employee.status as EmployeeDirectoryItem["status"],
          }));

    return [...source]
      .sort((a, b) => Number(activeFavoriteIds.has(b.id)) - Number(activeFavoriteIds.has(a.id)) || a.fullName.localeCompare(b.fullName, "ru"))
      .map((employee) => ({
        department: employee.department,
        fullName: employee.fullName,
        id: employee.id,
        personnelNo: employee.personnelNo,
        position: employee.position,
        status: employee.status,
      }));
  }, [employeeDirectory, workspace.settings.favoriteEmployees]);
  const employeeWorkload = useMemo(
    () => buildEmuEmployeeWorkload(workspace.settings.favoriteEmployees, workspace.workSessions.rows, employeeDirectory, sectionFilter),
    [employeeDirectory, sectionFilter, workspace.settings.favoriteEmployees, workspace.workSessions.rows],
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

    if (id) setSelectedWorkId(id);
    setModal(kind);
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
    <section className="emu-page">
      <div className="emu-page-heading emu-work-accounting-heading">
        <div>
          <h2>Учет работ ЭМУ</h2>
          <p>Суточная доска активных работ, пауз, переносов и решений диспетчера.</p>
        </div>
        <div className="emu-heading-actions">
          {canViewPlan ? (
            <button className="emu-secondary-button" onClick={() => openModal("plan")} type="button">
              Доска задач
            </button>
          ) : null}
          {canCreate ? (
            <button className="emu-primary-button" onClick={() => openModal("create")} type="button">
              <span>↗</span> Отправить в работу
            </button>
          ) : null}
        </div>
      </div>

      <div className="emu-kpi-row">
        {workspace.dashboard.metrics.map((metric) => (
          <article className={`emu-kpi emu-tone-${metric.tone}`} key={metric.label}>
            <span className="emu-kpi-icon">{metric.icon === "pause" ? "Ⅱ" : metric.icon === "check" ? "✓" : metric.icon === "alert" ? "!" : "▷"}</span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span>{metric.delta}</span>
            </div>
          </article>
        ))}
      </div>

      {workspace.error ? <div className="emu-alert">{workspace.error}</div> : null}

      <WorkAttentionSummary activeWork={ongoingWork} />
      <MobileShiftRemarksPanel remarks={visibleShiftRemarks} total={workspace.shiftRemarks.total} />

      <div className="emu-work-layout">
        <section className="emu-panel emu-work-main">
          <div className="emu-panel-header">
            <div className="emu-work-panel-title">
              <h3>Карточки работ</h3>
              <span>Доска показывает незавершенные карточки; завершенные доступны в истории</span>
            </div>
            <div className="emu-panel-actions emu-work-panel-actions">
              {canManageDirectories ? (
                <button className="emu-secondary-button" onClick={() => openModal("catalogs")} type="button">
                  Справочники
                </button>
              ) : null}
              {canManageFavorites ? (
                <button className="emu-secondary-button" onClick={() => openModal("favorites")} type="button">
                  Избранные
                </button>
              ) : null}
            </div>
          </div>

          <div className="emu-work-board-toolbar" aria-label="Фильтры карточек работ">
            <div className="emu-work-board-toolbar-main">
              <span className="emu-work-board-toolbar-label">Фильтры доски</span>
              <SectionQuickFilter sections={activeSections(workspace)} value={sectionFilter} onChange={setSectionFilter} />
            </div>
            <div className="emu-work-board-toolbar-secondary">
              <DensitySwitch value={density} onChange={setDensity} />
              <WorkFilterTabs counts={workFilterCounts} onChange={setWorkFilter} value={workFilter} />
            </div>
          </div>

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
              <div className="emu-empty-state">
                {boardWork.length > 0 ? "Карточек с выбранным состоянием нет." : "Карточек на суточной доске нет. Создайте работу или откройте историю выполненных работ."}
              </div>
            ) : null}
          </div>
        </section>

        <WorkSidePanel
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
        <EditWorkModal employeeOptions={employeeOptions} onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "pause" && selectedWork && canPause ? (
        <PauseWorkModal initialEmployeeId={selectedEmployeeId} onClose={() => { setSelectedEmployeeId(""); setModal(null); }} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "resume" && selectedWork && canPause ? (
        <ResumeWorkModal initialEmployeeId={selectedEmployeeId} onClose={() => { setSelectedEmployeeId(""); setModal(null); }} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "complete" && selectedWork && canComplete ? (
        <CompleteWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "carryOver" && selectedWork && canUpdate ? (
        <CarryOverWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "addEmployee" && selectedWork && canUpdate ? (
        <AddEmployeeToWorkModal employeeOptions={employeeOptions} onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "finishEmployee" && selectedWork && selectedWorkEmployee && canComplete ? (
        <FinishEmployeeParticipationModal employee={selectedWorkEmployee} onClose={() => { setSelectedEmployeeId(""); setModal(null); }} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "mistakenEmployee" && selectedWork && selectedWorkEmployee && canUpdate ? (
        <MarkMistakenEmployeeModal employee={selectedWorkEmployee} onClose={() => { setSelectedEmployeeId(""); setModal(null); }} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "delete" && selectedWork && canDelete ? (
        <DeleteWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "details" && selectedWork ? (
        <WorkDetailsModal now={liveClock} onClose={() => setModal(null)} workspace={workspace} work={selectedWork} />
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
          decision={decisionModal}
          onClose={() => setDecisionModal(null)}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
    </section>
  );
}

function MobileShiftRemarksPanel({ remarks, total }: { remarks: EmuShiftRemarkDto[]; total: number }) {
  return (
    <section className="emu-panel emu-shift-remarks-panel">
      <div className="emu-panel-header">
        <div>
          <h3>Замечания из мобильного приложения</h3>
          <span>Сотрудники фиксируют замечания на телефоне; после синхронизации они появляются здесь.</span>
        </div>
        <span className="emu-decision-badge">Всего: {total}</span>
      </div>
      {remarks.length === 0 ? (
        <div className="emu-empty-state">Замечаний по выбранному участку пока нет.</div>
      ) : (
        <div className="emu-shift-remark-grid">
          {remarks.map((remark) => (
            <article className="emu-shift-remark-card" key={remark.id}>
              <header>
                <div>
                  <strong>{remark.sectionName}</strong>
                  <span>{remark.employeeName}</span>
                </div>
                <span className="emu-status-pill">{remarkStatusText(remark.status)}</span>
              </header>
              <p>{remark.comment}</p>
              <dl>
                <div>
                  <dt>Создано</dt>
                  <dd>{formatRemarkDate(remark.createdAtLocal)}</dd>
                </div>
                <div>
                  <dt>Доставлено</dt>
                  <dd>{formatRemarkDate(remark.createdAtServer)}</dd>
                </div>
                <div>
                  <dt>Источник</dt>
                  <dd>Мобильное приложение</dd>
                </div>
              </dl>
              <div className="emu-shift-remark-attachments">
                {remark.attachments.length === 0 ? (
                  <span>Вложений нет</span>
                ) : (
                  remark.attachments.map((file) => (
                    <a href={file.downloadUrl} key={file.fileId} rel="noreferrer" target="_blank">
                      {isVideoAttachment(file.contentType) ? "Видео" : "Фото"} · {formatFileSize(file.sizeBytes)}
                    </a>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function remarkStatusText(status: string) {
  if (status === "accepted") return "Принято";
  if (status === "pending") return "Ожидает отправки";
  if (status === "rejected") return "Отклонено";
  if (status === "conflict") return "Конфликт";
  return status || "-";
}

function formatRemarkDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isVideoAttachment(contentType: string) {
  return contentType.toLowerCase().startsWith("video/");
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 МБ";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}
