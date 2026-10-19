import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { employeesFallback } from "../repositories/employeesRepository";
import { routesFallback, deleteLocalRoute, createApiRoutesRepository } from "../repositories/routesRepository";
import { createRoutePointDraft, updateRoutePointDraft } from "../domain/routes";
import { PatrolEmployeePickerModal } from "../features/patrol/EmployeesScreen";
import { EmployeeDirectoryPanel } from "../features/patrol/components/employees/EmployeeDirectoryPanel";
import { EmployeeProfileDrawer } from "../features/patrol/components/employees/EmployeeProfileDrawer";
import { EmployeeMobileAccessPanel } from "../features/patrol/components/employees/EmployeeMobileAccessPanel";
import { EmployeeFormModal } from "../features/patrol/components/employees/EmployeeFormModal";
import { RouteCreateModal } from "../features/patrol/components/routes/RouteCreateModal";
import { RoutePointTable } from "../features/patrol/components/routes/RoutePointTable";
import { RoutePointDrawer } from "../features/patrol/components/routes/RoutePointDrawer";
import { emptyRouteDraft } from "../features/patrol/components/routes/RouteEditorForm";
import { pointToDraft } from "../features/patrol/components/routes/PointEditorForm";
import { useRoutesEditor } from "../hooks/useRoutesEditor";
import type { EmployeeDirectoryItem, RouteDirectoryItem } from "../types";

const employees: EmployeeDirectoryItem[] = Array.from({ length: 130 }, (_, index) => ({ ...employeesFallback[0], id: `employee-${index}`, fullName: `Сотрудник ${index}`, personnelNo: `${index}` }));
const route: RouteDirectoryItem = { ...routesFallback[0], id: "route-one", versionNo: 1, points: [0, 1].map(index => ({ ...routesFallback[0].points[0], id: `point-${index}`, order: index + 1, name: `Точка ${index}`, description: "Описание оборудования", instruction: "Проверить уровень масла", tag: `TAG-${index}` })) };
function editorProps() {
  return { routeCreateIntent: 0, routeDirectory: [route], selectedRouteId: route.id, selectedPointId: route.points[0].id, onCreateRoute: vi.fn().mockResolvedValue("new"), onCreateRouteWithPoints: vi.fn().mockResolvedValue("new"), onCreateRoutePoint: vi.fn().mockResolvedValue("new-point"), onDeleteRoute: vi.fn().mockResolvedValue(undefined), onDeleteRoutePoint: vi.fn().mockResolvedValue(undefined), onNotify: vi.fn(), onSelectPoint: vi.fn(), onSelectRoute: vi.fn(), onUpdateRoute: vi.fn().mockResolvedValue(undefined), onUpdateRoutePoint: vi.fn().mockResolvedValue(undefined) };
}
const event = () => ({ preventDefault: vi.fn() } as never);

