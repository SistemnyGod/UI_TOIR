import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  EmuCompleteWorkSessionDto,
  EmuPauseWorkSessionDto,
  EmuPlanTaskDto,
  EmuReferenceDto,
  EmuResumeWorkSessionDto,
  EmuUpdateWorkSessionDto,
  EmuWorkSessionDto,
  EmuWorkTemplateDto,
  SessionUserDto,
} from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import { hasPermission } from "../../security/permissions";
import type { EmployeeDirectoryItem } from "../../types";
import { calculateLiveWorkSessionMinutes } from "../../domain/emuWorkTime";

type ModalKind =
  | "create"
  | "edit"
  | "pause"
  | "resume"
  | "complete"
  | "delete"
  | "details"
  | "plan"
  | "catalogs"
  | "favorites"
  | null;

type EmuEmployeeOption = Pick<EmployeeDirectoryItem, "department" | "fullName" | "id" | "personnelNo" | "position" | "status">;
type EmployeeWorkState = "Работает" | "На другой работе" | "В ожидании" | "Свободен";
type WorkCardFilter = "all" | "working" | "mixed" | "paused" | "completed" | "attention";
type WorkCardState = "working" | "mixed" | "paused" | "completed" | "attention";

const workBoardRefreshMs = 10_000;
const planBoardRefreshMs = 30_000;
const realtimeJitterMs = 3_000;

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
  const [workFilter, setWorkFilter] = useState<WorkCardFilter>("all");
  const [liveClock, setLiveClock] = useState<Date>(() => new Date());
  const boardWork = useMemo(
    () =>
      workspace.workSessions.rows
        .filter(isVisibleOnDailyBoard)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [workspace.workSessions.rows],
  );
  const ongoingWork = useMemo(() => boardWork.filter((item) => !item.completedAt), [boardWork]);
  const completedBoardWork = useMemo(() => boardWork.filter((item) => item.completedAt), [boardWork]);
  const workFilterCounts = useMemo(() => buildWorkFilterCounts(boardWork), [boardWork]);
  const visibleWork = useMemo(
    () => boardWork.filter((work) => workFilter === "all" || resolveWorkCardState(work) === workFilter),
    [boardWork, workFilter],
  );
  const boardSections = useMemo(() => buildBoardSections(visibleWork), [visibleWork]);
  const selectedWork = selectedWorkId ? workspace.workSessions.rows.find((item) => item.id === selectedWorkId) : undefined;
  const canCreate = hasPermission(currentUser, "emu.work.create");
  const canUpdate = hasPermission(currentUser, "emu.work.update");
  const canPause = hasPermission(currentUser, "emu.work.pause");
  const canComplete = hasPermission(currentUser, "emu.work.complete");
  const canDelete = hasPermission(currentUser, "emu.work.delete");
  const canManageDirectories = hasPermission(currentUser, "emu.directories.manage");
  const canManageFavorites = hasPermission(currentUser, "emu.favorite-employees.manage");
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
        return canUpdate;
      case "pause":
      case "resume":
        return canPause;
      case "complete":
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
      <div className="emu-page-heading">
        <div>
          <h2>Учет работ</h2>
          <p>Фиксация прихода, пауз, возврата и завершения работ Энерго-Механического-Отдела.</p>
        </div>
        <div className="emu-heading-actions">
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

      <div className="emu-work-layout">
        <section className="emu-panel emu-work-main">
          <div className="emu-panel-header">
            <div>
              <h3>Карточки работ</h3>
              <span>
                {ongoingWork.length} незавершенных · {completedBoardWork.length} выполненных сегодня · старые выполненные в истории
              </span>
            </div>
            <div className="emu-panel-actions">
              <WorkFilterTabs counts={workFilterCounts} onChange={setWorkFilter} value={workFilter} />
              {canViewPlan ? (
                <button className="emu-secondary-button" onClick={() => openModal("plan")} type="button">
                  Доска задач
                </button>
              ) : null}
            </div>
          </div>

          <div className="emu-board-stack">
            {boardSections.length > 0 ? (
              boardSections.map((section) => (
                <WorkBoardSection
                  canComplete={canComplete}
                  canDelete={canDelete}
                  canPause={canPause}
                  canUpdate={canUpdate}
                  key={section.state}
                  onComplete={(id) => openModal("complete", id)}
                  onDelete={(id) => openModal("delete", id)}
                  onDetails={(id) => openModal("details", id)}
                  onEdit={(id) => openModal("edit", id)}
                  onPause={(id) => openModal("pause", id)}
                  onResume={(id) => openModal("resume", id)}
                  now={liveClock}
                  section={section}
                />
              ))
            ) : (
              <div className="emu-empty-state">
                {boardWork.length > 0 ? "Карточек с выбранным состоянием нет." : "Карточек на суточной доске нет. Создайте работу или откройте историю выполненных работ."}
              </div>
            )}
          </div>
        </section>

      </div>

      {modal === "create" && canCreate ? (
        <CreateWorkModal employeeOptions={employeeOptions} onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} />
      ) : null}
      {modal === "edit" && selectedWork && canUpdate ? (
        <EditWorkModal employeeOptions={employeeOptions} onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "pause" && selectedWork && canPause ? (
        <PauseWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "resume" && selectedWork && canPause ? (
        <ResumeWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
      ) : null}
      {modal === "complete" && selectedWork && canComplete ? (
        <CompleteWorkModal onClose={() => setModal(null)} onNotify={onNotify} workspace={workspace} work={selectedWork} />
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
    </section>
  );
}

function CatalogSummary({ onOpenCatalogs, workspace }: { onOpenCatalogs: () => void; workspace: EmuWorkspace }) {
  const sections = workspace.settings.sections;
  const waitReasons = workspace.settings.waitReasons;
  const notCompletedReasons = workspace.settings.notCompletedReasons;
  const templates = workspace.settings.workTemplates;
  const summary = [
    { label: "Участки", active: sections.filter((item) => item.isActive).length, total: sections.length },
    { label: "Причины ожидания", active: waitReasons.filter((item) => item.isActive).length, total: waitReasons.length },
    { label: "Причины невыполнения", active: notCompletedReasons.filter((item) => item.isActive).length, total: notCompletedReasons.length },
    { label: "Типовые работы", active: templates.filter((item) => item.isActive).length, total: templates.length },
  ];

  return (
    <section className="emu-catalog-summary">
      <div>
        <strong>Справочники ЭМУ</strong>
        <span>Участки, причины ожидания, причины невыполнения и типовые работы используются в карточках без перезагрузки экрана.</span>
      </div>
      <div className="emu-catalog-summary-items">
        {summary.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.active}</strong>
            <em>активно из {item.total}</em>
          </article>
        ))}
      </div>
      <button className="emu-secondary-button" onClick={onOpenCatalogs} type="button">
        Открыть справочники
      </button>
    </section>
  );
}

