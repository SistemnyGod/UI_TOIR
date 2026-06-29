import { useState } from "react";
import type { EmuPlanTaskDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../types";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
import { activeSections, formatDate, formatEmployeeShortName, getSystemOtherSection, mondayOf, parseDateInput, toDateInput, toggle } from "../workAccountingUtils";

export function PlanBoardModal({
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
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [rejectTask, setRejectTask] = useState<EmuPlanTaskDto | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [rescheduleTask, setRescheduleTask] = useState<EmuPlanTaskDto | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleComment, setRescheduleComment] = useState("");
  const [confirmWeekApproval, setConfirmWeekApproval] = useState(false);

  const weekStart = mondayOf(plannedDate);
  const weekApprovalCount = workspace.planTasks.filter((task) => {
    const taskDate = parseDateInput(task.plannedDate);
    const start = parseDateInput(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return taskDate >= start && taskDate < end && task.approvalStatus !== "Согласовано";
  }).length;

  const editingTask = workspace.planTasks.find((task) => task.id === editingTaskId);

  function resetTaskForm() {
    setTitle("");
    setDescription("");
    setSectionId(defaultPlanSectionId);
    setPriority("");
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
      isRecurring: false,
      plannedDate,
      priority: priority || "Обычный",
      recurrenceRule: "",
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

  function openReschedule(task: EmuPlanTaskDto) {
    if (!canManagePlan) {
      onNotify("Недостаточно прав для переноса плана ЭМУ");
      return;
    }

    setRescheduleTask(task);
    setRescheduleDate(task.plannedDate);
    setRescheduleComment("");
  }

  async function confirmRescheduleTask() {
    if (!rescheduleTask) return;
    if (!canManagePlan) {
      onNotify("Недостаточно прав для переноса плана ЭМУ");
      return;
    }

    try {
      await workspace.actions.reschedulePlanTask(rescheduleTask.id, {
        comment: rescheduleComment,
        newPlannedDate: rescheduleDate,
        rowVersion: rescheduleTask.rowVersion,
      });
      onNotify("Плановая задача перенесена");
      setRescheduleTask(null);
      setRescheduleComment("");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось перенести задачу");
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
        workDate: task.plannedDate,
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
    { key: "done", title: "Закрыто", tasks: workspace.planTasks.filter((task) => task.status !== "Запланировано" && task.status !== "В работе" && task.approvalStatus === "Согласовано") },
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
                <small>{task.priority || "Без приоритета"} · сотрудников: {task.employeeIds.length}</small>
                <div className="emu-plan-card-actions">
                  {canManagePlan ? <button onClick={() => editTask(task)} type="button">Изменить</button> : null}
                  {canManagePlan && task.status === "Запланировано" ? <button onClick={() => openReschedule(task)} type="button">Перенести</button> : null}
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
      {rescheduleTask ? (
        <div className="emu-nested-confirm">
          <strong>Перенести задачу «{rescheduleTask.title}»</strong>
          <div className="emu-form-grid compact">
            <label>Новая дата<input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label>
          </div>
          <label className="emu-textarea-label">Причина переноса<textarea value={rescheduleComment} onChange={(event) => setRescheduleComment(event.target.value)} placeholder="Почему переносим задачу" /></label>
          <div className="emu-modal-actions">
            <button onClick={() => { setRescheduleTask(null); setRescheduleComment(""); }} type="button">Отмена</button>
            <button className="emu-primary-button" disabled={!rescheduleComment.trim() || rescheduleDate === rescheduleTask.plannedDate} onClick={() => void confirmRescheduleTask()} type="button">Перенести</button>
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
