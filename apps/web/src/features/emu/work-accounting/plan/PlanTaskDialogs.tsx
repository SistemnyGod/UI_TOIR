import { useState } from "react";
import type { EmuPlanTaskDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../types";
import { Button } from "../../../../shared/ui";
import { ModalFrame } from "../components/ModalFrame";
import { WorkFormActions } from "../components/WorkFormActions";
import { formatDate } from "../workAccountingUtils";
import { useWorkMutation } from "../useWorkMutation";
import { approvalFingerprint } from "./planBoardModel";

type TaskDialogProps = { task: EmuPlanTaskDto; workspace: EmuWorkspace; onClose: () => void; onNotify: (message: string) => void; onSaved: (task: EmuPlanTaskDto) => void };
export function PlanTaskActionDialog({ kind, task, workspace, onClose, onNotify, onSaved }: TaskDialogProps & { kind: "reject" | "reschedule" }) {
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(task.plannedDate);
  const mutation = useWorkMutation({ onClose, onNotify, work: task, values: { comment, date } });
  const reschedule = kind === "reschedule";
  return <ModalFrame title={reschedule ? "Перенести плановую задачу" : "Отклонить плановую задачу"} className="emu-plan-action" subtitle={task.title}
    pending={mutation.pending} onClose={mutation.close} leaveDialog={mutation.leaveDialog}
    actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} danger={!reschedule}
      disabled={!comment.trim() || reschedule && (!date || date === task.plannedDate)} label={reschedule ? "Перенести" : "Отклонить"}
      onSubmit={() => void mutation.run(() => reschedule
        ? workspace.actions.reschedulePlanTask(mutation.workId, { comment, newPlannedDate: date, rowVersion: mutation.rowVersion })
        : workspace.actions.approvePlanTask(mutation.workId, false, comment, mutation.rowVersion),
      reschedule ? "Плановая задача перенесена" : "Задача отклонена", onSaved)} />}>
    {reschedule ? <label className="emu-textarea-label">Новая дата<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label> : null}
    <label className="emu-textarea-label">{reschedule ? "Причина переноса" : "Комментарий"}<textarea rows={4} value={comment} onChange={event => setComment(event.target.value)} /></label>
  </ModalFrame>;
}
export function PlanWeekApprovalDialog({ weekStart, tasks, currentTasks, workspace, onClose, onNotify, onSaved }: {
  weekStart: string; tasks: EmuPlanTaskDto[]; currentTasks: EmuPlanTaskDto[]; workspace: EmuWorkspace;
  onClose: () => void; onNotify: (message: string) => void; onSaved: (tasks: EmuPlanTaskDto[]) => void;
}) {
  const mutation = useWorkMutation({ onClose, onNotify });
  return <ModalFrame title="Согласовать неделю" className="emu-plan-action" subtitle={`Неделя с ${formatDate(weekStart)}`}
    pending={mutation.pending} onClose={mutation.close}
    actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} label="Согласовать неделю"
      onSubmit={() => void mutation.run(async () => {
        if (approvalFingerprint(tasks) !== approvalFingerprint(currentTasks)) throw new Error("Состав или версии задач изменились. Закройте это окно и заново проверьте неделю перед согласованием.");
        return workspace.actions.approveWeek(weekStart, `Массовое согласование недели: ${tasks.length} задач`);
      }, "Неделя согласована", onSaved)} />}>
    <p>Будет согласовано задач: {tasks.length}. Поиск на доске не ограничивает согласование недели.</p>
    <ul className="emu-plan-approval-list">{tasks.map(task => <li key={task.id}><strong>{task.title}</strong><span>{formatDate(task.plannedDate)} · {task.sectionName || "Прочее"}</span></li>)}</ul>
  </ModalFrame>;
}
export function PlanTaskView({ task, employees, onClose }: { task: EmuPlanTaskDto; employees: EmuEmployeeOption[]; onClose: () => void }) {
  return <ModalFrame title="Плановая задача" className="emu-plan-action" onClose={onClose}
    actions={<div className="emu-modal-actions"><Button onClick={onClose} variant="primary">Готово</Button></div>}>
    <h3 className="emu-plan-view-title">{task.title}</h3>
    <dl className="emu-plan-view-fields"><div><dt>Дата</dt><dd>{formatDate(task.plannedDate)}</dd></div><div><dt>Участок</dt><dd>{task.sectionName || "Прочее"}</dd></div><div><dt>Статус</dt><dd>{task.status} · {task.approvalStatus}</dd></div><div><dt>Приоритет</dt><dd>{task.priority || "Обычный"}</dd></div></dl>
    <section className="emu-plan-description"><h4>Описание</h4><p>{task.description || "Описание не указано"}</p></section>
    <section><h4>Сотрудники</h4><ul>{task.employeeIds.map(id => <li key={id}>{employees.find(employee => employee.id === id)?.fullName || `Недоступный сотрудник (${id})`}</li>)}</ul></section>
  </ModalFrame>;
}
