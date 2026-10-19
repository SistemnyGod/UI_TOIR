import { useEffect, useState } from "react";
import type { EmuPlanTaskDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../types";
import { Button } from "../../../../shared/ui";
import { ModalFrame } from "../components/ModalFrame";
import { useEmuDialogSession } from "../useEmuDialogSession";
import { activeSections, formatDate, getSystemOtherSection, mondayOf, toDateInput } from "../workAccountingUtils";
import { planColumn, planColumns, shiftPlanWeek, snapshotPlanTask, tasksInWeek, type PlanColumn } from "../plan/planBoardModel";
import { PlanTaskEditor } from "../plan/PlanTaskEditor";
import { PlanTaskActionDialog, PlanTaskView, PlanWeekApprovalDialog } from "../plan/PlanTaskDialogs";
import "../plan/emuPlanBoard.css";

type Selection = { kind: "create"; date: string } | { kind: "edit" | "reject" | "reschedule" | "view"; task: EmuPlanTaskDto } | { kind: "week"; weekStart: string; tasks: EmuPlanTaskDto[] };

export function PlanBoardModal({ canApprovePlan, canCreateWork, canManagePlan, employeeOptions, onClose, onNotify, workspace }: {
  canApprovePlan: boolean; canCreateWork: boolean; canManagePlan: boolean;
  employeeOptions: EmuEmployeeOption[]; onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace;
}) {
  const today = toDateInput(new Date());
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 760);
  const [column, setColumn] = useState<PlanColumn>("draft");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [accepted, setAccepted] = useState<Record<string, EmuPlanTaskDto>>({});
  const [sent, setSent] = useState<string[]>([]);
  const session = useEmuDialogSession({ onClose, onNotify });
  const defaultSectionId = getSystemOtherSection(workspace)?.id ?? activeSections(workspace)[0]?.id ?? "";
  const merged = new Map(workspace.planTasks.map(task => [task.id, task]));
  for (const task of Object.values(accepted)) if (!merged.has(task.id) || merged.get(task.id)!.rowVersion < task.rowVersion) merged.set(task.id, task);
  useEffect(() => {
    setAccepted(current => {
      const rest = Object.fromEntries(Object.entries(current).filter(([id, task]) => !workspace.planTasks.some(row => row.id === id && row.rowVersion >= task.rowVersion)));
      return Object.keys(rest).length === Object.keys(current).length ? current : rest;
    });
    setSent(current => {
      const rest = current.filter(id => !workspace.planTasks.some(task => task.id === id && task.status !== "Запланировано"));
      return rest.length === current.length ? current : rest;
    });
  }, [workspace.planTasks]);
  const week = tasksInWeek([...merged.values()], weekStart);
  const awaitingApproval = week.filter(task => task.approvalStatus !== "Согласовано");
  const query = search.trim().toLowerCase();
  const visible = week.filter(task => [task.title, task.description, task.sectionName, ...task.employeeIds.map(id => employeeOptions.find(employee => employee.id === id)?.fullName || "")].some(value => value.toLowerCase().includes(query)));
  function accept(tasks: EmuPlanTaskDto[]) { setAccepted(current => ({ ...current, ...Object.fromEntries(tasks.map(task => [task.id, task])) })); }
  function saved(task: EmuPlanTaskDto) { accept([task]); setWeekStart(mondayOf(task.plannedDate)); setColumn(planColumn(task)); }
  function open(kind: "edit" | "reject" | "reschedule" | "view", task: EmuPlanTaskDto) { setSelection({ kind, task: snapshotPlanTask(task) }); }
  function send(task: EmuPlanTaskDto) {
    if (!canCreateWork || task.status !== "Запланировано" || task.approvalStatus !== "Согласовано" || sent.includes(task.id)) return;
    void session.run(async () => {
      const sectionId = task.sectionId || defaultSectionId;
      if (!sectionId) throw new Error("Добавьте участок перед отправкой задачи в работу");
      return workspace.actions.createWorkSession({ arrivedAt: new Date().toISOString(), employeeIds: task.employeeIds, planTaskId: task.id,
        sectionId, taskDescription: task.description || task.title, workDate: task.plannedDate });
    }, "Плановая задача отправлена в работу", () => setSent(current => [...current, task.id]));
  }
  const error = session.error || workspace.error;
  return <><ModalFrame wide title="Доска задач / план на неделю" className="emu-plan-board" subtitle={`Неделя с ${formatDate(weekStart)} · Задач: ${week.length}`}
    onClose={session.close} pending={session.pending} leaveDialog={session.leaveDialog}
    actions={<div className="emu-plan-footer">
      {error ? <p className="emu-work-form-error" role="alert">{error}</p> : null}
      <span role="status">{session.pending ? "Сохраняем изменения…" : `Найдено: ${visible.length} из ${week.length}`}</span>
      <Button disabled={session.pending} onClick={session.close} variant="ghost">Готово</Button>
      {canManagePlan ? <Button disabled={session.pending} variant="primary" onClick={() => setSelection({ kind: "create", date: mondayOf(today) === weekStart ? today : weekStart })}>Новая задача</Button> : null}
    </div>}>
    <details className="emu-plan-filters" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
      <summary>Неделя и поиск{query ? " · поиск включён" : ""}</summary>
      <div className="emu-plan-toolbar">
      <div className="emu-plan-week-nav">
        <Button aria-label="Предыдущая неделя" onClick={() => setWeekStart(shiftPlanWeek(weekStart, -1))}>←</Button>
        <label>Неделя плана<input type="date" value={weekStart} onChange={event => { if (event.target.value) setWeekStart(mondayOf(event.target.value)); }} /></label>
        <Button aria-label="Следующая неделя" onClick={() => setWeekStart(shiftPlanWeek(weekStart, 1))}>→</Button>
        <Button onClick={() => setWeekStart(mondayOf(today))} variant="ghost">Текущая</Button>
      </div>
      <label className="emu-plan-search">Поиск задач<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Задача, участок или сотрудник" /></label>
      <div className="emu-plan-toolbar-actions">
        <Button onClick={() => void workspace.refreshPlanBoard()} variant="ghost">Обновить доску</Button>
        {canApprovePlan ? <Button disabled={!awaitingApproval.length} onClick={() => setSelection({ kind: "week", weekStart, tasks: awaitingApproval.map(snapshotPlanTask) })} variant="secondary">Согласовать неделю ({awaitingApproval.length})</Button> : null}
      </div>
      </div>
    </details>
    <div className="emu-plan-column-switch" role="group" aria-label="Статусы плана">{planColumns.map(item => <button type="button" key={item.id} aria-pressed={column === item.id} onClick={() => setColumn(item.id)}>{item.title} <span>{visible.filter(task => planColumn(task) === item.id).length}</span></button>)}</div>
    <div className="emu-plan-columns" data-column={column}>
      {planColumns.map(item => {
        const tasks = visible.filter(task => planColumn(task) === item.id);
        return <section className={`emu-plan-column emu-plan-column-${item.id}`} key={item.id} aria-label={item.title}>
          <h3>{item.title}<span>{tasks.length}</span></h3>
          {tasks.map(task => <article className="emu-plan-card" data-priority={task.priority} key={task.id}>
            <button className="emu-plan-title" type="button" onClick={() => open("view", task)} aria-label={`Открыть задачу ${task.title}`}>{task.title}</button>
            <span>{formatDate(task.plannedDate)} · {task.sectionName || "Прочее"}</span>
            <div className="emu-plan-badges"><span>{task.priority || "Обычный"}</span><span>{item.id === "done" ? task.status : task.approvalStatus}</span><span>Сотрудников: {task.employeeIds.length}</span></div>
            {sent.includes(task.id) ? <p role="status">Работа создана. Ожидаем обновления плана.</p> : null}
            {canManagePlan || canApprovePlan || canCreateWork ? <details className="emu-plan-card-menu"><summary>Действия</summary><div className="emu-plan-card-actions">
              {canManagePlan ? <button type="button" onClick={() => open("edit", task)} disabled={sent.includes(task.id)}>Изменить</button> : null}
              {canManagePlan && task.status === "Запланировано" ? <button type="button" onClick={() => open("reschedule", task)} disabled={sent.includes(task.id)}>Перенести</button> : null}
              {canApprovePlan && task.approvalStatus !== "Согласовано" ? <>
                <button type="button" onClick={() => void session.run(() => workspace.actions.approvePlanTask(task.id, true, "Согласовано", task.rowVersion), "Задача согласована", result => { accept([result]); setColumn(planColumn(result)); })}>Согласовать</button>
                <button type="button" onClick={() => open("reject", task)}>Отклонить</button>
              </> : null}
              {canCreateWork && task.status === "Запланировано" ? <button type="button" disabled={task.approvalStatus !== "Согласовано" || sent.includes(task.id)} onClick={() => send(task)} title={task.approvalStatus !== "Согласовано" ? "Сначала согласуйте задачу" : undefined}>Отправить в работу</button> : null}
            </div></details> : null}
          </article>)}
          {!tasks.length ? <p className="emu-plan-empty">{query ? "По этому поиску задач нет" : "Задач нет"}</p> : null}
        </section>;
      })}
    </div>
  </ModalFrame>
    {canManagePlan && (selection?.kind === "create" || selection?.kind === "edit") ? <PlanTaskEditor key={selection.kind === "edit" ? selection.task.id : "new"}
      task={selection.kind === "edit" ? selection.task : undefined} initialDate={selection.kind === "create" ? selection.date : selection.task.plannedDate}
      defaultSectionId={defaultSectionId} employees={employeeOptions} workspace={workspace} onClose={() => setSelection(null)} onNotify={onNotify} onSaved={saved} /> : null}
    {selection && ((selection.kind === "reject" && canApprovePlan) || (selection.kind === "reschedule" && canManagePlan)) ? <PlanTaskActionDialog key={`${selection.kind}:${selection.task.id}`} kind={selection.kind as "reject" | "reschedule"}
      task={selection.task} workspace={workspace} onClose={() => setSelection(null)} onNotify={onNotify} onSaved={saved} /> : null}
    {selection?.kind === "week" && canApprovePlan ? <PlanWeekApprovalDialog weekStart={selection.weekStart} tasks={selection.tasks} currentTasks={week}
      workspace={workspace} onClose={() => setSelection(null)} onNotify={onNotify} onSaved={tasks => { accept(tasks); setColumn("approved"); }} /> : null}
    {selection?.kind === "view" ? <PlanTaskView task={selection.task} employees={employeeOptions} onClose={() => setSelection(null)} /> : null}
  </>;
}
