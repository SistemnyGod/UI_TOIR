import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmuWorkspace } from "../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../features/emu/work-accounting/types";
import { CatalogsModal } from "../features/emu/work-accounting/modals/CatalogsModal";
import { FavoritesModal } from "../features/emu/work-accounting/modals/FavoritesModal";
import { workAccountingSettings } from "../../e2e/fixtures/workAccounting";

const settings = workAccountingSettings;
const employees = settings.favoriteEmployees.map(item => ({ ...item, id: item.employeeId })) as EmuEmployeeOption[];
function workspace(actions = {}) { return { settings, actions } as unknown as EmuWorkspace; }
function gate<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes,no) => { resolve=yes; reject=no; }); return { resolve, reject, promise }; }
const notify = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("EMU catalogs", () => {
  it("isolates all four drafts, survives background changes and warns before discarding", async () => {
    const close = vi.fn(), props = { onClose: close, onNotify: notify, workspace: workspace() };
    const view = render(<CatalogsModal {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Новая запись: Участки" }), { target: { value: "Новый участок" } });
    fireEvent.click(screen.getByRole("tab", { name: /Причины ожидания/ })); expect(screen.getByRole("textbox", { name: "Новая запись: Причины ожидания" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "Новая запись: Причины ожидания" }), { target: { value: "Новая причина" } });
    fireEvent.click(screen.getByRole("tab", { name: /Типовые работы/ })); fireEvent.change(screen.getByRole("textbox", { name: "Название работы" }), { target: { value: "Новая работа" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Описание и ожидаемый результат" }), { target: { value: "Не потерять описание" } });
    view.rerender(<CatalogsModal {...props} workspace={{ ...workspace(), settings: { ...settings, sections: [...settings.sections] } }} />);
    fireEvent.click(screen.getByRole("tab", { name: /Участки/ })); expect(screen.getByRole("textbox", { name: "Новая запись: Участки" })).toHaveValue("Новый участок");
    fireEvent.click(screen.getByRole("tab", { name: /Причины ожидания/ })); expect(screen.getByRole("textbox", { name: "Новая запись: Причины ожидания" })).toHaveValue("Новая причина");
    fireEvent.click(screen.getByRole("tab", { name: /Типовые работы/ })); expect(screen.getByRole("textbox", { name: "Описание и ожидаемый результат" })).toHaveValue("Не потерять описание");
    fireEvent.click(screen.getByRole("button", { name: "Готово" })); const guard=await screen.findByRole("dialog",{name:"Несохранённые изменения"});
    fireEvent.click(within(guard).getByRole("button",{name:"Продолжить редактирование"})); expect(close).not.toHaveBeenCalled();
    const unload=new Event("beforeunload",{cancelable:true}); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    fireEvent.keyDown(window,{key:"Escape"}); fireEvent.click(screen.getByRole("button",{name:"Закрыть без сохранения"})); await waitFor(()=>expect(close).toHaveBeenCalledOnce());
  });
  it("locks all dismissal paths and duplicate writes, keeping a rejected draft for retry",async()=>{
    const pending=gate<typeof settings.sections[0]>(), save=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(settings.sections[0]),close=vi.fn();
    render(<CatalogsModal onClose={close} onNotify={notify} workspace={workspace({createSection:save})}/>);
    const input=screen.getByRole("textbox",{name:"Новая запись: Участки"}),add=screen.getByRole("button",{name:"Добавить"});fireEvent.change(input,{target:{value:"  Участок испытаний  "}});
    fireEvent.click(add);fireEvent.click(add);expect(save).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledWith({name:"Участок испытаний"});expect(input).toBeDisabled();expect(screen.getByRole("button",{name:"Закрыть"})).toBeDisabled();
    fireEvent.keyDown(window,{key:"Escape"});fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);expect(close).not.toHaveBeenCalled();
    await act(async()=>pending.reject(new Error("Недостаточно прав для записи")));expect(screen.getByRole("alert")).toHaveTextContent("Недостаточно прав");expect(input).toHaveValue("  Участок испытаний  ");
    fireEvent.click(add);await waitFor(()=>expect(input).toHaveValue(""));expect(save).toHaveBeenCalledTimes(2);expect(close).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Готово"}));expect(close).toHaveBeenCalledOnce();
  });
  it("preserves an opened rename and prevents applying it to another reference tab",async()=>{
    const saveSection=vi.fn().mockResolvedValue(settings.sections[0]),saveReason=vi.fn();
    render(<CatalogsModal onClose={vi.fn()} onNotify={notify} workspace={workspace({updateSection:saveSection,updateWaitReason:saveReason})}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Изменить"})[0]);fireEvent.change(screen.getByRole("textbox",{name:"Название Участки"}),{target:{value:"Уточнённый участок"}});
    fireEvent.click(screen.getByRole("tab",{name:/Причины ожидания/}));expect(screen.queryByRole("button",{name:"Сохранить"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab",{name:/Участки/}));expect(screen.getByRole("textbox",{name:"Название Участки"})).toHaveValue("Уточнённый участок");fireEvent.click(screen.getByRole("button",{name:"Сохранить"}));await waitFor(()=>expect(saveSection).toHaveBeenCalledOnce());expect(saveReason).not.toHaveBeenCalled();expect(saveSection.mock.calls[0][0]).toBe(settings.sections[0].id);
  });
  it("does not silently replace a rename after its record is removed or changed",async()=>{
    const save=vi.fn(), props={onClose:vi.fn(),onNotify:notify,workspace:workspace({updateSection:save})},view=render(<CatalogsModal {...props}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Изменить"})[0]);fireEvent.change(screen.getByRole("textbox",{name:"Название Участки"}),{target:{value:"Мой текст"}});
    view.rerender(<CatalogsModal {...props} workspace={{...props.workspace,settings:{...settings,sections:settings.sections.slice(1)}}}/>);
    fireEvent.click(screen.getByRole("button",{name:"Сохранить"}));await screen.findByRole("alert");expect(save).not.toHaveBeenCalled();expect(screen.getByRole("textbox",{name:"Название Участки"})).toHaveValue("Мой текст");
  });
  it("retains a failed template with its description and section",async()=>{
    const save=vi.fn().mockRejectedValue(new Error("Сервер недоступен"));render(<CatalogsModal onClose={vi.fn()} onNotify={notify} workspace={workspace({createWorkTemplate:save})}/>);
    fireEvent.click(screen.getByRole("tab",{name:/Типовые работы/}));fireEvent.change(screen.getByRole("textbox",{name:"Название работы"}),{target:{value:"Осмотр"}});fireEvent.change(screen.getByRole("textbox",{name:"Описание и ожидаемый результат"}),{target:{value:"Подробный результат"}});fireEvent.change(screen.getByRole("combobox",{name:"Участок"}),{target:{value:settings.sections[0].id}});fireEvent.click(screen.getByRole("button",{name:"Добавить типовую работу"}));await screen.findByRole("alert");
    expect(screen.getByRole("textbox",{name:"Описание и ожидаемый результат"})).toHaveValue("Подробный результат");expect(save).toHaveBeenCalledWith({name:"Осмотр",description:"Подробный результат",sectionId:settings.sections[0].id});
  });
  it("ignores the previous window's late response after another operator opens a form",async()=>{
    const pending=gate<typeof settings.sections[0]>();const view=render(<CatalogsModal onClose={vi.fn()} onNotify={notify} workspace={workspace({createSection:vi.fn().mockReturnValue(pending.promise)})}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Новая запись: Участки"}),{target:{value:"Старый пользователь"}});fireEvent.click(screen.getByRole("button",{name:"Добавить"}));view.unmount();render(<CatalogsModal onClose={vi.fn()} onNotify={notify} workspace={workspace()}/>);fireEvent.change(screen.getByRole("textbox",{name:"Новая запись: Участки"}),{target:{value:"Новый пользователь"}});await act(async()=>pending.resolve(settings.sections[0]));expect(notify).not.toHaveBeenCalled();expect(screen.getByRole("textbox",{name:"Новая запись: Участки"})).toHaveValue("Новый пользователь");
  });
});

describe("EMU favorites",()=>{
  it("opens a real nested confirmation, traps pending dismissal and retains failure",async()=>{
    const pending=gate<void>(),remove=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined),close=vi.fn();
    render(<FavoritesModal employeeOptions={employees} onClose={close} onNotify={notify} workspace={workspace({removeFavoriteEmployee:remove})}/>);
    const parent=screen.getByRole("dialog",{name:"Избранные сотрудники ЭМУ"}),opener=within(parent).getAllByRole("button",{name:"Убрать"})[0];opener.focus();fireEvent.click(opener);let dialog=screen.getByRole("dialog",{name:"Убрать сотрудника из избранного?"});expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(window,{key:"Escape"});expect(screen.queryByRole("dialog",{name:"Убрать сотрудника из избранного?"})).not.toBeInTheDocument();expect(opener).toHaveFocus();
    fireEvent.click(opener);dialog=screen.getByRole("dialog",{name:"Убрать сотрудника из избранного?"});const submit=within(dialog).getByRole("button",{name:"Убрать из избранных"});fireEvent.click(submit);fireEvent.click(submit);expect(remove).toHaveBeenCalledOnce();expect(within(dialog).getByRole("button",{name:"Закрыть"})).toBeDisabled();fireEvent.keyDown(window,{key:"Escape"});expect(close).not.toHaveBeenCalled();
    await act(async()=>pending.reject(new Error("Не удалось сохранить")));expect(within(dialog).getByRole("alert")).toHaveTextContent("Не удалось сохранить");fireEvent.click(submit);await waitFor(()=>expect(screen.queryByRole("dialog",{name:"Убрать сотрудника из избранного?"})).not.toBeInTheDocument());expect(within(parent).getAllByRole("button",{name:"Убрать"})).toHaveLength(employees.length-1);expect(remove).toHaveBeenCalledTimes(2);
  });
  it("keeps acknowledged adds visible until the server settings catch up",async()=>{
    const add=vi.fn().mockResolvedValue({}),props={employeeOptions:employees,onClose:vi.fn(),onNotify:notify,workspace:{...workspace({addFavoriteEmployee:add}),settings:{...settings,favoriteEmployees:[]}}};const view=render(<FavoritesModal {...props}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Добавить"})[0]);await waitFor(()=>expect(screen.getByRole("button",{name:"Убрать"})).toBeInTheDocument());expect(screen.getAllByRole("button",{name:"Добавить"})).toHaveLength(employees.length-1);
    view.rerender(<FavoritesModal {...props} workspace={{...props.workspace,settings:{...props.workspace.settings,favoriteEmployees:[]}}}/>);expect(screen.getByRole("button",{name:"Убрать"})).toBeInTheDocument();
    view.rerender(<FavoritesModal {...props} workspace={{...props.workspace,settings:{...settings,favoriteEmployees:[settings.favoriteEmployees[0]]}}}/>);expect(screen.getByRole("button",{name:"Убрать"})).toBeInTheDocument();expect(add).toHaveBeenCalledOnce();
  });
});
