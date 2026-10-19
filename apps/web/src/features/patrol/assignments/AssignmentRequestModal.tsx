import { useEffect, useRef, useState } from "react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { PhoneDisclosure } from "../../../shared/ui/PhoneDisclosure";
import { AlertTriangle, Send } from "./AssignmentIcons";
import { AssignmentRouteChoice } from "./AssignmentRouteChoice";
import { shiftText, shiftTime } from "./assignmentDateUtils";
import type { ShiftTimeSettings } from "./assignmentTypes";
import type { DataSourceStatus, Employee, RouteDirectoryItem, RouteOption, ServiceRequest } from "../../../types";

export interface AssignmentRequestModalProps {
  canManage: boolean; comment: string; employee?: Employee;
  fieldErrors: Record<string, string[]>; favoriteEmployees: Employee[];
  hasConflict: boolean; isCreating: boolean; notificationText: string;
  onAssign: () => void | Promise<void>; onClose: () => void;
  onCommentChange: (value: string) => void; onPlannedDateChange: (value: string) => void;
  onPlannedStartChange: (value: string) => void; onPriorityChange: (value: "high" | "medium" | "low") => void;
  onSaveDraft: () => void | boolean; onSelectEmployee: (id: string) => void; onSelectRequest: (id: string) => void;
  onSelectRoute: (id: string) => void; plannedDate: string; plannedStart: string;
  priority: "high" | "medium" | "low"; requestListStatus: DataSourceStatus;
  requests: ServiceRequest[]; route?: RouteOption; routes: RouteOption[];
  routeDirectory: RouteDirectoryItem[]; selectedRouteId?: string;
  selectedRequestId: string; shiftSettings: ShiftTimeSettings;
}

