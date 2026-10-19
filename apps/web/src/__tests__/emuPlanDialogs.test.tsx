import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmuPlanTaskDto } from "../api/contracts";
import type { EmuWorkspace } from "../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../features/emu/work-accounting/types";
import { PlanBoardModal } from "../features/emu/work-accounting/modals/PlanBoardModal";
import { PlanTaskEditor } from "../features/emu/work-accounting/plan/PlanTaskEditor";
import { PlanTaskActionDialog, PlanWeekApprovalDialog } from "../features/emu/work-accounting/plan/PlanTaskDialogs";
import { approvalFingerprint, planColumn, tasksInWeek } from "../features/emu/work-accounting/plan/planBoardModel";
import { planTasks as fixtureTasks } from "../../e2e/fixtures/emuPlanData";
import { workAccountingNow, workAccountingSettings } from "../../e2e/fixtures/workAccounting";
const tasks = fixtureTasks as EmuPlanTaskDto[], task = tasks[0];
const employees = workAccountingSettings.favoriteEmployees.map(item => ({ ...item, id: item.employeeId })) as EmuEmployeeOption[];
function workspace(actions = {}) { return { settings: workAccountingSettings, planTasks: tasks, workSessions: { rows: [] }, actions, refreshPlanBoard: vi.fn().mockResolvedValue(undefined) } as unknown as EmuWorkspace; }
const shared = () => ({ onClose: vi.fn(), onNotify: vi.fn(), onSaved: vi.fn(), workspace: workspace() });
const editor = () => ({ ...shared(), initialDate: task.plannedDate, defaultSectionId: task.sectionId!, employees });
const board = () => ({ ...shared(), employeeOptions: employees, canManagePlan: true, canApprovePlan: true, canCreateWork: true });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; }
function command(name: string, title = task.title) { const card = screen.getByRole("button", { name: `Открыть задачу ${title}` }).closest("article")!; (card.querySelector("details") as HTMLDetailsElement).open = true; fireEvent.click(within(card).getByRole("button", { name })); }
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(workAccountingNow)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("plan board", () => {
  it("shows only the selected week and never duplicates an unapproved active task", () => {
    const changed = { ...tasks[3], approvalStatus: "Черновик" };
    render(<PlanBoardModal {...board()} workspace={{ ...workspace(), planTasks: [...tasks.filter(row => row.id !== changed.id), changed] }} />);
    expect(screen.getAllByRole("button", { name: `Открыть задачу ${changed.title}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: `Открыть задачу ${tasks[19].title}` })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Неделя плана"), { target: { value: "2026-10-26" } });
    expect(screen.getByRole("button", { name: `Открыть задачу ${tasks[19].title}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Открыть задачу ${task.title}` })).not.toBeInTheDocument();
  });
  it("does not expose writes to a reader", () => {
    render(<PlanBoardModal {...board()} canManagePlan={false} canApprovePlan={false} canCreateWork={false} />);
    expect(screen.queryByRole("button", { name: "Новая задача" })).not.toBeInTheDocument();
    expect(screen.queryByText("Действия")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Открыть задачу ${task.title}` }));
    expect(screen.getByRole("dialog", { name: "Плановая задача" })).toHaveTextContent(task.description);
  });
  it("keeps an editor with its original ID/version after its task disappears from the refreshed board", async () => {
    const update = vi.fn().mockRejectedValue(new Error("Задача была удалена")), create = vi.fn();
    const props = { ...board(), workspace: workspace({ updatePlanTask: update, createPlanTask: create }) };
    const view = render(<PlanBoardModal {...props} />); command("Изменить");
    fireEvent.change(screen.getByRole("textbox", { name: "Описание" }), { target: { value: "Сохранить мой ввод" } });
    view.rerender(<PlanBoardModal {...props} workspace={{ ...props.workspace, planTasks: tasks.slice(1) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить задачу" })); await screen.findByRole("alert");
    expect(update).toHaveBeenCalledWith(task.id, expect.objectContaining({ rowVersion: 7, description: "Сохранить мой ввод" }));
    expect(create).not.toHaveBeenCalled(); expect(screen.getByRole("textbox", { name: "Описание" })).toHaveValue("Сохранить мой ввод");
  });
  it("locks send after acknowledgement until the board confirms its new status", async () => {
    const send = vi.fn().mockResolvedValue({ id: "accepted-work" });
    render(<PlanBoardModal {...board()} workspace={workspace({ createWorkSession: send })} />);
    command("Отправить в работу", tasks[2].title);
    await screen.findByText("Работа создана. Ожидаем обновления плана.");
    const card = screen.getByRole("button", { name: `Открыть задачу ${tasks[2].title}` }).closest("article")!;
    expect(within(card).getByRole("button", { name: "Отправить в работу" })).toBeDisabled(); expect(send).toHaveBeenCalledOnce();
  });
  it("keeps the chosen task open during a background board update", () => {
    const props=board(),view=render(<PlanBoardModal {...props}/>); command("Изменить");
    fireEvent.change(screen.getByRole("textbox",{name:"Название задачи"}),{target:{value:"Моё новое название"}});
    view.rerender(<PlanBoardModal {...props} workspace={{...workspace(),planTasks:tasks.map(item=>({...item,title:"Фоновое название",rowVersion:19}))}}/>);
    expect(screen.getByRole("textbox",{name:"Название задачи"})).toHaveValue("Моё новое название");
  });
});

describe("plan editors", () => {
  it("retains changed input on dismissal and discards only explicitly", async () => {
    const props=editor();render(<PlanTaskEditor {...props}/>);const field=screen.getByRole("textbox",{name:"Название задачи"});fireEvent.change(field,{target:{value:"Черновик задачи"}});field.focus();fireEvent.keyDown(window,{key:"Escape"});
    const guard=await screen.findByRole("dialog",{name:"Несохранённые изменения"});fireEvent.click(within(guard).getByRole("button",{name:"Продолжить редактирование"}));expect(field).toHaveValue("Черновик задачи");expect(field).toHaveFocus();
    fireEvent.click(screen.getByRole("button",{name:"Отмена"}));fireEvent.click(screen.getByRole("button",{name:"Закрыть без сохранения"}));await waitFor(()=>expect(props.onClose).toHaveBeenCalledOnce());
  });
  it("preserves recurrence and the opened version instead of adopting a later revision",async()=>{
    const update=vi.fn().mockResolvedValue({...task,rowVersion:8}),opened={...task,isRecurring:true,recurrenceRule:"weekly"},props={...editor(),task:opened,workspace:workspace({updatePlanTask:update})};const view=render(<PlanTaskEditor {...props}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Описание"}),{target:{value:"Моё описание"}});view.rerender(<PlanTaskEditor {...props} task={{...opened,rowVersion:19,description:"Новая версия"}}/>);fireEvent.click(screen.getByRole("button",{name:"Сохранить задачу"}));
    await waitFor(()=>expect(props.onClose).toHaveBeenCalledOnce());expect(update).toHaveBeenCalledWith(task.id,expect.objectContaining({rowVersion:7,isRecurring:true,recurrenceRule:"weekly",description:"Моё описание"}));
  });
  it("searches beyond the first twelve employees and retains selected unavailable IDs",()=>{
    const extra=Array.from({length:34},(_,index)=>({...employees[0],id:`extra-${index}`,fullName:`Сотрудник ${index}`}));render(<PlanTaskEditor {...editor()} task={{...task,employeeIds:["absent"]}} employees={extra}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Поиск сотрудников"}),{target:{value:"Сотрудник 33"}});fireEvent.click(screen.getByRole("button",{name:/Сотрудник 33/}));expect(screen.getByText(/Выбрано 2/)).toBeInTheDocument();expect(screen.getByText(/привязки сохраняются/)).toBeInTheDocument();
  });
  it("blocks duplicate saves and every close path while pending; failure preserves the form",async()=>{
    const gate=deferred<EmuPlanTaskDto>(),save=vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue({...task,rowVersion:8}),props={...editor(),task,workspace:workspace({updatePlanTask:save})};render(<PlanTaskEditor {...props}/>);
    const field=screen.getByRole("textbox",{name:"Описание"}),button=screen.getByRole("button",{name:"Сохранить задачу"});fireEvent.change(field,{target:{value:"Мой результат"}});fireEvent.click(button);fireEvent.click(button);expect(save).toHaveBeenCalledOnce();expect(field).toBeDisabled();expect(screen.getByRole("button",{name:"Закрыть"})).toBeDisabled();fireEvent.keyDown(window,{key:"Escape"});expect(props.onClose).not.toHaveBeenCalled();
    await act(async()=>gate.reject(new Error("Сервер недоступен")));expect(screen.getByRole("alert")).toHaveTextContent("Сервер недоступен");expect(field).toHaveValue("Мой результат");fireEvent.click(button);await waitFor(()=>expect(props.onClose).toHaveBeenCalledOnce());
  });
  it("does not notify or close a newer editor after the old response arrives",async()=>{
    const gate=deferred<EmuPlanTaskDto>(),props={...editor(),task,workspace:workspace({updatePlanTask:vi.fn().mockReturnValue(gate.promise)})};const view=render(<PlanTaskEditor {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Сохранить задачу"}));view.unmount();render(<PlanTaskEditor {...editor()}/>);await act(async()=>gate.resolve(task));expect(props.onClose).not.toHaveBeenCalled();expect(props.onSaved).not.toHaveBeenCalled();expect(props.onNotify).not.toHaveBeenCalled();
  });
  it.each(["reject","reschedule"] as const)("keeps %s comments, pending state and the opened revision",async kind=>{
    const save=vi.fn().mockRejectedValue(new Error("Версия изменилась")),props={...shared(),task,workspace:workspace({approvePlanTask:save,reschedulePlanTask:save})};render(<PlanTaskActionDialog {...props} kind={kind}/>);
    const field=screen.getByRole("textbox");fireEvent.change(field,{target:{value:"Подробная причина"}});if(kind==="reschedule")fireEvent.change(screen.getByLabelText("Новая дата"),{target:{value:"2026-10-20"}});fireEvent.click(screen.getByRole("button",{name:kind==="reschedule"?"Перенести":"Отклонить"}));await screen.findByRole("alert");expect(field).toHaveValue("Подробная причина");expect(save.mock.calls[0]).toEqual(kind==="reschedule"?[task.id,{comment:"Подробная причина",newPlannedDate:"2026-10-20",rowVersion:7}]:[task.id,false,"Подробная причина",7]);fireEvent.keyDown(window,{key:"Escape"});expect(await screen.findByRole("dialog",{name:"Несохранённые изменения"})).toBeInTheDocument();
  });
});

describe("week approval",()=>{
  it("rejects an approval after the reviewed composition or version changes",async()=>{
    const save=vi.fn(),reviewed=tasksInWeek(tasks,"2026-10-12").filter(task=>task.approvalStatus!=="Согласовано");render(<PlanWeekApprovalDialog {...shared()} weekStart="2026-10-12" tasks={reviewed} currentTasks={reviewed.map(task=>({...task,rowVersion:19}))} workspace={workspace({approveWeek:save})}/>);
    fireEvent.click(screen.getByRole("button",{name:"Согласовать неделю"}));expect(await screen.findByRole("alert")).toHaveTextContent("Состав или версии задач изменились");expect(save).not.toHaveBeenCalled();
  });
  it("does not double approve while pending and keeps the confirmation on failure",async()=>{
    const gate=deferred<EmuPlanTaskDto[]>(),save=vi.fn().mockReturnValue(gate.promise),props={...shared(),weekStart:"2026-10-12",tasks:[task],currentTasks:[task],workspace:workspace({approveWeek:save})};render(<PlanWeekApprovalDialog {...props}/>);const button=screen.getByRole("button",{name:"Согласовать неделю"});fireEvent.click(button);fireEvent.click(button);expect(save).toHaveBeenCalledOnce();fireEvent.keyDown(window,{key:"Escape"});expect(props.onClose).not.toHaveBeenCalled();await act(async()=>gate.reject(new Error("Повторите позже")));expect(screen.getByRole("alert")).toHaveTextContent("Повторите позже");
  });
});

it("partitions every status once and fingerprints only pending approvals",()=>{
  expect(planColumn({...task,status:"В работе"})).toBe("active");expect(planColumn({...task,status:"Выполнено"})).toBe("done");expect(planColumn({...task,approvalStatus:"Согласовано"})).toBe("approved");expect(approvalFingerprint([task,{...tasks[2],rowVersion:19}])).toBe(`${task.id}:7`);expect(tasksInWeek(tasks,"2026-10-12")).toHaveLength(19);
});
