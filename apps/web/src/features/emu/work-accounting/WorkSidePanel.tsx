import { useEffect, useState } from "react";
import type { EmuDecisionDto, EmuEmployeeShiftSummaryDto, EmuWorkSessionDto } from "../../../api/contracts";
import type { EmuWorkspace } from "../../../hooks/useEmuWorkspace";
import { calculateLiveWorkSessionMinutes } from "../../../domain/emuWorkTime";
import type { EmuEmployeeWorkload } from "../../../domain/emuWorkBoard";
import { WorkSummary } from "./components/WorkSummary";
import { DecisionList } from "./side/DecisionPanels";
import { EmployeeWorkloadPanel } from "./side/EmployeeWorkloadPanel";
import { ShiftAdjustModal, ShiftSummaryPanel } from "./side/ShiftPanels";
import { activeEmployeeStatus, employeeStatusLabel, employeeWorkloadLabel, formatEmployeeShortName, formatMinutes, initials, toDateInput } from "./workAccountingUtils";

export { ResolveDecisionModal } from "./side/DecisionPanels";

export function WorkSidePanel({
  canAdjustShift,
  canCreate,
  canComplete,
  canPause,
  canResolveDecision,
  canUpdate,
  decisions,
  employeeWorkload,
  now,
  onAddEmployee,
  onCreateForEmployee,
  onFinishEmployee,
  onMistakenEmployee,
  onNotify,
  onPauseEmployee,
  onResumeEmployee,
  onResolveDecision,
  onSelectEmployee,
  onSelectWork,
  problemWork,
  selectedEmployee,
  selectedWork,
  workspace,
  workSessions,
}: {
  canAdjustShift: boolean;
  canCreate: boolean;
  canComplete: boolean;
  canPause: boolean;
  canResolveDecision: boolean;
  canUpdate: boolean;
  decisions: EmuDecisionDto[];
  employeeWorkload: EmuEmployeeWorkload[];
  now: Date;
  onAddEmployee: (workId: string) => void;
  onCreateForEmployee: (employeeId: string) => void;
  onFinishEmployee: (workId: string, employeeId: string) => void;
  onMistakenEmployee: (workId: string, employeeId: string) => void;
  onNotify: (message: string) => void;
  onPauseEmployee: (workId: string, employeeId: string) => void;
  onResumeEmployee: (workId: string, employeeId: string) => void;
  onResolveDecision: (decision: EmuDecisionDto) => void;
  onSelectEmployee: (employeeId: string) => void;
  onSelectWork: (workId: string) => void;
  problemWork: EmuWorkSessionDto[];
  selectedEmployee?: EmuEmployeeWorkload;
  selectedWork?: EmuWorkSessionDto;
  workspace: EmuWorkspace;
  workSessions: EmuWorkSessionDto[];
}) {
  const [shiftSummary, setShiftSummary] = useState<EmuEmployeeShiftSummaryDto | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const shiftDate = toDateInput(now);

  useEffect(() => {
    if (!selectedEmployee) {
      setShiftSummary(null);
      setShiftLoading(false);
      return;
    }

    let cancelled = false;
    setShiftLoading(true);
    void workspace.actions
      .getEmployeeShiftSummary(selectedEmployee.employeeId, shiftDate)
      .then((summary) => {
        if (!cancelled) {
          setShiftSummary(summary);
          void workspace.actions.getDecisions("new");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShiftSummary(null);
          onNotify(error instanceof Error ? error.message : "Не удалось загрузить сменную сводку сотрудника");
        }
      })
      .finally(() => {
        if (!cancelled) setShiftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onNotify, selectedEmployee, shiftDate, workspace.actions]);

  if (selectedWork) {
    const liveMinutes = calculateLiveWorkSessionMinutes(selectedWork, now);
    const workDecisions = decisions.filter((decision) => decision.workSessionId === selectedWork.id);
    return (
      <aside className="emu-panel emu-work-side-panel">
        <WorkSummary work={selectedWork} />
        <DecisionList
          canResolveDecision={canResolveDecision}
          decisions={workDecisions}
          emptyText=""
          onResolve={onResolveDecision}
          title="Требует решения"
        />
        <dl className="emu-kv">
          <div><dt>Статус</dt><dd>{selectedWork.operationalStatus || selectedWork.status}</dd></div>
          <div><dt>Работа</dt><dd>{formatMinutes(liveMinutes.workMinutes)}</dd></div>
          <div><dt>Пауза</dt><dd>{formatMinutes(liveMinutes.waitingMinutes + liveMinutes.otherWorkMinutes)}</dd></div>
        </dl>
        {canUpdate && !selectedWork.completedAt ? (
          <button className="emu-secondary-button" onClick={() => onAddEmployee(selectedWork.id)} type="button">+ Добавить сотрудника</button>
        ) : null}
        <div className="emu-side-list">
          {selectedWork.employees.map((employee) => {
            const employeeMinutes = liveMinutes.employeesById.get(employee.employeeId);
            const status = activeEmployeeStatus(employee);
            const label = employeeStatusLabel(status);
            const isWorking = label === "Работает";
            const isPaused = label === "На паузе" || status === "В ожидании" || status === "На другой работе";
            const isFinished = Boolean(employee.finishedAt);
            return (
              <div className="emu-side-employee-card" key={employee.employeeId}>
                <button onClick={() => onSelectEmployee(employee.employeeId)} type="button">
                  <strong>{formatEmployeeShortName(employee.fullNameSnapshot)}</strong>
                  <span>{label}</span>
                  <small>работа {formatMinutes(employeeMinutes?.personalWorkMinutes ?? employee.workMinutes)} · пауза {formatMinutes(employeeMinutes?.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes)}</small>
                  {employee.currentPauseReason ? <em>{employee.currentPauseReason}</em> : null}
                </button>
                {!selectedWork.completedAt ? (
                  <div className="emu-side-employee-actions">
                    {canPause && isWorking && !isFinished ? <button onClick={() => onPauseEmployee(selectedWork.id, employee.employeeId)} type="button">Пауза</button> : null}
                    {canPause && isPaused && !isFinished ? <button onClick={() => onResumeEmployee(selectedWork.id, employee.employeeId)} type="button">Вернуть</button> : null}
                    {canComplete && !isFinished ? <button onClick={() => onFinishEmployee(selectedWork.id, employee.employeeId)} type="button">Завершить участие</button> : null}
                    {canUpdate && !isFinished ? <button className="danger" onClick={() => onMistakenEmployee(selectedWork.id, employee.employeeId)} type="button">Ошибочно</button> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  if (selectedEmployee) {
    const activeWork = workSessions.filter((work) => selectedEmployee.workSessionIds.includes(work.id));
    const recentWork = workSessions
      .filter((work) => work.employees.some((employee) => employee.employeeId === selectedEmployee.employeeId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
    const employeeDecisions = decisions.filter((decision) => decision.employeeId === selectedEmployee.employeeId);

    return (
      <aside className="emu-panel emu-work-side-panel">
        <div className="emu-side-profile">
          <span>{initials(selectedEmployee.fullName)}</span>
          <div>
            <h3>{selectedEmployee.fullName}</h3>
            <p>{selectedEmployee.position || selectedEmployee.department}</p>
          </div>
          <em className={`emu-workload-pill status-${selectedEmployee.status}`}>{employeeWorkloadLabel(selectedEmployee.status)}</em>
        </div>
        {canCreate && selectedEmployee.status === "free" ? (
          <button className="emu-primary-button" onClick={() => onCreateForEmployee(selectedEmployee.employeeId)} type="button">Создать работу</button>
        ) : null}
        <div className="emu-side-list">
          <strong>Текущие карточки</strong>
          {activeWork.length ? activeWork.map((work) => (
            <button key={work.id} onClick={() => onSelectWork(work.id)} type="button">
              <span>{work.workNumber}</span>
              <small>{work.sectionName} · {work.taskDescription}</small>
            </button>
          )) : <p>Активных карточек нет.</p>}
        </div>
        <ShiftSummaryPanel
          canAdjustShift={canAdjustShift}
          canResolveDecision={canResolveDecision}
          loading={shiftLoading}
          onAdjust={() => setShiftModalOpen(true)}
          onResolveDecision={onResolveDecision}
          summary={shiftSummary}
        />
        <DecisionList
          canResolveDecision={canResolveDecision}
          decisions={employeeDecisions}
          emptyText=""
          onResolve={onResolveDecision}
          title="Открытые решения"
        />
        <div className="emu-side-list">
          <strong>Краткая история</strong>
          {recentWork.map((work) => (
            <button key={work.id} onClick={() => onSelectWork(work.id)} type="button">
              <span>{work.workDate} · {work.workNumber}</span>
              <small>{work.sectionName} · {work.resultStatus || work.operationalStatus}</small>
            </button>
          ))}
        </div>
        {shiftModalOpen && shiftSummary ? (
          <ShiftAdjustModal
            onClose={() => setShiftModalOpen(false)}
            onNotify={onNotify}
            onSaved={(shift) => setShiftSummary((current) => (current ? { ...current, shift } : current))}
            shiftSummary={shiftSummary}
            workspace={workspace}
          />
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="emu-panel emu-work-side-panel">
      <EmployeeWorkloadPanel
        canCreate={canCreate}
        employees={employeeWorkload}
        onCreateForEmployee={onCreateForEmployee}
        onSelectEmployee={onSelectEmployee}
        onSelectWork={onSelectWork}
      />
      <DecisionList
        canResolveDecision={canResolveDecision}
        decisions={decisions}
        emptyText="Спорных ситуаций нет."
        onResolve={onResolveDecision}
        title="Требует решения"
      />
      <div className="emu-side-list">
        <strong>Проблемные карточки</strong>
        {problemWork.length ? problemWork.map((work) => (
          <button key={work.id} onClick={() => onSelectWork(work.id)} type="button">
            <span>{work.workNumber}</span>
            <small>{work.sectionName} · {work.taskDescription}</small>
          </button>
        )) : <p>Проблемных карточек нет.</p>}
      </div>
    </aside>
  );
}