function WorkAttentionSummary({ activeWork }: { activeWork: EmuWorkSessionDto[] }) {
  const carriedOver = activeWork.filter((work) => work.isCarriedOver);
  const conflicts = collectWorkingConflicts(activeWork);
  const items = [
    carriedOver.length > 0 ? `${carriedOver.length} забытых работ перенесены на текущие сутки` : "",
    conflicts.length > 0 ? `${conflicts.length} сотрудников одновременно работают в нескольких карточках` : "",
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <section className="emu-attention-strip">
      <strong>Требует внимания</strong>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function WorkFilterTabs({
  counts,
  onChange,
  value,
}: {
  counts: Record<WorkCardFilter, number>;
  onChange: (value: WorkCardFilter) => void;
  value: WorkCardFilter;
}) {
  const filters: WorkCardFilter[] = ["all", "working", "mixed", "paused", "completed", "attention"];

  return (
    <div className="emu-work-filters" role="tablist" aria-label="Фильтр карточек работ">
      {filters.map((filter) => (
        <button
          className={filter === value ? "active" : ""}
          key={filter}
          onClick={() => onChange(filter)}
          type="button"
        >
          {workFilterLabel(filter)} <span>{counts[filter]}</span>
        </button>
      ))}
    </div>
  );
}

function WorkBoardSection({
  canComplete,
  canDelete,
  canPause,
  canUpdate,
  now,
  onComplete,
  onDelete,
  onDetails,
  onEdit,
  onPause,
  onResume,
  section,
}: {
  canComplete: boolean;
  canDelete: boolean;
  canPause: boolean;
  canUpdate: boolean;
  now: Date;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (id: string) => void;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  section: { hint: string; items: EmuWorkSessionDto[]; state: WorkCardState; title: string };
}) {
  return (
    <section className={`emu-board-section status-${section.state}`}>
      <header className="emu-board-section-header">
        <div>
          <strong>{section.title}</strong>
          <span>{section.hint}</span>
        </div>
        <em>{section.items.length}</em>
      </header>
      <div className="emu-card-grid">
        {section.items.map((work) => (
          <WorkCard
            canComplete={canComplete}
            canDelete={canDelete}
            canPause={canPause}
            canUpdate={canUpdate}
            key={work.id}
            onComplete={() => onComplete(work.id)}
            onDelete={() => onDelete(work.id)}
            onDetails={() => onDetails(work.id)}
            onEdit={() => onEdit(work.id)}
            onPause={() => onPause(work.id)}
            onResume={() => onResume(work.id)}
            now={now}
            work={work}
          />
        ))}
      </div>
    </section>
  );
}

function WorkCard({
  canComplete,
  canDelete,
  canPause,
  canUpdate,
  now,
  onComplete,
  onDelete,
  onDetails,
  onEdit,
  onPause,
  onResume,
  work,
}: {
  canComplete: boolean;
  canDelete: boolean;
  canPause: boolean;
  canUpdate: boolean;
  now: Date;
  onComplete: () => void;
  onDelete: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  work: EmuWorkSessionDto;
}) {
  const cardState = resolveWorkCardState(work);
  const liveMinutes = calculateLiveWorkSessionMinutes(work, now);
  const hasPaused = work.employees.some((employee) => !employee.finishedAt && employee.status !== "Работает");
  const hasWorking = hasWorkingEmployees(work);
  const showAttention = cardState === "attention" && !hasWorking;
  const isCompleted = Boolean(work.completedAt);
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null);

  function openQuickMenu(event: { clientX: number; clientY: number; preventDefault?: () => void }) {
    event.preventDefault?.();
    setQuickMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 260) });
  }

  function runQuickAction(action: () => void) {
    setQuickMenu(null);
    action();
  }

  return (
    <>
    <article className={`emu-work-card status-${cardState} ${work.isCarriedOver ? "is-warning" : ""}`} onContextMenu={openQuickMenu}>
      <div className="emu-work-card-top">
        <span className={`emu-status-pill status-${cardState}`}>{workStateLabel(cardState)}</span>
        <small>{formatTime(work.arrivedAt)}</small>
      </div>
      <h4>{work.sectionName || "Прочее"}</h4>
      <p>{work.taskDescription || "Задача не указана"}</p>
      <div className="emu-work-meta">
        <span>{work.workNumber}</span>
        <span>👤 сотрудников: {work.employees.length}</span>
        <span>◷ работа {formatMinutes(liveMinutes.workMinutes)} · ожидание {formatMinutes(liveMinutes.waitingMinutes + liveMinutes.otherWorkMinutes)}</span>
      </div>
      <div className="emu-employee-chips">
        {work.employees.map((employee) => (
          <span className={`emu-employee-status ${statusClass(employee.status as EmployeeWorkState)}`} key={employee.employeeId}>
            {formatEmployeeShortName(employee.fullNameSnapshot)}: {employee.status}
          </span>
        ))}
      </div>
      {showAttention ? <div className="emu-card-warning compact">В карточке нет активных сотрудников. Продолжите работу, завершите или удалите карточку.</div> : null}
      <div className="emu-card-actions">
        <button className="emu-command-button" onClick={openQuickMenu} type="button">Команды</button>
      </div>
    </article>
    {quickMenu
      ? createPortal(
          <div className="emu-quick-menu-layer" onClick={() => setQuickMenu(null)} role="presentation">
            <div className="emu-quick-menu" onClick={(event) => event.stopPropagation()} style={{ left: quickMenu.x, top: quickMenu.y }}>
              <strong>Быстрые команды</strong>
              <button onClick={() => runQuickAction(onDetails)} type="button">Просмотр</button>
              {canUpdate ? <button onClick={() => runQuickAction(onEdit)} type="button">Изменить</button> : null}
              {!isCompleted && hasPaused && canPause ? <button onClick={() => runQuickAction(onResume)} type="button">Продолжить</button> : null}
              {!isCompleted && hasWorking && canPause ? <button onClick={() => runQuickAction(onPause)} type="button">Пауза</button> : null}
              {!isCompleted && canComplete ? <button onClick={() => runQuickAction(onComplete)} type="button">Завершить</button> : null}
              {canDelete ? <button className="danger" onClick={() => runQuickAction(onDelete)} type="button">Удалить</button> : null}
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}

function CreateWorkModal({
  employeeOptions,
  onClose,
  onNotify,
  workspace,
}: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const today = new Date();
  const [workDate, setWorkDate] = useState(toDateInput(today));
  const [time, setTime] = useState(toTimeInput(today));
  const [sectionId, setSectionId] = useState(activeSections(workspace)[0]?.id ?? "");
  const [taskDescription, setTaskDescription] = useState("");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const favoriteEmployeeOptions = useMemo(() => {
    const sourceById = new Map(employeeOptions.map((employee) => [employee.id, employee]));
    return workspace.settings.favoriteEmployees
      .filter((employee) => employee.isActive)
      .map((employee) => {
        const source = sourceById.get(employee.employeeId);
        return {
          department: employee.department,
          fullName: employee.fullName,
          id: employee.employeeId,
          personnelNo: employee.personnelNo,
          position: employee.position,
          status: source?.status ?? (employee.status as EmployeeDirectoryItem["status"]),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [employeeOptions, workspace.settings.favoriteEmployees]);
  const filteredEmployees = filterEmployees(favoriteEmployeeOptions, search);
  const conflicts = selectedConflicts(employeeIds, workspace.workSessions.rows);
  const hasConflict = conflicts.length > 0;

  function setNow() {
    const now = new Date();
    setWorkDate(toDateInput(now));
    setTime(toTimeInput(now));
  }

  function clearForm() {
    setEmployeeIds([]);
    setSearch("");
    setTaskDescription("");
    setNow();
  }

  async function submit() {
    try {
      await workspace.actions.createWorkSession({
        arrivedAt: toLocalIso(workDate, time),
        employeeIds,
        sectionId,
        taskDescription,
        workDate,
      });
      onNotify("Работа отправлена в работу");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось создать работу");
    }
  }

  return (
    <ModalFrame
      wide
      onClose={onClose}
      subtitle="Заполните участок, время прихода, выберите сотрудников и опишите задачу."
      title="Отправить в работу / Новая работа"
    >
      <div className="emu-form-grid">
        <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{activeSections(workspace).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={setNow} type="button">Сейчас</button></span></label>
      </div>
      <div className="emu-form-grid emu-form-grid-one">
        <label>Поиск в избранных<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Фамилия, должность" /></label>
      </div>
      {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
      <EmployeePicker
        currentWorkId=""
        employees={filteredEmployees}
        totalCount={favoriteEmployeeOptions.length}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={setEmployeeIds}
      />
      <label className="emu-textarea-label">Задача / ожидаемый результат<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Опишите задачу, объем работ и ожидаемый результат..." /></label>
      <div className="emu-modal-actions emu-create-actions">
        <button className="emu-action-clear" onClick={clearForm} type="button"><span>↺</span> Очистить</button>
        <button className="emu-action-cancel" onClick={onClose} type="button"><span>×</span> Отмена</button>
        <button className="emu-primary-button emu-action-submit" disabled={!sectionId || employeeIds.length === 0 || !taskDescription.trim() || hasConflict} onClick={() => void submit()} type="button"><span>↗</span> Отправить в работу</button>
      </div>
    </ModalFrame>
  );
}

function EditWorkModal({
  employeeOptions,
  onClose,
  onNotify,
  workspace,
  work,
}: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
  work: EmuWorkSessionDto;
}) {
  const arrived = new Date(work.arrivedAt);
  const [workDate, setWorkDate] = useState(work.workDate);
  const [time, setTime] = useState(toTimeInput(arrived));
  const [sectionId, setSectionId] = useState(work.sectionId);
  const [taskDescription, setTaskDescription] = useState(work.taskDescription);
  const [employeeIds, setEmployeeIds] = useState(work.employees.map((employee) => employee.employeeId));
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const filteredEmployees = filterEmployees(employeeOptions, search);
  const conflicts = selectedConflicts(employeeIds, workspace.workSessions.rows, work.id);
  const hasConflict = conflicts.length > 0;
  const needsCorrectionComment = (workDate !== work.workDate || time !== toTimeInput(arrived)) && !comment.trim();

  async function submit() {
    const payload: EmuUpdateWorkSessionDto = {
      arrivedAt: toLocalIso(workDate, time),
      comment,
      employeeIds,
      rowVersion: work.rowVersion,
      sectionId,
      taskDescription,
      workDate,
    };

    try {
      await workspace.actions.updateWorkSession(work.id, payload);
      onNotify("Карточка изменена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось изменить карточку");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Изменить карточку работы">
      <WorkSummary work={work} />
      <div className="emu-form-grid">
        <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{activeSections(workspace).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      </div>
      <label>Поиск сотрудника<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ФИО, должность, участок" /></label>
      {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
      <EmployeePicker
        currentWorkId={work.id}
        employees={filteredEmployees}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={setEmployeeIds}
      />
      <label className="emu-textarea-label">Задача<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></label>
      <label className="emu-textarea-label">Комментарий к изменению<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: скорректировано время прихода оператором" /></label>
      {needsCorrectionComment ? <div className="emu-card-warning">Для ручной корректировки даты или времени нужен комментарий.</div> : null}
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!sectionId || employeeIds.length === 0 || !taskDescription.trim() || hasConflict || needsCorrectionComment} onClick={() => void submit()} type="button">Сохранить</button>
      </div>
    </ModalFrame>
  );
}

function EmployeePicker({
  currentWorkId,
  employees,
  selectedIds,
  sessions,
  setSelectedIds,
  totalCount,
}: {
  currentWorkId: string;
  employees: EmuEmployeeOption[];
  selectedIds: string[];
  sessions: EmuWorkSessionDto[];
  setSelectedIds: (updater: (value: string[]) => string[]) => void;
  totalCount?: number;
}) {
  const selectedEmployees = employees.filter((employee) => selectedIds.includes(employee.id));
  const visibleEmployees = employees.slice(0, 36);
  const hiddenCount = Math.max(0, employees.length - visibleEmployees.length);
  const sourceCount = totalCount ?? employees.length;

  return (
    <div className="emu-picker-shell">
      <div className="emu-picker-toolbar">
        <div>
          <strong>Сотрудники</strong>
          <span>Выбрано {selectedIds.length} · показано {visibleEmployees.length} из {sourceCount}</span>
        </div>
        {selectedIds.length > 0 ? <button onClick={() => setSelectedIds(() => [])} type="button">Снять выбор</button> : null}
      </div>
      {selectedEmployees.length > 0 ? (
        <div className="emu-selected-strip">
          {selectedEmployees.map((employee) => (
            <span key={employee.id} title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
          ))}
        </div>
      ) : null}
      <div className="emu-picker">
        {visibleEmployees.map((employee) => {
        const state = getEmployeeWorkState(employee.id, sessions, currentWorkId);
        return (
          <button
            className={selectedIds.includes(employee.id) ? "selected" : ""}
            key={employee.id}
            onClick={() => setSelectedIds((value) => toggle(value, employee.id))}
            type="button"
          >
            <strong title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</strong>
            <small>{employee.position || employee.department}</small>
            {shouldShowEmployeeState(state) ? <em className={`emu-employee-status ${statusClass(state)}`}>{employeeStatusLabel(state)}</em> : null}
          </button>
        );
        })}
      </div>
      {hiddenCount > 0 ? <p className="emu-picker-hint">Уточните поиск, чтобы увидеть еще {hiddenCount} сотрудников.</p> : null}
    </div>
  );
}

function PauseWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const workingEmployees = work.employees.filter((employee) => !employee.finishedAt && employee.status === "Работает");
  const [employeeIds, setEmployeeIds] = useState(workingEmployees.map((employee) => employee.employeeId));
  const [waitReasonId, setWaitReasonId] = useState(workspace.settings.waitReasons[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [markAsOtherWork, setMarkAsOtherWork] = useState(false);

  async function submit() {
    const payload: EmuPauseWorkSessionDto = { comment, employeeIds, markAsOtherWork, rowVersion: work.rowVersion, waitReasonId };
    try {
      await workspace.actions.pauseWorkSession(work.id, payload);
      onNotify(markAsOtherWork ? "Сотрудники отмечены на другой работе" : "Работа поставлена на паузу");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось поставить на паузу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Поставить на паузу">
      <WorkSummary work={work} />
      <div className="emu-check-list">
        {workingEmployees.map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot}
          </label>
        ))}
      </div>
      {workingEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет сотрудников со статусом «Работает». Продолжите сотрудника или завершите карточку.</div> : null}
      <label>Причина ожидания<select value={waitReasonId} onChange={(event) => setWaitReasonId(event.target.value)}>{workspace.settings.waitReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
      <label className="emu-checkbox"><input checked={markAsOtherWork} onChange={(event) => setMarkAsOtherWork(event.target.checked)} type="checkbox" /> На другой работе</label>
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: нет кабеля, ожидаем склад" /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0 || !waitReasonId} onClick={() => void submit()} type="button">Пауза</button>
      </div>
    </ModalFrame>
  );
}

function ResumeWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const pausedEmployees = work.employees.filter((employee) => !employee.finishedAt && employee.status !== "Работает");
  const [employeeIds, setEmployeeIds] = useState(pausedEmployees.map((employee) => employee.employeeId));
  const [comment, setComment] = useState("");
  const [time, setTime] = useState(toTimeInput(new Date()));

  async function submit() {
    const payload: EmuResumeWorkSessionDto = {
      comment,
      employeeIds,
      resumedAt: toLocalIso(toDateInput(new Date()), time),
      rowVersion: work.rowVersion,
    };
    try {
      await workspace.actions.resumeWorkSession(work.id, payload);
      onNotify("Работа продолжена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось продолжить работу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Продолжить работу">
      <WorkSummary work={work} />
      <label>Время возврата<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      <div className="emu-check-list">
        {pausedEmployees.map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot} · {employee.status}
          </label>
        ))}
      </div>
      {pausedEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет сотрудников на паузе или на другой работе.</div> : null}
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Причина ожидания устранена" /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0} onClick={() => void submit()} type="button">Продолжить</button>
      </div>
    </ModalFrame>
  );
}

function CompleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [employeeIds, setEmployeeIds] = useState(work.employees.filter((employee) => !employee.finishedAt).map((employee) => employee.employeeId));
  const [resultStatus, setResultStatus] = useState("Выполнено");
  const [resultComment, setResultComment] = useState("");
  const [notCompletedReasonId, setNotCompletedReasonId] = useState<string>("");
  const [completedDate, setCompletedDate] = useState(toDateInput(new Date()));
  const [completedTime, setCompletedTime] = useState(toTimeInput(new Date()));
  const completedAtValue = toLocalIso(completedDate, completedTime);
  const selectedEmployees = work.employees.filter((employee) => employeeIds.includes(employee.employeeId) && !employee.finishedAt);
  const earliestArrival = selectedEmployees.length
    ? Math.min(...selectedEmployees.map((employee) => new Date(employee.arrivedAt).getTime()))
    : new Date(work.arrivedAt).getTime();
  const completionBeforeArrival = new Date(completedAtValue).getTime() < earliestArrival;

  function setCompletedNow() {
    const now = new Date();
    setCompletedDate(toDateInput(now));
    setCompletedTime(toTimeInput(now));
  }

  async function submit() {
    const payload: EmuCompleteWorkSessionDto = {
      completedAt: completedAtValue,
      employeeIds,
      notCompletedReasonId: resultStatus === "Не выполнено" ? notCompletedReasonId : null,
      resultComment,
      resultStatus,
      rowVersion: work.rowVersion,
    };
    try {
      await workspace.actions.completeWorkSession(work.id, payload);
      onNotify("Работа завершена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось завершить работу");
    }
  }

  const reasonRequired = resultStatus === "Не выполнено";

  return (
    <ModalFrame onClose={onClose} title="Завершить работу">
      <WorkSummary work={work} />
      <div className="emu-check-list">
        {work.employees.filter((employee) => !employee.finishedAt).map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot}
          </label>
        ))}
      </div>
      {work.employees.every((employee) => employee.finishedAt) ? <div className="emu-card-warning">В карточке нет незавершенных сотрудников.</div> : null}
      <div className="emu-form-grid">
        <label>Итоговый статус<select value={resultStatus} onChange={(event) => setResultStatus(event.target.value)}><option>Выполнено</option><option>Частично выполнено</option><option>Не выполнено</option></select></label>
        <label>Причина невыполнения<select disabled={!reasonRequired} value={notCompletedReasonId} onChange={(event) => setNotCompletedReasonId(event.target.value)}><option value="">Не требуется</option>{workspace.settings.notCompletedReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
        <label>Время окончания<span className="emu-input-action"><input type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /><input type="time" value={completedTime} onChange={(event) => setCompletedTime(event.target.value)} /><button onClick={setCompletedNow} type="button">Сейчас</button></span></label>
      </div>
      <label className="emu-textarea-label">Результат работы<textarea value={resultComment} onChange={(event) => setResultComment(event.target.value)} placeholder="Опишите выполненные действия и важные детали" /></label>
      {completionBeforeArrival ? <div className="emu-card-warning">Время окончания не может быть раньше времени прихода выбранных сотрудников.</div> : null}
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0 || !resultComment.trim() || (reasonRequired && !notCompletedReasonId) || completionBeforeArrival} onClick={() => void submit()} type="button">Завершить работу</button>
      </div>
    </ModalFrame>
  );
}

function DeleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [reason, setReason] = useState("");
  async function submit() {
    try {
      await workspace.actions.deleteWorkSession(work.id, { reason, rowVersion: work.rowVersion });
      onNotify("Работа удалена и сохранена в истории");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить работу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Удалить работу">
      <WorkSummary work={work} />
      <label className="emu-textarea-label">Причина удаления<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-danger-button" disabled={!reason.trim()} onClick={() => void submit()} type="button">Удалить</button>
      </div>
    </ModalFrame>
  );
}

function WorkDetailsModal({ now, onClose, workspace, work }: { now: Date; onClose: () => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const events = workspace.auditEvents.filter((event) => event.workSessionId === work.id);
  const liveMinutes = calculateLiveWorkSessionMinutes(work, now);
  return (
    <ModalFrame onClose={onClose} title="Карточка работы">
      <WorkSummary work={work} />
      <dl className="emu-kv">
        <div><dt>Дата</dt><dd>{work.workDate}</dd></div>
        <div><dt>Время прихода</dt><dd>{formatTime(work.arrivedAt)}</dd></div>
        <div><dt>Статус</dt><dd>{work.status}</dd></div>
        <div><dt>Результат</dt><dd>{work.resultStatus || "Не заполнен"}</dd></div>
      </dl>
      {work.resultComment ? <p className="emu-result-text">{work.resultComment}</p> : null}
      <div className="emu-detail-grid">
        {work.employees.map((employee) => {
          const employeeMinutes = liveMinutes.employeesById.get(employee.employeeId) ?? employee;
          return (
            <div key={employee.id}>
              <strong>{employee.fullNameSnapshot}</strong>
              <span>{employee.status}</span>
              <small>работа {formatMinutes(employeeMinutes.workMinutes)} · ожидание {formatMinutes(employeeMinutes.waitingMinutes + employeeMinutes.otherWorkMinutes)}</small>
            </div>
          );
        })}
      </div>
      <h4 className="emu-subtitle">История изменений</h4>
      <div className="emu-timeline">
        {events.length ? (
          events.map((event) => (
            <div key={event.id}>
              <strong>{event.eventType}</strong>
              <span>{formatDateTime(event.createdAt)} · {event.actor}</span>
              <p>{event.comment || `${event.fromStatus} → ${event.toStatus}`}</p>
            </div>
          ))
        ) : (
          <p>История изменений появится после действий с карточкой.</p>
        )}
      </div>
    </ModalFrame>
  );
}

function CatalogsModal({ onClose, onNotify, workspace }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace }) {
  return (
    <ModalFrame wide onClose={onClose} title="Справочники ЭМУ">
      <div className="emu-reference-grid">
        <ReferenceBlock
          items={workspace.settings.sections}
          onCreate={(name) => workspace.actions.createSection({ name })}
          onNotify={onNotify}
          onUpdate={(item, patch) =>
            workspace.actions.updateSection(item.id, {
              isActive: patch.isActive ?? item.isActive,
              name: patch.name ?? item.name,
              sortOrder: item.sortOrder,
            })
          }
          protectSystemOther
          title="Участки"
        />
        <ReferenceBlock
          items={workspace.settings.waitReasons}
          onCreate={(name) => workspace.actions.createWaitReason({ name })}
          onNotify={onNotify}
          onUpdate={(item, patch) =>
            workspace.actions.updateWaitReason(item.id, {
              isActive: patch.isActive ?? item.isActive,
              name: patch.name ?? item.name,
              sortOrder: item.sortOrder,
            })
          }
          title="Причины ожидания"
        />
        <ReferenceBlock
          items={workspace.settings.notCompletedReasons}
          onCreate={(name) => workspace.actions.createNotCompletedReason({ name })}
          onNotify={onNotify}
          onUpdate={(item, patch) =>
            workspace.actions.updateNotCompletedReason(item.id, {
              isActive: patch.isActive ?? item.isActive,
              name: patch.name ?? item.name,
              sortOrder: item.sortOrder,
            })
          }
          title="Причины невыполнения"
        />
        <TemplateBlock onNotify={onNotify} workspace={workspace} />
      </div>
    </ModalFrame>
  );
}

function ReferenceBlock({
  items,
  onCreate,
  onNotify,
  onUpdate,
  protectSystemOther = false,
  title,
}: {
  items: EmuReferenceDto[];
  onCreate: (name: string) => Promise<EmuReferenceDto>;
  onNotify: (message: string) => void;
  onUpdate: (item: EmuReferenceDto, patch: { isActive?: boolean; name?: string }) => Promise<EmuReferenceDto>;
  protectSystemOther?: boolean;
  title: string;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const activeCount = items.filter((item) => item.isActive).length;
  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function create() {
    try {
      await onCreate(name);
      setName("");
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  async function toggleActive(item: EmuReferenceDto) {
    if (protectSystemOther && isSystemOtherSection(item) && item.isActive) {
      onNotify("Системный участок «Прочее» должен оставаться активным");
      return;
    }

    try {
      await onUpdate(item, { isActive: !item.isActive });
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  function startEdit(item: EmuReferenceDto) {
    setEditingId(item.id);
    setEditingName(item.name);
  }

  async function saveEdit(item: EmuReferenceDto) {
    if (!editingName.trim()) {
      onNotify("Укажите название справочника");
      return;
    }

    try {
      await onUpdate(item, { name: editingName.trim() });
      setEditingId("");
      setEditingName("");
      onNotify("Справочник обновлен");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить справочник");
    }
  }

  return (
    <section className="emu-reference-block">
      <div className="emu-reference-heading">
        <div>
          <h4>{title}</h4>
          <span>{activeCount} активно · {items.length - activeCount} скрыто</span>
        </div>
        <em>{items.length}</em>
      </div>
      <div className="emu-inline-form">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новое значение" />
        <button disabled={!name.trim()} onClick={() => void create()} type="button">Добавить</button>
      </div>
      <input className="emu-reference-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по справочнику" />
      <div className="emu-reference-list">
        {filteredItems.map((item) => (
          <div className="emu-reference-row" key={item.id}>
            {editingId === item.id ? (
              <input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label={`Название ${title}`} />
            ) : (
              <span>{item.name}</span>
            )}
            <em>{protectSystemOther && isSystemOtherSection(item) ? "системный" : item.isActive ? "активно" : "скрыто"}</em>
            <div className="emu-reference-actions">
              {editingId === item.id ? (
                <>
                  <button onClick={() => void saveEdit(item)} type="button">Сохранить</button>
                  <button onClick={() => { setEditingId(""); setEditingName(""); }} type="button">Отмена</button>
                </>
              ) : (
                <>
                  <button onClick={() => startEdit(item)} type="button">Изменить</button>
                  <button disabled={protectSystemOther && isSystemOtherSection(item) && item.isActive} onClick={() => void toggleActive(item)} type="button">{item.isActive ? "Скрыть" : "Вернуть"}</button>
                </>
              )}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? <div className="emu-empty-state">По запросу ничего не найдено</div> : null}
      </div>
    </section>
  );
}

function TemplateBlock({ onNotify, workspace }: { onNotify: (message: string) => void; workspace: EmuWorkspace }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const activeCount = workspace.settings.workTemplates.filter((template) => template.isActive).length;
  const filteredTemplates = workspace.settings.workTemplates.filter((template) =>
    [template.name, template.description, template.sectionName].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())),
  );

  async function create() {
    try {
      await workspace.actions.createWorkTemplate({ description, name, sectionId: sectionId || null });
      setName("");
      setDescription("");
      setSectionId("");
      onNotify("Типовая работа добавлена");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось добавить типовую работу");
    }
  }

  async function toggleTemplate(template: EmuWorkTemplateDto) {
    try {
      await workspace.actions.updateWorkTemplate(template.id, {
        description: template.description,
        isActive: !template.isActive,
        name: template.name,
        sectionId: template.sectionId,
        sortOrder: template.sortOrder,
      });
      onNotify("Типовая работа обновлена");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить типовую работу");
    }
  }

  return (
    <section className="emu-reference-block emu-template-block">
      <div className="emu-reference-heading">
        <div>
          <h4>Типовые работы</h4>
          <span>{activeCount} активно · {workspace.settings.workTemplates.length - activeCount} скрыто</span>
        </div>
        <em>{workspace.settings.workTemplates.length}</em>
      </div>
      <div className="emu-inline-form">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Название" />
        <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">Любой участок</option>
          {workspace.settings.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select>
      </div>
      <label className="emu-textarea-label"><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Описание типовой работы" /></label>
      <button className="emu-primary-button" disabled={!name.trim()} onClick={() => void create()} type="button">Добавить типовую работу</button>
      <input className="emu-reference-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск типовой работы" />
      <div className="emu-reference-list">
        {filteredTemplates.map((template) => (
          <div className="emu-reference-row" key={template.id}>
            <span>{template.name}</span>
            <em>{template.isActive ? "активно" : "скрыто"}</em>
            <button onClick={() => void toggleTemplate(template)} type="button">{template.isActive ? "Скрыть" : "Вернуть"}</button>
          </div>
        ))}
        {filteredTemplates.length === 0 ? <div className="emu-empty-state">Типовые работы не найдены</div> : null}
      </div>
    </section>
  );
}

function FavoritesModal({
  employeeOptions,
  onClose,
  onNotify,
  workspace,
}: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [employeeToRemove, setEmployeeToRemove] = useState<EmuEmployeeOption | null>(null);
  const activeFavoriteIds = new Set(workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => employee.employeeId));
  const candidates = filterEmployees(employeeOptions, search).filter((employee) => !activeFavoriteIds.has(employee.id));
  const totalPages = Math.max(1, Math.ceil(candidates.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleCandidates = candidates.slice(pageStart, pageStart + pageSize);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updatePageSize(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  async function add(employeeId: string) {
    try {
      await workspace.actions.addFavoriteEmployee({ employeeId });
      onNotify("Сотрудник добавлен в избранное ЭМУ");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось добавить сотрудника");
    }
  }

  async function remove(employeeId: string) {
    try {
      await workspace.actions.removeFavoriteEmployee(employeeId);
      onNotify("Сотрудник скрыт из избранного ЭМУ");
      setEmployeeToRemove(null);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить из избранного");
    }
  }

  return (
    <ModalFrame wide onClose={onClose} title="Избранные сотрудники ЭМУ">
      <div className="emu-favorite-grid">
        <section className="emu-reference-block">
          <h4>Избранные</h4>
          <div className="emu-reference-list">
            {workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => (
              <div className="emu-reference-row" key={employee.employeeId}>
                <span title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
                <em>{employee.position || employee.department}</em>
                <button onClick={() => setEmployeeToRemove({ department: employee.department, fullName: employee.fullName, id: employee.employeeId, personnelNo: employee.personnelNo, position: employee.position, status: employee.status as EmployeeDirectoryItem["status"] })} type="button">Убрать</button>
              </div>
            ))}
          </div>
          {employeeToRemove ? (
            <div className="emu-nested-confirm">
              <strong>Убрать {employeeToRemove.fullName} из избранных ЭМУ?</strong>
              <p>Сотрудник будет скрыт только из быстрого списка. История работ и общий справочник сотрудников не изменятся.</p>
              <div className="emu-modal-actions">
                <button onClick={() => setEmployeeToRemove(null)} type="button">Отмена</button>
                <button className="emu-danger-button" onClick={() => void remove(employeeToRemove.id)} type="button">Убрать из избранных</button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="emu-reference-block">
          <div className="emu-reference-heading">
            <div>
              <h4>Общий справочник сотрудников</h4>
              <span>Найдено {candidates.length} · страница {currentPage} из {totalPages}</span>
            </div>
          </div>
          <div className="emu-reference-toolbar">
            <input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Поиск по ФИО, должности, подразделению" />
            <label>
              Показать
              <select value={pageSize} onChange={(event) => updatePageSize(event.target.value)}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="emu-reference-list">
            {visibleCandidates.map((employee) => (
              <div className="emu-reference-row" key={employee.id}>
                <span title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
                <em>{employee.position || employee.department}</em>
                <button onClick={() => void add(employee.id)} type="button">Добавить</button>
              </div>
            ))}
          </div>
          <div className="emu-pagination">
            <span>
              {candidates.length ? `${pageStart + 1}-${Math.min(pageStart + pageSize, candidates.length)} из ${candidates.length}` : "Нет сотрудников"}
            </span>
            <div>
              <button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Назад</button>
              <strong>{currentPage}</strong>
              <button disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Вперед</button>
            </div>
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}

function PlanBoardModal({
  canApprovePlan,
  canCreateWork,
  canManagePlan,
  employeeOptions,
  onClose,
  onNotify,
  workspace,
}: {
  canApprovePlan: boolean;
  canCreateWork: boolean;
  canManagePlan: boolean;
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const today = toDateInput(new Date());
  const defaultPlanSectionId = getSystemOtherSection(workspace)?.id ?? activeSections(workspace)[0]?.id ?? "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedDate, setPlannedDate] = useState(today);
  const [sectionId, setSectionId] = useState(defaultPlanSectionId);
  const [priority, setPriority] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState("weekly");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [rejectTask, setRejectTask] = useState<EmuPlanTaskDto | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [confirmWeekApproval, setConfirmWeekApproval] = useState(false);

  const weekStart = mondayOf(plannedDate);
  const weekApprovalCount = workspace.planTasks.filter((task) => {
    const taskDate = new Date(`${task.plannedDate}T00:00:00`);
    const start = new Date(`${weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return taskDate >= start && taskDate < end && task.approvalStatus !== "Согласовано";
  }).length;

  const editingTask = workspace.planTasks.find((task) => task.id === editingTaskId);

  function resetTaskForm() {
    setTitle("");
    setDescription("");
    setPlannedDate(today);
    setSectionId(defaultPlanSectionId);
    setPriority("");
    setIsRecurring(false);
    setRecurrenceRule("weekly");
    setEmployeeIds([]);
    setEditingTaskId("");
  }

  function editTask(task: EmuPlanTaskDto) {
    if (!canManagePlan) {
      onNotify("Недостаточно прав для изменения плана ЭМУ");
      return;
    }

    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setPlannedDate(task.plannedDate);
    setSectionId(task.sectionId ?? defaultPlanSectionId);
    setPriority(task.priority || "");
    setIsRecurring(task.isRecurring);
    setRecurrenceRule(task.recurrenceRule || "weekly");
    setEmployeeIds(task.employeeIds);
  }

  async function createTask() {
    if (!canManagePlan) {
      onNotify("Недостаточно прав для изменения плана ЭМУ");
      return;
    }

    const payload = {
      description,
      employeeIds,
      isRecurring,
      plannedDate,
      priority: priority || "Обычный",
      recurrenceRule: isRecurring ? recurrenceRule : "",
      sectionId: sectionId || defaultPlanSectionId || null,
      title,
      rowVersion: editingTask?.rowVersion,
    };

    try {
      if (editingTask) {
        await workspace.actions.updatePlanTask(editingTask.id, payload);
        onNotify("Задача плана обновлена");
      } else {
        await workspace.actions.createPlanTask(payload);
        onNotify("Задача добавлена в недельный план");
      }

      resetTaskForm();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось сохранить задачу");
    }
  }

  async function approveWeek() {
    if (!canApprovePlan) {
      onNotify("Недостаточно прав для согласования плана ЭМУ");
      return;
    }

    if (weekApprovalCount === 0) {
      onNotify("В выбранной неделе нет задач для согласования");
      return;
    }

    setConfirmWeekApproval(true);
  }

  async function confirmApproveWeek() {
    if (!canApprovePlan) {
      onNotify("Недостаточно прав для согласования плана ЭМУ");
      return;
    }

    try {
      await workspace.actions.approveWeek(weekStart, `Массовое согласование недели: ${weekApprovalCount} задач`);
      onNotify("Неделя согласована");
      setConfirmWeekApproval(false);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось согласовать неделю");
    }
  }

  async function approveTask(task: EmuPlanTaskDto) {
    if (!canApprovePlan) {
      onNotify("Недостаточно прав для согласования плана ЭМУ");
      return;
    }

    try {
      await workspace.actions.approvePlanTask(task.id, true, "Согласовано");
      onNotify("Задача согласована");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось согласовать задачу");
    }
  }

  async function rejectSelectedTask() {
    if (!rejectTask) return;
    if (!canApprovePlan) {
      onNotify("Недостаточно прав для согласования плана ЭМУ");
      return;
    }

    try {
      await workspace.actions.approvePlanTask(rejectTask.id, false, rejectComment);
      onNotify("Задача отклонена");
      setRejectTask(null);
      setRejectComment("");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось отклонить задачу");
    }
  }

  async function sendPlanTaskToWork(task: EmuPlanTaskDto) {
    if (!canCreateWork) {
      onNotify("Недостаточно прав для отправки задачи в работу");
      return;
    }

    if (task.approvalStatus !== "Согласовано") {
      onNotify("Плановая задача должна быть согласована перед отправкой в работу");
      return;
    }

    const section = task.sectionId || defaultPlanSectionId || activeSections(workspace)[0]?.id;
    if (!section) {
      onNotify("Добавьте участок перед отправкой задачи в работу");
      return;
    }

    try {
      await workspace.actions.createWorkSession({
        arrivedAt: new Date().toISOString(),
        employeeIds: task.employeeIds,
        planTaskId: task.id,
        sectionId: section,
        taskDescription: task.description || task.title,
        workDate: toDateInput(new Date()),
      });
      onNotify("Плановая задача отправлена в работу");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось отправить задачу в работу");
    }
  }

  const columns = [
    { key: "draft", title: "Черновик / отклонено", tasks: workspace.planTasks.filter((task) => task.approvalStatus !== "Согласовано") },
    { key: "approved", title: "Согласовано", tasks: workspace.planTasks.filter((task) => task.approvalStatus === "Согласовано" && task.status === "Запланировано") },
    { key: "active", title: "В работе", tasks: workspace.planTasks.filter((task) => task.status === "В работе") },
    { key: "done", title: "Выполнено", tasks: workspace.planTasks.filter((task) => task.status === "Выполнено") },
  ];

  return (
    <ModalFrame wide onClose={onClose} title="Доска задач / план на неделю">
      {canManagePlan ? (
        <>
          <div className="emu-plan-create">
            <input placeholder="Новая плановая задача" value={title} onChange={(event) => setTitle(event.target.value)} />
            <input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              {activeSections(workspace).length === 0 ? <option value="">Нет активного участка</option> : null}
              {activeSections(workspace).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">Без приоритета</option>
              <option>Низкий</option>
              <option>Обычный</option>
              <option>Высокий</option>
              <option>Срочно</option>
            </select>
            <button className="emu-primary-button" disabled={!title.trim() || employeeIds.length === 0} onClick={() => void createTask()} type="button">{editingTask ? "Сохранить" : "Добавить"}</button>
          </div>
          <label className="emu-textarea-label">Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что нужно сделать, критерий выполнения" /></label>
          <div className="emu-plan-options">
            <label className="emu-checkbox"><input checked={isRecurring} onChange={(event) => setIsRecurring(event.target.checked)} type="checkbox" /> Повторять</label>
            <select disabled={!isRecurring} value={recurrenceRule} onChange={(event) => setRecurrenceRule(event.target.value)}>
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="weekdays">По будням</option>
            </select>
            {editingTask ? <button className="emu-secondary-button" onClick={resetTaskForm} type="button">Отменить изменение</button> : null}
            {canApprovePlan ? <button className="emu-secondary-button" onClick={() => void approveWeek()} type="button">Согласовать неделю ({weekApprovalCount})</button> : null}
          </div>
          <div className="emu-check-list compact">
            {employeeOptions.slice(0, 12).map((employee) => (
              <label key={employee.id}>
                <input checked={employeeIds.includes(employee.id)} onChange={() => setEmployeeIds((value) => toggle(value, employee.id))} type="checkbox" />
                {employee.fullName}
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="emu-empty-state">Доска доступна только для просмотра. Для изменения задач требуется право emu.plan.manage.</div>
      )}
      {!canManagePlan && canApprovePlan ? (
        <div className="emu-plan-options">
          <button className="emu-secondary-button" onClick={() => void approveWeek()} type="button">Согласовать неделю ({weekApprovalCount})</button>
        </div>
      ) : null}
      <div className="emu-kanban">
        {columns.map((column) => (
          <section key={column.key}>
            <h4>{column.title}</h4>
            {column.tasks.map((task) => (
              <article className={`emu-plan-card priority-${task.priority.toLowerCase() || "none"}`} key={task.id}>
                <strong>{task.title}</strong>
                <span>{task.plannedDate} · {task.sectionName || "Прочее"}</span>
                <small>{task.priority || "Без приоритета"}{task.isRecurring ? " · повторяется" : ""} · сотрудников: {task.employeeIds.length}</small>
                <div className="emu-plan-card-actions">
                  {canManagePlan ? <button onClick={() => editTask(task)} type="button">Изменить</button> : null}
                  {task.approvalStatus !== "Согласовано" && canApprovePlan ? <button onClick={() => void approveTask(task)} type="button">Согласовать</button> : null}
                  {task.approvalStatus !== "Согласовано" && canApprovePlan ? <button className="emu-danger-action" onClick={() => setRejectTask(task)} type="button">Отклонить</button> : null}
                  {canCreateWork ? (
                    <button
                      disabled={task.status !== "Запланировано" || task.approvalStatus !== "Согласовано"}
                      onClick={() => void sendPlanTaskToWork(task)}
                      title={task.approvalStatus !== "Согласовано" ? "Сначала согласуйте задачу" : undefined}
                      type="button"
                    >
                      Отправить в работу
                    </button>
                  ) : null}
                </div>
                {task.status === "Запланировано" && task.approvalStatus !== "Согласовано" ? <p className="emu-card-warning compact">Отправка заблокирована: задача не согласована.</p> : null}
              </article>
            ))}
          </section>
        ))}
      </div>
      {rejectTask ? (
        <div className="emu-nested-confirm">
          <strong>Отклонить задачу «{rejectTask.title}»</strong>
          <label className="emu-textarea-label">Комментарий<textarea value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} placeholder="Причина отклонения" /></label>
          <div className="emu-modal-actions">
            <button onClick={() => { setRejectTask(null); setRejectComment(""); }} type="button">Отмена</button>
            <button className="emu-danger-button" disabled={!rejectComment.trim()} onClick={() => void rejectSelectedTask()} type="button">Отклонить</button>
          </div>
        </div>
      ) : null}
      {confirmWeekApproval ? (
        <div className="emu-nested-confirm">
          <strong>Согласовать неделю</strong>
          <p>Будет согласовано задач: {weekApprovalCount}. Действие попадет в историю изменений плана.</p>
          <div className="emu-modal-actions">
            <button onClick={() => setConfirmWeekApproval(false)} type="button">Отмена</button>
            <button className="emu-primary-button" onClick={() => void confirmApproveWeek()} type="button">Согласовать неделю</button>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
  wide?: boolean;
}) {
  const modal = (
    <div className="emu-modal-backdrop" onClick={onClose} role="presentation">
      <section className={`emu-modal ${wide ? "emu-modal-wide" : ""}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button onClick={onClose} type="button">×</button>
        </header>
        {children}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

function WorkSummary({ work }: { work: EmuWorkSessionDto }) {
  return (
    <div className="emu-work-summary">
      <strong>{work.sectionName}</strong>
      <span>{work.employees.map((employee) => employee.fullNameSnapshot).join(", ")}</span>
      <p>{work.taskDescription}</p>
    </div>
  );
}

function activeSections(workspace: EmuWorkspace) {
  return workspace.settings.sections.filter((section) => section.isActive);
}

function getSystemOtherSection(workspace: EmuWorkspace) {
  return activeSections(workspace).find((section) => isSystemOtherSection(section));
}

function isSystemOtherSection(item: EmuReferenceDto) {
  return item.code === "prochee" || item.name.trim().toLowerCase() === "прочее";
}

function filterEmployees(employees: EmuEmployeeOption[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return employees;
  return employees.filter((employee) =>
    [employee.fullName, employee.position, employee.department, employee.personnelNo].some((value) => value.toLowerCase().includes(query)),
  );
}

function getEmployeeWorkState(employeeId: string, sessions: EmuWorkSessionDto[], currentWorkId = ""): EmployeeWorkState {
  for (const session of sessions) {
    if (session.id === currentWorkId || session.deletedAt || session.completedAt) continue;
    const employee = session.employees.find((item) => item.employeeId === employeeId && !item.finishedAt);
    if (!employee) continue;
    if (employee.status === "Работает") return "Работает";
    if (employee.status === "На другой работе") return "На другой работе";
    return "В ожидании";
  }

  return "Свободен";
}

function selectedConflicts(employeeIds: string[], sessions: EmuWorkSessionDto[], currentWorkId = "") {
  return employeeIds
    .map((employeeId) => {
      const session = sessions.find((item) =>
        item.id !== currentWorkId &&
        !item.deletedAt &&
        !item.completedAt &&
        item.employees.some((employee) => employee.employeeId === employeeId && !employee.finishedAt && employee.status === "Работает"),
      );
      return session?.employees.find((employee) => employee.employeeId === employeeId)?.fullNameSnapshot ?? "";
    })
    .filter(Boolean);
}

function isVisibleOnDailyBoard(work: EmuWorkSessionDto) {
  if (work.deletedAt) return false;
  if (!work.completedAt) return true;
  return toDateKey(new Date(work.completedAt)) === toDateKey(new Date());
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasOpenEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt);
}

function hasWorkingEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt && employee.status === "Работает");
}

function hasPausedEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt && employee.status !== "Работает");
}

function resolveWorkCardState(work: EmuWorkSessionDto): WorkCardState {
  if (work.completedAt) return "completed";
  if (hasWorkingEmployees(work) && hasPausedEmployees(work)) return "mixed";
  if (hasPausedEmployees(work)) return "paused";
  if (hasWorkingEmployees(work)) return "working";
  if (work.isCarriedOver || hasOpenEmployees(work)) return "attention";
  return "working";
}

function buildWorkFilterCounts(work: EmuWorkSessionDto[]): Record<WorkCardFilter, number> {
  return work.reduce<Record<WorkCardFilter, number>>(
    (counts, item) => {
      counts.all += 1;
      counts[resolveWorkCardState(item)] += 1;
      return counts;
    },
    { all: 0, attention: 0, completed: 0, mixed: 0, paused: 0, working: 0 },
  );
}

function buildBoardSections(work: EmuWorkSessionDto[]) {
  const sections: Array<{ hint: string; items: EmuWorkSessionDto[]; state: WorkCardState; title: string }> = [
    { hint: "сотрудники сейчас выполняют работу", items: [], state: "working", title: "В работе" },
    { hint: "часть сотрудников работает, часть на паузе или на другой работе", items: [], state: "mixed", title: "Частично на паузе" },
    { hint: "работа ожидает продолжения", items: [], state: "paused", title: "На паузе" },
    { hint: "завершенные сегодня карточки завтра уйдут в историю", items: [], state: "completed", title: "Выполненные сегодня" },
    { hint: "перенос, конфликт или карточка без активных исполнителей", items: [], state: "attention", title: "Требует внимания" },
  ];
  const byState = new Map(sections.map((section) => [section.state, section]));

  for (const item of work) {
    byState.get(resolveWorkCardState(item))?.items.push(item);
  }

  return sections.filter((section) => section.items.length > 0);
}

function collectWorkingConflicts(sessions: EmuWorkSessionDto[]) {
  const byEmployee = new Map<string, { employeeName: string; workNumbers: string[] }>();

  for (const session of sessions) {
    if (session.deletedAt || session.completedAt) continue;
    for (const employee of session.employees) {
      if (employee.finishedAt || employee.status !== "Работает") continue;
      const existing = byEmployee.get(employee.employeeId) ?? { employeeName: employee.fullNameSnapshot, workNumbers: [] };
      existing.workNumbers.push(session.workNumber);
      byEmployee.set(employee.employeeId, existing);
    }
  }

  return Array.from(byEmployee.values()).filter((item) => item.workNumbers.length > 1);
}

function workFilterLabel(filter: WorkCardFilter) {
  if (filter === "mixed") return "Частично";
  if (filter === "working") return "В работе";
  if (filter === "paused") return "Пауза";
  if (filter === "completed") return "Выполнено";
  if (filter === "attention") return "Внимание";
  return "Все";
}

function workStateLabel(state: WorkCardState) {
  if (state === "mixed") return "Частично";
  if (state === "paused") return "Пауза";
  if (state === "completed") return "Выполнено";
  if (state === "attention") return "Внимание";
  return "В работе";
}

function statusClass(status: EmployeeWorkState | string) {
  if (status === "Работает") return "emu-status-working";
  if (status === "На другой работе") return "emu-status-other";
  if (status === "В ожидании") return "emu-status-waiting";
  return "emu-status-free";
}

function shouldShowEmployeeState(status: EmployeeWorkState | string) {
  return statusClass(status) !== "emu-status-free";
}

function employeeStatusLabel(status: EmployeeWorkState | string) {
  if (status === "На другой работе") return "Работает";
  if (status === "В ожидании") return "Пауза";
  return status;
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatEmployeeShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const initialsValue = parts.slice(1).map((part) => `${part[0]}.`).join("");
  return `${parts[0]} ${initialsValue}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}

function formatMinutes(value: number) {
  if (value < 60) return `${value} мин`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours} ч ${minutes} мин`;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}

function toLocalIso(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`).toISOString();
}

function mondayOf(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toDateInput(date);
}