describe("Patrol directory editing and continuity", () => {
  it("offers employees beyond the old 120-row limit and keeps choices across pages and searches", async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(<PatrolEmployeePickerModal allEmployees={employees} initialSelectedIds={[employees[0].id]} onApply={onApply} onClose={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /Сотрудник/ })).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    fireEvent.click(screen.getByRole("button", { name: /Сотрудник 50 / }));
    fireEvent.change(screen.getByLabelText("Поиск"), { target: { value: "Сотрудник 125" } });
    fireEvent.click(screen.getByRole("button", { name: /Сотрудник 125 / }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить список" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([employees[0].id, employees[50].id, employees[125].id]));
  });
  it("keeps picker choices and shows a rejected save without closing", async () => {
    const onClose = vi.fn();
    render(<PatrolEmployeePickerModal allEmployees={employees.slice(0, 2)} initialSelectedIds={[]} onApply={vi.fn().mockRejectedValue(new Error("Сервер недоступен"))} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Сотрудник 1 / }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить список" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер недоступен");
    expect(screen.getByRole("button", { name: /Сотрудник 1 / })).toHaveAttribute("aria-pressed", "true");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("preserves the roster page through refresh and resets it when searching", () => {
    const props = { employees, onOpenCreate: vi.fn(), onSelectEmployee: vi.fn() };
    const view = render(<EmployeeDirectoryPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    view.rerender(<EmployeeDirectoryPanel {...props} employees={[...employees]} />);
    expect(screen.getByRole("button", { name: "Открыть профиль: Сотрудник 25" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Поиск сотрудников обхода"), { target: { value: "Сотрудник 125" } });
    expect(screen.getByRole("button", { name: "Открыть профиль: Сотрудник 125" })).toBeInTheDocument();
  });
  it("captures route and point drafts and target IDs instead of replacing them on refresh", async () => {
    const props = editorProps();
    const view = renderHook(useRoutesEditor, { initialProps: props });
    act(() => view.result.current.actions.selectPointForEdit(route.points[0].id));
    act(() => view.result.current.actions.setPointDraft({ ...view.result.current.pointDraft, name: "Мой ввод" }));
    const other = { ...route, id: "route-two", points: route.points.map(p => ({ ...p, id: `other-${p.id}`, name: "Изменено сервером" })) };
    view.rerender({ ...props, routeDirectory: [other], selectedRouteId: other.id, selectedPointId: other.points[0].id });
    expect(view.result.current.pointDraft.name).toBe("Мой ввод");
    await act(() => view.result.current.actions.submitPoint(event()));
    expect(props.onUpdateRoutePoint).toHaveBeenCalledWith(route.id, route.points[0].id, expect.objectContaining({ name: "Мой ввод" }));
  });
  it("retains an edited route and inline error on failure, then closes after a successful retry", async () => {
    const props = editorProps();
    props.onUpdateRoute.mockRejectedValueOnce(new Error("Конфликт изменения"));
    const { result } = renderHook(useRoutesEditor, { initialProps: props });
    act(() => result.current.actions.startRouteEdit());
    act(() => result.current.actions.setRouteDraft({ ...result.current.routeDraft, description: "Мои данные" }));
    await act(() => result.current.actions.submitRoute(event()));
    expect(result.current.routeEditorMode).toBe("edit");
    expect(result.current.error).toBe("Конфликт изменения");
    expect(result.current.routeDraft.description).toBe("Мои данные");
    await act(() => result.current.actions.submitRoute(event()));
    expect(result.current.routeEditorMode).toBeNull();
  });
  it("blocks duplicate point saves while a request is pending", async () => {
    const props = editorProps();
    let resolve!: () => void;
    props.onUpdateRoutePoint.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const { result } = renderHook(useRoutesEditor, { initialProps: props });
    act(() => result.current.actions.selectPointForEdit(route.points[0].id));
    let request!: Promise<void>;
    act(() => { request = result.current.actions.submitPoint(event()); void result.current.actions.submitPoint(event()); });
    expect(props.onUpdateRoutePoint).toHaveBeenCalledOnce();
    act(() => result.current.actions.cancelPointEdit());
    expect(result.current.pointEditorOpen).toBe(true);
    await act(async () => { resolve(); await request; });
    expect(result.current.pointEditorOpen).toBe(false);
  });
  it("ignores creation completion after the editing owner unmounts", async () => {
    const props = editorProps();
    let resolve!: (id: string) => void;
    props.onCreateRouteWithPoints.mockImplementation(() => new Promise<string>(done => { resolve = done; }));
    const view = renderHook(useRoutesEditor, { initialProps: props });
    let request!: Promise<void>;
    act(() => { request = view.result.current.actions.submitRouteWithPoints({ ...emptyRouteDraft, name: "Новый" }, []); });
    view.unmount();
    await act(async () => { resolve("new-route"); await request; });
    expect(props.onSelectRoute).not.toHaveBeenCalled();
    expect(props.onNotify).not.toHaveBeenCalled();
  });
  it("does not discard staged points when the route territory is edited; failed creation stays open", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("Нет связи"));
    function Harness() { const [draft, setDraft] = useState({ ...emptyRouteDraft, name: "Новый маршрут" }); return <RouteCreateModal draft={draft} isOpen onCancel={vi.fn()} onChange={setDraft} onSubmit={submit} />; }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Название точки"), { target: { value: "Котёл" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить точку" }));
    fireEvent.change(screen.getByLabelText("Территория"), { target: { value: "Участок 2" } });
    expect(screen.getByRole("button", { name: /Котёл/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать маршрут с точками (1)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
    expect(screen.getByLabelText("Территория")).toHaveValue("Участок 2");
    expect(screen.getByRole("button", { name: /Котёл/ })).toBeInTheDocument();
  });
  it("uses full route boundaries when a filtered list contains only its last point", async () => {
    const move = vi.fn().mockRejectedValue(new Error("Порядок не сохранён"));
    render(<RoutePointTable points={[route.points[1]]} route={route} selectedPointId="" onMovePoint={move} onSelectPoint={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ниже/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /выше/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Порядок не сохранён");
    expect(screen.getByRole("button", { name: /выше/ })).toBeEnabled();
  });
  it("shows both description and instruction in a read-only point dialog", () => {
    render(<RoutePointDrawer canManage={false} draft={pointToDraft(route.points[0])} editorMode="edit" isOpen point={route.points[0]} route={route} onCancel={vi.fn()} onChange={vi.fn()} onCreate={vi.fn()} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Просмотр точки" });
    expect(within(dialog).getByText("Описание оборудования", { selector: "p" })).toBeInTheDocument();
    expect(within(dialog).getByText("Проверить уровень масла")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Сохранить точку" })).not.toBeInTheDocument();
  });
  it("keeps an employee form after failed save and disables assignment without permission", async () => {
    const onClose = vi.fn();
    render(<EmployeeFormModal mode="edit" employee={employees[0]} onClose={onClose} onSubmit={vi.fn().mockRejectedValue(new Error("Ошибка сохранения"))} />);
    fireEvent.change(screen.getByLabelText("ФИО"), { target: { value: "Изменённое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ошибка сохранения");
    expect(screen.getByLabelText("ФИО")).toHaveValue("Изменённое имя");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("requires explicit deactivation confirmation and keeps its error in the dialog", async () => {
    const deactivate = vi.fn().mockRejectedValue(new Error("Сотрудник занят"));
    render(<EmployeeProfileDrawer canAssign={false} employee={employees[0]} onDeactivateEmployee={deactivate} onEditEmployee={vi.fn()} onNavigate={vi.fn()} onRemoveFromPatrol={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Назначить маршрут" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Деактивировать в справочнике" }));
    expect(deactivate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Деактивировать" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сотрудник занят");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("shows account navigation in employee help only with mobile account management permission", () => {
    const navigate = vi.fn(); const view = render(<EmployeeMobileAccessPanel onNavigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Помощь" }));
    expect(screen.queryByRole("button", { name: "Открыть мобильные аккаунты" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("с правом управления мобильными аккаунтами");
    view.rerender(<EmployeeMobileAccessPanel canManageAccounts onNavigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть мобильные аккаунты" })); expect(navigate).toHaveBeenCalledWith("accounts");
  });
  it("marks deactivation as busy and blocks dismissal and repeat submission until the result", async () => {
    let reject!: (error: Error) => void;
    const deactivate = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<EmployeeProfileDrawer employee={employees[0]} onDeactivateEmployee={deactivate} onEditEmployee={vi.fn()} onNavigate={vi.fn()} onRemoveFromPatrol={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Деактивировать в справочнике" }));
    const dialog = screen.getByRole("dialog", { name: "Деактивировать сотрудника?" });
    const submit = within(dialog).getByRole("button", { name: "Деактивировать" }); fireEvent.click(submit); fireEvent.click(submit);
    expect(dialog).toHaveAttribute("aria-busy", "true"); expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" }); expect(dialog).toBeInTheDocument(); expect(deactivate).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("Сотрудник занят")); });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Сотрудник занят"); expect(submit).toBeEnabled();
  });
  it("keeps route history and points when archiving in mock mode", () => {
    const archived = deleteLocalRoute([route], route.id);
    expect(archived).toHaveLength(1);
    expect(archived[0]).toEqual({ ...route, status: "Архив" });
  });
  it("keeps photos voluntary when editing an old point with a required-photo flag", async () => {
    const point = { ...route.points[0], requiresPhoto: true };
    const draft = pointToDraft(point);
    expect(draft.requiresPhoto).toBe(false);
    expect(updateRoutePointDraft(point, draft).requiresPhoto).toBe(false);
    const { requiresPhoto: _photo, ...oldDraft } = draft;
    expect(updateRoutePointDraft(point, oldDraft).requiresPhoto).toBe(false);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      await createApiRoutesRepository({ baseUrl: "http://api.test" }).updateRoutePoint(route.id, point.id, draft);
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ requiresPhoto: false });
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps an unset tag empty rather than turning a display placeholder into a tag code", () => {
    const point = createRoutePointDraft({ routeId: route.id, order: 1, payload: { ...pointToDraft(route.points[0]), tag: "" } });
    expect(point.tag).toBe("");
  });
  it("keeps the opened route version for conflict detection after a background refresh", async () => {
    const props = editorProps();
    const view = renderHook(useRoutesEditor, { initialProps: props });
    act(() => view.result.current.actions.startRouteEdit());
    view.rerender({ ...props, routeDirectory: [{ ...route, versionNo: 2, description: "Изменено другим оператором" }] });
    expect(view.result.current.routeDraft.expectedVersionNo).toBe(1);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...route, points: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    try {
      await createApiRoutesRepository({ baseUrl: "http://api.test" }).updateRoute(route.id, view.result.current.routeDraft, 2);
      expect(JSON.parse(fetcher.mock.calls[0][1].body).expectedVersionNo).toBe(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