export function AssignmentRequestModal(props: AssignmentRequestModalProps) {
  const { employee, isCreating, canManage, fieldErrors } = props;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const touched = useRef(false);
  const values = { employeeId: employee?.id ?? "", routeId: props.selectedRouteId ?? props.route?.id ?? "", requestId: props.selectedRequestId, date: props.plannedDate, time: props.plannedStart, priority: props.priority, comment: props.comment };
  const initialValues = useRef(values);
  const draft = JSON.stringify([employee?.id, props.selectedRouteId, props.selectedRequestId, props.plannedDate, props.plannedStart, props.priority, props.comment]);
  const initialDraft = useRef(draft);
  if (!touched.current) { initialDraft.current = draft; initialValues.current = values; }
  const busy = isCreating || pending;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: () => touched.current && draft !== initialDraft.current, pending: busy, onClose: () => {
    if (touched.current && draft !== initialDraft.current) {
      const initial = initialValues.current;
      props.onSelectEmployee(initial.employeeId); props.onSelectRoute(initial.routeId); props.onSelectRequest(initial.requestId);
      props.onPlannedDateChange(initial.date); props.onPlannedStartChange(initial.time); props.onPriorityChange(initial.priority); props.onCommentChange(initial.comment);
    }
    props.onClose();
  } });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const disabled = !canManage || !employee || !props.route || props.requestListStatus === "error" || busy;
  const changed = () => { touched.current = true; setError(""); };
  async function assign() {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try { await props.onAssign(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось отправить заявку. Повторите попытку."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }
  function saveDraft() {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    try {
      if (props.onSaveDraft() === false) throw new Error("Не удалось сохранить черновик. Введённые данные остаются в форме.");
      initialDraft.current = draft; initialValues.current = values; touched.current = false; setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось сохранить черновик."); }
    finally { queueMicrotask(() => { inFlight.current = false; }); }
  }
  // Keep a selected employee visible even if the favorites list changes while editing.
  const employees = employee && !props.favoriteEmployees.some((item) => item.id === employee.id)
    ? [employee, ...props.favoriteEmployees] : props.favoriteEmployees;
  const close = () => { if (!inFlight.current) requestClose(); };
  return <><ModalShell className="assign-am-request-modal assignment-request-v2" onClose={close} pending={busy}
    title="Создание заявки на обход" subtitle="Выберите маршрут и заполните параметры назначения."
    actions={<>
      <Button disabled={!canManage || !employee || !props.route || busy} onClick={saveDraft} variant="ghost">Сохранить как черновик</Button>
      <div className="assignment-submit-actions"><Button disabled={busy} onClick={close} variant="ghost">Отмена</Button>
        <Button disabled={disabled} onClick={() => void assign()} variant="primary"><Send size={17} />{busy ? "Отправка…" : "Отправить заявку"}</Button></div>
    </>}>
    {error || fieldErrors.form?.[0] ? <p className="field-error" role="alert">{error || fieldErrors.form?.[0]}</p> : null}
    <div className="assignment-request-layout" onChangeCapture={changed}>
      <aside className="assignment-request-sidebar">
        <PhoneDisclosure title={`Маршрут: ${props.route?.name ?? "выберите маршрут"}`}>
        <h3>Маршрут <span>{props.routes.length}</span></h3>
        <div className="assignment-route-list">{props.routes.map((route) => <AssignmentRouteChoice key={route.id} route={route}
          selected={props.selectedRouteId === route.id} onSelect={id => { changed(); props.onSelectRoute(id); }} disabled={busy}
          directory={props.routeDirectory.find((item) => item.id === route.id)} />)}</div>
        {!props.routes.length ? <p>Маршруты пока не загружены.</p> : null}
        </PhoneDisclosure>
        <PhoneDisclosure title="Сообщение сотруднику"><section className="assignment-message-preview"><h3>Предпросмотр</h3><p>{props.notificationText || "Выберите сотрудника, маршрут и время начала."}</p></section></PhoneDisclosure>
      </aside>
      <fieldset className="assignment-request-fields" disabled={busy || !canManage}>
        <label className="assignment-employee-field"><span>Сотрудник из избранного</span>
          <div className="assignment-employee-control">
          {employee ? <span className="assignment-employee-avatar" aria-hidden="true">{employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span> : null}
          <select aria-label="Сотрудник из избранного списка для обходов" value={employee?.id ?? ""} onChange={(e) => props.onSelectEmployee(e.currentTarget.value)}>
            <option disabled value="">Выберите сотрудника</option>
            {employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {employee ? <small>{employee.role} · {shiftText(employee.shift)} · {shiftTime(employee.shift, props.shiftSettings)}</small> : null}
          </div>
        </label>
        <label><span>Основание (необязательно)</span><select value={props.selectedRequestId} onChange={(e) => props.onSelectRequest(e.currentTarget.value)}>
          <option value="">Создать новую заявку</option>{props.selectedRequestId && !props.requests.some(request => request.id === props.selectedRequestId) ? <option value={props.selectedRequestId}>Основание недоступно — проверьте выбор</option> : null}{props.requests.map((request) => <option key={request.id} value={request.id}>{request.title} / {request.route}</option>)}
        </select>{fieldErrors.patrolRequestId ? <small className="field-error" role="alert">{fieldErrors.patrolRequestId[0]}</small> : null}</label>
        <div className="assignment-request-date-row">
          <label><span>Дата начала</span><input type="date" value={props.plannedDate} onChange={(e) => props.onPlannedDateChange(e.currentTarget.value)} /></label>
          <label><span>Время</span><input type="time" value={props.plannedStart} onChange={(e) => props.onPlannedStartChange(e.currentTarget.value)} /></label>
        </div>
        {fieldErrors.plannedAt ? <p className="field-error" role="alert">{fieldErrors.plannedAt[0]}</p> : null}
        <label><span>Приоритет</span><select value={props.priority} onChange={(e) => props.onPriorityChange(e.currentTarget.value as "high" | "medium" | "low")}>
          <option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option>
        </select></label>
        <label className="assignment-comment"><span>Комментарий (необязательно)</span>
          <textarea maxLength={300} value={props.comment} onChange={(e) => props.onCommentChange(e.currentTarget.value)} placeholder="Особенности обхода и зоны внимания…" />
          <small>{props.comment.length} / 300</small>
        </label>
        <p className="assignment-notification-note">Уведомление сотруднику будет создано после отправки заявки.</p>
        {props.hasConflict ? <div className="assign-am-warning" role="status"><AlertTriangle size={18} />Сотрудник или маршрут уже загружен в выбранную смену.</div> : null}
      </fieldset>
    </div>
  </ModalShell>{discardDialog}</>;
}
