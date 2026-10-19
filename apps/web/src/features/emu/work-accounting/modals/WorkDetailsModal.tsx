import { useState } from "react";
import type { EmuWorkSessionDto } from "../../../../api/contracts";
import { buildApiUrl } from "../../../../api/client";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { calculateLiveWorkSessionMinutes } from "../../../../domain/emuWorkTime";
import { Button, CompactTable, SectionTabs } from "../../../../shared/ui";
import { ModalFrame } from "../components/ModalFrame";
import { WorkSummary } from "../components/WorkSummary";
import { WorkHistoryPanel } from "../components/WorkHistoryPanel";
import { WorkEmployeeActions, type WorkEmployeeAction, type WorkEmployeePermissions } from "../components/WorkEmployeeActions";
import { activeEmployeeStatus, employeeStatusLabel, formatDateTime, formatMinutes, formatTime, resolveWorkCardState, workStateLabel } from "../workAccountingUtils";

export type WorkDetailsControls = WorkEmployeePermissions & {
  onEdit: () => void;
  onAddEmployee: () => void;
  onComplete: () => void;
  onEmployeeAction: (action: WorkEmployeeAction, employeeId: string) => void;
};

export function WorkDetailsModal({ canViewAudit, controls, now, onClose, workspace, work }: { canViewAudit: boolean; controls?: WorkDetailsControls; now: Date; onClose: () => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [tab, setTab] = useState<"people" | "attachments" | "history">("people");
  const live = calculateLiveWorkSessionMinutes(work, now);
  const attachments = work.attachments ?? [];
  const editable = controls && !work.completedAt && !work.deletedAt;
  const showEmployeeActions = editable && (controls.canPause || controls.canComplete || controls.canUpdate);
  return <ModalFrame className="emu-work-details-modal" wide onClose={onClose} title="Карточка работы" subtitle={`${work.workNumber} · ${work.sectionName}`} actions={<div className="emu-work-details-actions">
    {editable && controls.canUpdate ? <><Button onClick={controls.onEdit} variant="secondary">Изменить</Button><Button onClick={controls.onAddEmployee} variant="secondary">Добавить сотрудника</Button></> : null}
    {editable && controls.canComplete ? <Button onClick={controls.onComplete} variant="primary">Завершить работу</Button> : null}
    <Button className="emu-work-details-close" onClick={onClose} variant="ghost">Закрыть карточку</Button>
  </div>}>
    <WorkSummary work={work} showEmployees={false} now={now} />
    <div className="emu-work-details-facts">
      <div><span>Состояние</span><strong>{work.completedAt ? work.resultStatus || "Завершено" : workStateLabel(resolveWorkCardState(work))}</strong></div>
      <div><span>Работа карточки</span><strong>{formatMinutes(live.workMinutes)}</strong></div>
      <div><span>Пауза сотрудников</span><strong>{formatMinutes(live.waitingMinutes + live.otherWorkMinutes)}</strong></div>
      <div><span>Приход</span><strong>{formatDateTime(work.arrivedAt)}</strong></div>
    </div>
    {work.resultComment ? <section className="emu-work-result"><h3>Результат работы</h3><p>{work.resultComment}</p></section> : null}
    <SectionTabs ariaLabel="Разделы карточки работы" value={tab} onChange={setTab} tabs={[{ id: "people", label: "Сотрудники", count: work.employees.length }, { id: "attachments", label: "Вложения", count: attachments.length }, ...(canViewAudit ? [{ id: "history" as const, label: "История" }] : [])]} />
    {tab === "people" ? <CompactTable className="emu-work-people-table" getRowKey={employee => employee.id} rows={work.employees} emptyText="В карточке нет сотрудников" columns={[
      { key: "person", header: "Сотрудник", render: employee => <div className="emu-work-person-name"><strong>{employee.fullNameSnapshot}</strong><small>{employee.positionSnapshot}</small><small>Приход {formatTime(employee.arrivedAt)}{employee.finishedAt ? ` · завершил ${formatTime(employee.finishedAt)}` : ""}</small></div> },
      { key: "status", header: "Состояние", width: "160px", render: employee => <div className="emu-work-person-state"><span>{employeeStatusLabel(activeEmployeeStatus(employee))}</span>{employee.currentPauseReason ? <small>{employee.currentPauseReason}</small> : null}</div> },
      { key: "work", header: "Работа", width: "100px", render: employee => formatMinutes(live.employeesById.get(employee.employeeId)?.personalWorkMinutes ?? employee.workMinutes) },
      { key: "pause", header: "Пауза", width: "100px", render: employee => formatMinutes(live.employeesById.get(employee.employeeId)?.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes) },
      ...(showEmployeeActions ? [{ key: "actions", header: "Действия", width: "230px", render: (employee: EmuWorkSessionDto["employees"][number]) => <WorkEmployeeActions employee={employee} permissions={controls} onAction={controls.onEmployeeAction} /> }] : []),
    ]} /> : null}
    {tab === "attachments" ? <div className="emu-work-attachment-list">{attachments.length ? attachments.map(file => <a href={buildApiUrl(file.downloadUrl)} key={file.fileId} rel="noreferrer" target="_blank"><span className="emu-work-file-type">{file.contentType.startsWith("image/") ? "Фото" : file.contentType.startsWith("video/") ? "Видео" : "Файл"}</span><span><strong>{file.fileName}</strong><small>{Math.max(1, Math.round(file.sizeBytes / 1024))} КБ · {formatDateTime(file.uploadedAt)}</small></span><span>Открыть ↗</span></a>) : <p className="emu-work-detail-empty">К этой работе вложения не добавлены.</p>}</div> : null}
    {tab === "history" && canViewAudit ? <WorkHistoryPanel key={work.id} workId={work.id} workspace={workspace} /> : null}
  </ModalFrame>;
}
