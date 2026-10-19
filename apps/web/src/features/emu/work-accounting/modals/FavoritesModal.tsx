import "./emuDirectories.css";
import { useEffect, useState } from "react";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { Button } from "../../../../shared/ui";
import type { EmuEmployeeOption } from "../types";
import { ModalFrame } from "../components/ModalFrame";
import { WorkFormActions } from "../components/WorkFormActions";
import { filterEmployees } from "../workAccountingUtils";
import { useEmuDialogSession } from "../useEmuDialogSession";

export function FavoritesModal({ employeeOptions, onClose, onNotify, workspace }: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const session = useEmuDialogSession({ onClose, onNotify });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pane, setPane] = useState("favorites");
  const [employeeToRemove, setEmployeeToRemove] = useState<EmuEmployeeOption | null>(null);
  // Acknowledged writes remain visible while a slower settings refresh catches up.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const favorites = workspace.settings.favoriteEmployees;
  useEffect(() => {
    setAccepted(current => {
      const pending = Object.fromEntries(Object.entries(current).filter(([id, active]) => favorites.some(item => item.employeeId === id && item.isActive) !== active));
      return Object.keys(pending).length === Object.keys(current).length ? current : pending;
    });
  }, [favorites]);
  const selected = new Map<string, EmuEmployeeOption>(favorites.filter(item => item.isActive && accepted[item.employeeId] !== false).map(item => [item.employeeId, { ...item, id: item.employeeId, status: item.status as EmuEmployeeOption["status"] }]));
  for (const employee of employeeOptions) if (accepted[employee.id] === true) selected.set(employee.id, employee);
  const favoriteEmployees = [...selected.values()];
  const candidates = filterEmployees(employeeOptions, search).filter(employee => !selected.has(employee.id));
  const totalPages = Math.max(1, Math.ceil(candidates.length / pageSize));
  const currentPage = Math.min(page, totalPages), pageStart = (currentPage - 1) * pageSize;
  const visibleCandidates = candidates.slice(pageStart, pageStart + pageSize);
  const error = session.error ? <p className="emu-work-form-error" role="alert">{session.error}</p> : null;
  const confirmClose = () => { if (!session.pending) setEmployeeToRemove(null); };

  return <><ModalFrame className="emu-favorites-modal-frame" title="Избранные сотрудники ЭМУ" subtitle="Быстрый выбор сотрудников для назначения работ" wide
    onClose={session.close} pending={session.pending} leaveDialog={session.leaveDialog}
    actions={<div className="emu-directory-actions">{employeeToRemove ? null : error}<p role="status">{session.pending ? "Сохраняем изменения…" : `В избранном: ${favoriteEmployees.length}. Добавление и удаление сохраняются сразу.`}</p><Button disabled={session.pending} onClick={session.close} variant="primary">Готово</Button></div>}>
    <div className="emu-favorite-switch" role="group" aria-label="Список сотрудников">
      <button type="button" aria-pressed={pane === "favorites"} onClick={() => setPane("favorites")}>Избранные ({favoriteEmployees.length})</button>
      <button type="button" aria-pressed={pane === "catalog"} onClick={() => setPane("catalog")}>Добавить сотрудников</button>
    </div>
    <div className="emu-favorite-grid" data-pane={pane}>
      <section className="emu-reference-block emu-favorite-selected" aria-label="Избранные сотрудники">
        <div className="emu-reference-heading"><div><h4>Избранные сотрудники</h4><span>Закреплены для быстрых назначений</span></div><em>{favoriteEmployees.length}</em></div>
        <div className="emu-reference-list">{favoriteEmployees.map(employee => <div className="emu-reference-row" key={employee.id}>
          <span><strong>{employee.fullName}</strong><small>{employee.position || employee.department}</small></span>
          <button type="button" onClick={() => setEmployeeToRemove(employee)}>Убрать</button>
        </div>)}{favoriteEmployees.length === 0 ? <div className="emu-empty-state">Список пока пуст. Добавьте сотрудников из общего справочника.</div> : null}</div>
      </section>
      <section className="emu-reference-block emu-favorite-candidates" aria-label="Общий справочник сотрудников">
        <div className="emu-reference-heading"><div><h4>Общий справочник сотрудников</h4><span>Найдено {candidates.length} · страница {currentPage} из {totalPages}</span></div><em>{candidates.length}</em></div>
        <div className="emu-reference-toolbar"><label>Поиск сотрудников<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="ФИО, должность, подразделение" /></label>
          <label>Показать<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10,25,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <div className="emu-reference-list">{visibleCandidates.map(employee => <div className="emu-reference-row" key={employee.id}>
          <span><strong>{employee.fullName}</strong><small>{employee.position || employee.department}</small></span>
          <button type="button" onClick={() => void session.run(() => workspace.actions.addFavoriteEmployee({ employeeId: employee.id }), "Сотрудник добавлен в избранное ЭМУ", () => setAccepted(current => ({ ...current, [employee.id]: true })))}>Добавить</button>
        </div>)}{candidates.length === 0 ? <div className="emu-empty-state">{search ? "По запросу ничего не найдено" : "Все доступные сотрудники уже в избранном"}</div> : null}</div>
        <div className="emu-pagination"><span>{candidates.length ? `${pageStart + 1}–${Math.min(pageStart + pageSize, candidates.length)} из ${candidates.length}` : "Нет сотрудников"}</span>
          <div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} type="button">Назад</button><strong>{currentPage}</strong><button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} type="button">Вперёд</button></div>
        </div>
      </section>
    </div>
  </ModalFrame>{employeeToRemove ? <ModalFrame title="Убрать сотрудника из избранного?" onClose={confirmClose} pending={session.pending}
    actions={<WorkFormActions error={session.error} pending={session.pending} onClose={confirmClose} onSubmit={() => void session.run(() => workspace.actions.removeFavoriteEmployee(employeeToRemove.id), "Сотрудник скрыт из избранного ЭМУ", () => { setAccepted(current => ({ ...current, [employeeToRemove.id]: false })); setEmployeeToRemove(null); })} label="Убрать из избранных" danger />}>
    <p><strong>{employeeToRemove.fullName}</strong></p><p>Сотрудник будет скрыт только из быстрого списка. История работ и общий справочник сотрудников не изменятся.</p>
  </ModalFrame> : null}</>;
}
