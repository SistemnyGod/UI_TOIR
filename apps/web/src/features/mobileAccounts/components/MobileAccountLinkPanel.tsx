import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { EmployeeDirectoryItem, MobileAccount } from "../../../types";
import { AccountModalIcon, AccountPanelCard, CloseIcon, displayKnownValue, EmployeeAvatar, getInitials, MAX_BOUND_EMPLOYEES, readFieldErrors, SelectedEmployeeCard, uniqueSorted } from "./accountFormParts";
import { useAccountPanelState } from "./useAccountPanelState";

export function MobileAccountLinkPanel({
  employeeDirectory,
  selected,
  onAttachEmployee,
  onBindEmployees,
  onClose,
  onSaved,
  onDirtyChange,
  onDetachEmployee,
  onNotify,
}: {
  employeeDirectory: EmployeeDirectoryItem[];
  selected?: MobileAccount;
  onAttachEmployee: (employeeId: string, employeeName: string) => Promise<void> | void;
  onBindEmployees?: (employeeIds: string[]) => Promise<void> | void;
  onClose?: () => void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDetachEmployee?: (employeeId?: string) => Promise<void> | void;
  onNotify: (message: string) => void;
}) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(() => selected?.boundEmployeeIds ?? []);
  const initialIds = useRef(selected?.boundEmployeeIds ?? []);
  const lifecycle = useAccountPanelState(selected?.id, JSON.stringify([...selectedEmployeeIds].sort()) !== JSON.stringify([...initialIds.current].sort()), onDirtyChange);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    initialIds.current = selected?.boundEmployeeIds ?? [];
    setSelectedEmployeeIds(initialIds.current);
    setSearch("");
    setZoneFilter("all");
    setRoleFilter("all");
    setErrorMessage("");
  }, [selected?.id]);

  const directoryById = useMemo(
    () => new Map(employeeDirectory.map((employee) => [employee.id, employee])),
    [employeeDirectory],
  );

  const boundFallbackEmployees = useMemo(() => {
    const boundNames = selected?.boundEmployees ?? [];
    const ids = selected?.boundEmployeeIds ?? [];

    return boundNames
      .map((fullName, index) => ({
        id: ids[index] ?? `bound-name-${index}`,
        fullName,
        initials: getInitials(fullName),
        personnelNo: "",
        position: "Сотрудник",
        department: "",
        employeeGroup: "",
        birthDate: "",
        zone: "",
        status: "Активен" as EmployeeDirectoryItem["status"],
        routesDone: 0,
        routesTotal: 0,
        mobileStatus: "Привязан" as EmployeeDirectoryItem["mobileStatus"],
        lastSeen: "",
        phone: "",
        hiredAt: "",
        brigade: "",
        shift: "",
        leader: "",
        email: "",
      }))
      .filter((employee) => !directoryById.has(employee.id));
  }, [directoryById, selected?.boundEmployeeIds, selected?.boundEmployees]);

  const employeePool = useMemo(
    () => [...employeeDirectory, ...boundFallbackEmployees],
    [boundFallbackEmployees, employeeDirectory],
  );

  const selectedEmployees = selectedEmployeeIds
    .map((employeeId) => employeePool.find((employee) => employee.id === employeeId))
    .filter((employee): employee is EmployeeDirectoryItem => Boolean(employee));

  const selectedIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds]);
  const zones = useMemo(() => uniqueSorted(employeeDirectory.map((employee) => employee.zone)), [employeeDirectory]);
  const roles = useMemo(() => uniqueSorted(employeeDirectory.map((employee) => employee.position)), [employeeDirectory]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employeeDirectory.filter((employee) => {
      const matchesSearch =
        query.length === 0 ||
        [
          employee.fullName,
          employee.personnelNo,
          employee.phone,
          employee.email,
          employee.position,
          employee.department,
          employee.zone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesZone = zoneFilter === "all" || employee.zone === zoneFilter;
      const matchesRole = roleFilter === "all" || employee.position === roleFilter;

      return matchesSearch && matchesZone && matchesRole;
    });
  }, [employeeDirectory, roleFilter, search, zoneFilter]);

  const canAddMore = selectedEmployeeIds.length < MAX_BOUND_EMPLOYEES;
  const canSubmit =
    Boolean(selected) &&
    selectedEmployeeIds.length >= 1 &&
    selectedEmployeeIds.length <= MAX_BOUND_EMPLOYEES &&
    !isSubmitting;

  function addEmployee(employee: EmployeeDirectoryItem) {
    setErrorMessage("");

    if (selectedIdSet.has(employee.id)) return;

    if (!canAddMore) {
      setErrorMessage(`К одному аккаунту можно привязать не более ${MAX_BOUND_EMPLOYEES} сотрудников.`);
      return;
    }

    setSelectedEmployeeIds((current) => [...current, employee.id]);
  }

  function removeEmployee(employeeId: string) {
    setErrorMessage("");
    setSelectedEmployeeIds((current) => current.filter((id) => id !== employeeId));
  }

  async function submitBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lifecycle.inFlight.current) return;

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт.");
      return;
    }

    if (selectedEmployeeIds.length < 1) {
      setErrorMessage("Выберите хотя бы одного сотрудника.");
      return;
    }

    if (selectedEmployeeIds.length > MAX_BOUND_EMPLOYEES) {
      setErrorMessage(`К одному аккаунту можно привязать не более ${MAX_BOUND_EMPLOYEES} сотрудников.`);
      return;
    }

    lifecycle.inFlight.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      if (onBindEmployees) {
        await onBindEmployees(selectedEmployeeIds);
      } else {
        const existingIds = selected.boundEmployeeIds ?? [];
        const addedIds = selectedEmployeeIds.filter((employeeId) => !existingIds.includes(employeeId));
        const removedIds = existingIds.filter((employeeId) => !selectedEmployeeIds.includes(employeeId));

        for (const employeeId of removedIds) {
          if (!lifecycle.isCurrent()) return;
          await onDetachEmployee?.(employeeId);
        }

        for (const employeeId of addedIds) {
          if (!lifecycle.isCurrent()) return;
          const employee = directoryById.get(employeeId);
          if (employee) await onAttachEmployee(employee.id, employee.fullName);
        }
      }

      if (lifecycle.isCurrent()) (onSaved ?? onClose)?.();
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      const fieldErrors = readFieldErrors(error);
      setErrorMessage(
        fieldErrors.employeeId?.[0] ??
          fieldErrors.employeeIds?.[0] ??
          (error instanceof Error ? error.message : "Не удалось привязать сотрудников."),
      );
    } finally {
      if (lifecycle.isCurrent()) { lifecycle.inFlight.current = false; setIsSubmitting(false); }
    }
  }

  return (
    <AccountPanelCard
      title="Привязка сотрудника к аккаунту"
      note="Выберите от 1 до 5 сотрудников, которые смогут работать через этот мобильный аккаунт."
      onClose={onClose}
    >
      <form className="account-panel-form employee-binding-modal" onSubmit={submitBinding}>
        <section className="employee-binding-account">
          <div className="employee-binding-account-icon" aria-hidden="true">
            <AccountModalIcon name="phone" />
          </div>
          <div>
            <span>Аккаунт</span>
            <strong>{selected?.login ?? "Аккаунт не выбран"}</strong>
            <small>{selected ? `${displayKnownValue(selected.role)} · ${displayKnownValue(selected.status)}` : "Выберите строку в таблице аккаунтов"}</small>
          </div>
          <div>
            <span>Устройство</span>
            <strong>{selected?.device || "-"}</strong>
            <small>{selected?.version || "Версия не определена"}</small>
          </div>
          <div>
            <span>Сессия</span>
            <strong>{selected?.session ? displayKnownValue(selected.session) : "-"}</strong>
            <small>{selected?.lastSeen || "Активности нет"}</small>
          </div>
        </section>

        <section className="employee-binding-selected">
          <div className="employee-binding-section-head">
            <div>
              <h4>Привязанные сотрудники ({selectedEmployeeIds.length}/{MAX_BOUND_EMPLOYEES})</h4>
              <p>Сотрудника можно удалить из выбранных через X до сохранения.</p>
            </div>
            <div className="employee-binding-help">
              <AccountModalIcon name="info" />
              <span>Один мобильный аккаунт поддерживает до 5 сотрудников.</span>
            </div>
          </div>

          <div className="employee-binding-selected-list">
            {selectedEmployees.length > 0 ? (
              selectedEmployees.map((employee) => (
                <SelectedEmployeeCard
                  employee={employee}
                  key={employee.id}
                  onRemove={() => removeEmployee(employee.id)}
                />
              ))
            ) : (
              <span className="account-empty-text">Выберите хотя бы одного сотрудника из списка ниже.</span>
            )}

            <button
              className="employee-binding-add"
              disabled={!canAddMore}
              onClick={() => document.getElementById("employee-binding-search")?.focus()}
              type="button"
            >
              + Добавить
            </button>
          </div>
        </section>

        <section aria-label="Фильтры сотрудников" className="employee-binding-filters">
          <label className="employee-binding-search">
            <AccountModalIcon name="search" />
            <input
              aria-label="Поиск сотрудника для привязки"
              autoFocus
              id="employee-binding-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Начните вводить ФИО или табельный номер"
              value={search}
            />
            {search ? (
              <button
                aria-label="Очистить поиск"
                className="employee-binding-clear"
                onClick={() => setSearch("")}
                type="button"
              >
                <CloseIcon />
              </button>
            ) : null}
          </label>
          <label>
            Участок
            <select onChange={(event) => setZoneFilter(event.target.value)} value={zoneFilter}>
              <option value="all">Все участки</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {displayKnownValue(zone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Роль
            <select onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
              <option value="all">Все роли</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {displayKnownValue(role)}
                </option>
              ))}
            </select>
          </label>
        </section>

        {errorMessage ? <div className="employee-binding-error">{errorMessage}</div> : null}

        <section className="employee-binding-directory">
          <div className="employee-binding-directory-head">
            <div>
              <h4>Выберите сотрудника</h4>
              <span>Нажмите «Добавить» или отметьте строку галочкой</span>
            </div>
            <strong aria-live="polite" className="employee-binding-result-count">
              {filteredEmployees.length} найдено
            </strong>
          </div>
          <div className="employee-binding-table-wrap">
            <table>
              <thead>
                <tr>
                  <th aria-label="Выбор"></th>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Отдел</th>
                  <th>Участок</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const isSelected = selectedIdSet.has(employee.id);

                  return (
                    <tr className={isSelected ? "employee-binding-row-selected" : undefined} key={employee.id}>
                      <td>
                        <input
                          aria-label={isSelected ? employee.fullName + " выбрана" : "Выбрать " + employee.fullName}
                          checked={isSelected}
                          onChange={() => (isSelected ? removeEmployee(employee.id) : addEmployee(employee))}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <div className="employee-binding-person">
                          <EmployeeAvatar employee={employee} />
                          <div>
                            <strong>{employee.fullName}</strong>
                            <span>{employee.personnelNo || employee.phone || "Без табельного номера"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{displayKnownValue(employee.position)}</td>
                      <td>{displayKnownValue(employee.department)}</td>
                      <td>{displayKnownValue(employee.zone)}</td>
                      <td>
                        <button
                          aria-label={isSelected ? employee.fullName + " уже добавлен" : "Добавить " + employee.fullName}
                          className="button ghost"
                          disabled={isSelected || !canAddMore}
                          onClick={() => addEmployee(employee)}
                          title={!isSelected && !canAddMore ? "Достигнут лимит: 5 сотрудников" : undefined}
                          type="button"
                        >
                          {isSelected ? "Добавлен" : "Добавить"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredEmployees.length === 0 ? (
              <div className="employee-binding-empty">
                <strong>Ничего не найдено</strong>
                <span>Измените запрос или сбросьте фильтры.</span>
                <button
                  className="button ghost"
                  onClick={() => {
                    setSearch("");
                    setZoneFilter("all");
                    setRoleFilter("all");
                  }}
                  type="button"
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={!canSubmit} type="submit">
            {isSubmitting ? "Сохранение..." : `Привязать (${selectedEmployeeIds.length})`}
          </button>
        </div>
      </form>
    </AccountPanelCard>
  );
}

