import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  CreateMobileAccountPayload,
  EmployeeDirectoryItem,
  MobileAccount,
  UpdateMobileAccountPayload,
} from "../../../types";

const MAX_BOUND_EMPLOYEES = 5;

interface MobileAccountCreateDrawerProps {
  selected?: MobileAccount;
  onCreateAccount: (payload: CreateMobileAccountPayload) => Promise<void> | void;
  onEmployeeNameDraftChange?: (employeeName: string) => void;
  onClose?: () => void;
  onNotify: (message: string) => void;
}

export function MobileAccountCreateDrawer({
  onClose,
  onCreateAccount,
}: MobileAccountCreateDrawerProps) {
  const [form, setForm] = useState({
    login: "",
    password: "",
    confirmPassword: "",
    role: "Маршрутный обходчик",
    status: "Не привязан" as MobileAccount["status"],
    language: "ru",
    credentialMode: "temporary" as "temporary" | "custom",
    requirePasswordChange: false,
    restrictToLinkedDevices: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState("");

  function patchForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrorMessage("");
    setFieldErrors({});
  }

  function validateForm() {
    if (form.login.trim().length < 3) return "Логин должен содержать минимум 3 символа";
    if (form.credentialMode === "custom" && !form.password.trim()) return "Введите пароль";
    if (form.credentialMode === "custom" && form.password.length < 8) return "Пароль должен содержать минимум 8 символов";
    if (form.credentialMode === "custom" && form.password !== form.confirmPassword) return "Пароли должны совпадать";
    if (!form.role.trim()) return "Выберите роль";
    return "";
  }

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      setFieldErrors({});
      setErrorMessage("");
      await onCreateAccount({
        employee: "",
        employeeScope: "selected",
        login: form.login.trim(),
        role: form.role,
        bindEmployee: false,
        restrictToBoundDevice: form.restrictToLinkedDevices,
        temporaryPassword: form.credentialMode === "temporary",
        password: form.credentialMode === "custom" ? form.password : undefined,
        confirmPassword: form.credentialMode === "custom" ? form.confirmPassword : undefined,
        status: form.status,
        language: form.language,
        requirePasswordChange: form.requirePasswordChange,
        restrictToLinkedDevices: form.restrictToLinkedDevices,
      });

      setForm({
        login: "",
        password: "",
        confirmPassword: "",
        role: "",
        status: "Не привязан",
        language: "ru",
        credentialMode: "temporary",
        requirePasswordChange: false,
        restrictToLinkedDevices: false,
      });
      onClose?.();
    } catch (error) {
      const nextFieldErrors = readFieldErrors(error);
      setFieldErrors(nextFieldErrors);
      setErrorMessage(
        nextFieldErrors.login?.[0] ??
          nextFieldErrors.password?.[0] ??
          nextFieldErrors.role?.[0] ??
          (error instanceof Error ? error.message : "Не удалось создать аккаунт"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="account-create-modal-card">
      <form onSubmit={submitCreateAccount}>
        <header className="account-create-head account-create-head-compact">
          <div>
            <span className="account-create-eyebrow">Мобильный доступ · шаг 1 из 2</span>
            <h3>Создать мобильный аккаунт</h3>
            <p>Заполните данные входа, затем отдельно привяжите сотрудников и устройства.</p>
          </div>
          <button aria-label="Закрыть окно" className="account-create-close" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </header>

        <section className="account-create-section account-create-identity">
          <div className="account-create-section-head">
            <div>
              <strong>Данные аккаунта</strong>
              <span>Минимум для создания мобильного доступа</span>
            </div>
            <span className="account-create-step-badge">1</span>
          </div>

          <div className="account-create-grid">
          <FieldGroup label="Логин" hint="Используется для входа в мобильное приложение.">
            <TextField autoFocus icon="user" onChange={(value) => patchForm({ login: value })} placeholder="Введите логин (например, ivan.petrov)" value={form.login} />
            <FieldError errors={fieldErrors.login} />
          </FieldGroup>

          <FieldGroup label="Роль" hint="Определяет права и доступ в системе.">
            <SelectField
              icon="user"
              onChange={(value) => patchForm({ role: value })}
              options={[
                { label: "Инспектор", value: "Инспектор" },
                { label: "Маршрутный обходчик", value: "Маршрутный обходчик" },
                { label: "Оператор", value: "Оператор" },
                { label: "Администратор", value: "Администратор" },
              ]}
              value={form.role}
            />
            <FieldError errors={fieldErrors.role} />
          </FieldGroup>

          <FieldGroup label="Статус аккаунта" hint="Активные пользователи могут входить в систему.">
            <SelectField
              onChange={(value) => patchForm({ status: value as MobileAccount["status"] })}
              options={[
                { label: "Активен", value: "Активен" },
                { label: "Не привязан", value: "Не привязан" },
                { label: "Заблокирован", value: "Заблокирован" },
              ]}
              statusDot
              value={form.status}
            />
          </FieldGroup>

          <FieldGroup label="Язык интерфейса (опционально)" hint="Язык по умолчанию для интерфейса приложения.">
            <SelectField icon="globe" onChange={(value) => patchForm({ language: value })} options={[{ label: "Русский", value: "ru" }, { label: "English", value: "en" }]} value={form.language} />
          </FieldGroup>
          </div>
        </section>

        <section className="account-create-section account-create-credentials">
          <div className="account-create-section-head">
            <div>
              <strong>Способ выдачи пароля</strong>
              <span>Выберите удобный вариант для сотрудника</span>
            </div>
            <span className="account-create-step-badge">2</span>
          </div>

          <div className="account-credential-toggle" role="radiogroup" aria-label="Способ выдачи пароля">
            <label className={form.credentialMode === "temporary" ? "selected" : ""}>
              <input checked={form.credentialMode === "temporary"} onChange={() => patchForm({ credentialMode: "temporary" })} type="radio" />
              <span className="account-radio-mark" aria-hidden="true" />
              <span><strong>Сгенерировать временный пароль</strong><small>Пароль появится один раз после создания и будет готов для передачи сотруднику.</small></span>
            </label>
            <label className={form.credentialMode === "custom" ? "selected" : ""}>
              <input checked={form.credentialMode === "custom"} onChange={() => patchForm({ credentialMode: "custom" })} type="radio" />
              <span className="account-radio-mark" aria-hidden="true" />
              <span><strong>Задать пароль вручную</strong><small>Подходит, если пароль уже согласован с сотрудником.</small></span>
            </label>
          </div>

          {form.credentialMode === "custom" ? (
            <div className="account-create-grid account-create-password-grid">
              <FieldGroup label="Пароль" hint="Минимум 8 символов.">
                <TextField
                  icon="lock"
                  onChange={(value) => patchForm({ password: value })}
                  placeholder="Введите пароль"
                  right={<button aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} className="account-create-eye" onClick={() => setShowPassword((value) => !value)} type="button"><EyeIcon hidden={showPassword} /></button>}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                />
              </FieldGroup>
              <FieldGroup label="Подтвердите пароль" hint="Пароли должны совпадать.">
                <TextField
                  icon="lock"
                  onChange={(value) => patchForm({ confirmPassword: value })}
                  placeholder="Повторите пароль"
                  right={<button aria-label={showConfirmPassword ? "Скрыть подтверждение пароля" : "Показать подтверждение пароля"} className="account-create-eye" onClick={() => setShowConfirmPassword((value) => !value)} type="button"><EyeIcon hidden={showConfirmPassword} /></button>}
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                />
              </FieldGroup>
            </div>
          ) : (
            <div className="account-create-credential-note">
              <AccountCreateIcon name="shield" />
              <span>После сохранения временный пароль будет показан один раз. Скопируйте его и передайте сотруднику безопасным способом.</span>
            </div>
          )}
        </section>

        <section className="account-create-options">
          <div className="account-create-section-head">
            <div>
              <strong>Ограничения доступа</strong>
              <span>Можно изменить позже в карточке аккаунта</span>
            </div>
          </div>
          <OptionRow checked={form.requirePasswordChange} icon="shield" onChange={(value) => patchForm({ requirePasswordChange: value })} text="Пользователь должен будет установить новый пароль." title="Требовать смену пароля при первом входе" />
          <OptionRow checked={form.restrictToLinkedDevices} icon="phone" onChange={(value) => patchForm({ restrictToLinkedDevices: value })} text="Вход возможен только с заранее привязанных устройств." title="Ограничить вход только с привязанных устройств" />
        </section>

        <section className="account-create-info">
          <AccountCreateIcon name="info" />
          <div>
            <strong>Следующий шаг — привязать сотрудника</strong>
            <span>После создания аккаунт появится в таблице. Откройте «Привязать сотрудника», чтобы выдать доступ конкретному сотруднику.</span>
          </div>
        </section>

        {errorMessage ? <div className="account-create-error">{errorMessage}</div> : null}

        <footer className="account-create-actions">
          <span className="account-create-action-hint">{form.credentialMode === "temporary" ? "Временный пароль будет показан после создания" : "Пароль сохранится в зашифрованном виде"}</span>
          <div>
            <button className="button ghost" onClick={onClose} type="button">Отмена</button>
            <button className="button primary" disabled={isSubmitting} type="submit"><AccountCreateIcon name="plus" />{isSubmitting ? "Создание..." : "Создать аккаунт"}</button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export function MobileAccountLinkPanel({
  employeeDirectory,
  selected,
  onAttachEmployee,
  onBindEmployees,
  onClose,
  onDetachEmployee,
  onNotify,
}: {
  employeeDirectory: EmployeeDirectoryItem[];
  selected?: MobileAccount;
  onAttachEmployee: (employeeId: string, employeeName: string) => Promise<void> | void;
  onBindEmployees?: (employeeIds: string[]) => Promise<void> | void;
  onClose?: () => void;
  onDetachEmployee?: (employeeId?: string) => Promise<void> | void;
  onNotify: (message: string) => void;
}) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setSelectedEmployeeIds(selected?.boundEmployeeIds ?? []);
    setSearch("");
    setZoneFilter("all");
    setRoleFilter("all");
    setErrorMessage("");
  }, [selected?.id, selected?.boundEmployeeIds]);

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
          await onDetachEmployee?.(employeeId);
        }

        for (const employeeId of addedIds) {
          const employee = directoryById.get(employeeId);
          if (employee) await onAttachEmployee(employee.id, employee.fullName);
        }
      }

      onClose?.();
    } catch (error) {
      const fieldErrors = readFieldErrors(error);
      setErrorMessage(
        fieldErrors.employeeId?.[0] ??
          fieldErrors.employeeIds?.[0] ??
          (error instanceof Error ? error.message : "Не удалось привязать сотрудников."),
      );
    } finally {
      setIsSubmitting(false);
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

export function MobileAccountEditPanel({
  selected,
  onClose,
  onNotify,
  onOpenLink,
  onUpdateAccount,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onNotify: (message: string) => void;
  onOpenLink?: () => void;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({
    login: selected?.login ?? "",
    role: displayKnownValue(selected?.role) || "Маршрутный обходчик",
    status: (displayKnownValue(selected?.status) || "Активен") as MobileAccount["status"],
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    setForm({
      login: selected?.login ?? "",
      role: displayKnownValue(selected?.role) || "Маршрутный обходчик",
      status: (displayKnownValue(selected?.status) || "Активен") as MobileAccount["status"],
      password: "",
      confirmPassword: "",
    });
    setFieldErrors({});
    setShowConfirm(false);
  }, [selected?.id, selected?.login, selected?.role, selected?.status]);

  function patchForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setFieldErrors({});
    setShowConfirm(false);
  }

  const normalizedLogin = form.login.trim();
  const normalizedPassword = form.password.trim();
  const passwordChangeRequested = normalizedPassword.length > 0 || form.confirmPassword.length > 0;
  const passwordValidationError = passwordChangeRequested
    ? normalizedPassword.length < 8
      ? "Новый пароль должен содержать минимум 8 символов."
      : normalizedPassword !== form.confirmPassword
        ? "Пароли не совпадают."
        : ""
    : "";
  const isValid =
    normalizedLogin.length >= 3 &&
    Boolean(form.role) &&
    Boolean(form.status) &&
    !passwordValidationError;
  const hasChanges = selected
    ? normalizedLogin !== selected.login ||
      form.role !== displayKnownValue(selected.role) ||
      form.status !== displayKnownValue(selected.status) ||
      passwordChangeRequested
    : false;

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт.");
      return;
    }

    if (!isValid) {
      setFieldErrors({
        ...(normalizedLogin.length < 3
          ? { login: ["Логин должен содержать минимум 3 символа."] }
          : {}),
        ...(passwordValidationError ? { password: [passwordValidationError] } : {}),
      });
      return;
    }

    if (hasChanges) setShowConfirm(true);
  }

  async function confirmEdit() {
    if (!selected || !hasChanges || !isValid) return;

    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      setFieldErrors({});
      await onUpdateAccount({
        login: normalizedLogin,
        role: form.role,
        status: form.status,
        password: passwordChangeRequested ? normalizedPassword : undefined,
        confirmPassword: passwordChangeRequested ? form.confirmPassword : undefined,
      });
      onClose?.();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountPanelCard
      title="Редактирование аккаунта"
      note="Измените логин, роль, статус или задайте новый пароль."
      onClose={onClose}
    >
      <form className="account-panel-form account-edit-form" onSubmit={submitEdit}>
        <section className="account-edit-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Основные параметры</strong>
              <span>Настройки входа и уровня доступа</span>
            </div>
            <span className={"account-edit-status " + (form.status === "Заблокирован" ? "blocked" : "active")}>
              {form.status}
            </span>
          </div>

          <div className="account-form-grid two">
            <label className="account-edit-field">
              <span>Логин <b>*</b></span>
              <input
                autoComplete="username"
                autoFocus
                onChange={(event) => patchForm({ login: event.currentTarget.value })}
                placeholder="Введите логин"
                value={form.login}
              />
              <small>Не менее трёх символов, без пробелов по краям</small>
              <FieldError errors={fieldErrors.login} />
            </label>
            <label className="account-edit-field">
              <span>Роль <b>*</b></span>
              <select onChange={(event) => patchForm({ role: event.currentTarget.value })} value={form.role}>
                <option>Маршрутный обходчик</option>
                <option>Оператор</option>
                <option>Администратор</option>
                <option>Администратор мобильного доступа</option>
              </select>
              <small>Определяет доступные функции мобильного приложения</small>
              <FieldError errors={fieldErrors.role} />
            </label>
          </div>

          <label className="account-edit-field account-edit-field-wide">
            <span>Статус аккаунта <b>*</b></span>
            <select
              onChange={(event) => patchForm({ status: event.currentTarget.value as MobileAccount["status"] })}
              value={form.status}
            >
              <option>Активен</option>
              <option>Не привязан</option>
              <option>Заблокирован</option>
            </select>
            <small>{statusHelpText(form.status)}</small>
            <FieldError errors={fieldErrors.status} />
          </label>
        </section>

        <section className="account-edit-section account-edit-password-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Пароль</strong>
              <span>Оставьте поля пустыми, если менять пароль не нужно.</span>
            </div>
            <span className="account-edit-password-badge">Защищён</span>
          </div>
          <div className="account-form-grid two">
            <label className="account-edit-field">
              <span>Новый пароль</span>
              <input
                autoComplete="new-password"
                onChange={(event) => patchForm({ password: event.currentTarget.value })}
                placeholder="Минимум 8 символов"
                type="password"
                value={form.password}
              />
              <small>Пароль передаётся на сервер только после подтверждения.</small>
              <FieldError errors={fieldErrors.password} />
            </label>
            <label className="account-edit-field">
              <span>Подтверждение пароля</span>
              <input
                autoComplete="new-password"
                onChange={(event) => patchForm({ confirmPassword: event.currentTarget.value })}
                placeholder="Повторите новый пароль"
                type="password"
                value={form.confirmPassword}
              />
              <small>Оба значения должны совпадать.</small>
            </label>
          </div>
        </section>

        <section className="selected-employee-block account-edit-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Привязанные сотрудники</strong>
              <span>{selected?.boundEmployees.length ?? 0} из {MAX_BOUND_EMPLOYEES}</span>
            </div>
            <button
              className="button ghost account-edit-link-button"
              disabled={hasChanges}
              onClick={onOpenLink}
              title={hasChanges ? "Сначала сохраните изменения аккаунта" : undefined}
              type="button"
            >
              Управлять привязками
            </button>
          </div>
          <EmployeeTokenList employees={selected?.boundEmployees ?? []} />
          <p className="account-edit-help">
            {hasChanges
              ? "Сначала сохраните изменения аккаунта, затем управляйте привязками."
              : "Добавление и удаление сотрудников выполняется в отдельном окне управления привязками."}
          </p>
        </section>

        {!isValid && form.login.length > 0 && !passwordValidationError ? (
          <div className="account-edit-validation" role="alert">
            Логин должен содержать минимум 3 символа.
          </div>
        ) : null}

        {showConfirm ? (
          <div aria-labelledby="account-edit-confirm-title" className="account-edit-confirm" role="alertdialog">
            <div>
              <strong id="account-edit-confirm-title">Подтвердить изменения?</strong>
              <span>Логин, роль, статус или пароль будут обновлены на сервере.</span>
            </div>
            <div className="account-edit-confirm-actions">
              <button className="button ghost" onClick={() => setShowConfirm(false)} type="button">
                Нет
              </button>
              <button className="button primary" disabled={isSubmitting} onClick={() => void confirmEdit()} type="button">
                {isSubmitting ? "Сохранение..." : "Да, сохранить"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="account-panel-actions account-edit-actions">
          {hasChanges && !showConfirm ? (
            <span className="account-edit-change-hint">Изменения готовы к сохранению</span>
          ) : null}
          <div>
            <button className="button ghost" onClick={onClose} type="button">Отмена</button>
            <button className="button primary" disabled={isSubmitting || !selected || !isValid || !hasChanges} type="submit">
              {isSubmitting ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </div>
      </form>
    </AccountPanelCard>
  );
}

export function MobileAccountViewPanel({
  selected,
  onClose,
  onOpenEdit,
  onOpenLink,
  onOpenPassword,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onOpenEdit?: () => void;
  onOpenLink?: () => void;
  onOpenPassword?: () => void;
}) {
  return (
    <AccountPanelCard
      title="Просмотр аккаунта"
      note="Сводка по мобильному доступу, сотрудникам, устройству и последней активности."
      onClose={onClose}
    >
      <div className="account-panel-form">
        <div className="account-view-summary">
          <div>
            <span>Логин</span>
            <strong>{selected?.login ?? "-"}</strong>
          </div>
          <div>
            <span>Роль</span>
            <strong>{displayKnownValue(selected?.role) || "-"}</strong>
          </div>
          <div>
            <span>Статус</span>
            <strong>{displayKnownValue(selected?.status) || "-"}</strong>
          </div>
          <div>
            <span>Сессия</span>
            <strong>{displayKnownValue(selected?.session) || "-"}</strong>
          </div>
        </div>

        <dl className="account-detail-list">
          <div>
            <dt>Последняя активность</dt>
            <dd>{selected?.lastSeen || "-"}</dd>
          </div>
          <div>
            <dt>Устройство</dt>
            <dd>{selected?.device || "-"}</dd>
          </div>
          <div>
            <dt>Версия</dt>
            <dd>{selected?.version || "-"}</dd>
          </div>
        </dl>

        <div className="selected-employee-block">
          <div>
            <strong>Привязанные сотрудники</strong>
            <span>{selected?.boundEmployees.length ?? 0}/{MAX_BOUND_EMPLOYEES}</span>
          </div>
          <EmployeeTokenList employees={selected?.boundEmployees ?? []} />
        </div>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onOpenPassword} type="button">
            Изменить пароль
          </button>
          <button className="button ghost" onClick={onOpenLink} type="button">
            Привязать сотрудника
          </button>
          <button className="button primary" onClick={onOpenEdit} type="button">
            Редактировать
          </button>
        </div>
      </div>
    </AccountPanelCard>
  );
}

export function MobileAccountPasswordPanel({
  selected,
  onClose,
  onNotify,
  onResetPassword,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onNotify: (message: string) => void;
  onResetPassword: () => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onResetPassword();
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountPanelCard
      title="Изменение пароля"
      note="Backend выдаст временный пароль и покажет его один раз после сброса."
      onClose={onClose}
    >
      <form className="account-panel-form" onSubmit={submitPassword}>
        <div className="password-reset-summary">
          <span>Аккаунт</span>
          <strong>{selected?.login ?? "Аккаунт не выбран"}</strong>
          <em>Сброс пароля потребует смену при следующем входе.</em>
        </div>

        <label className="toggle-filter">
          <input defaultChecked readOnly type="checkbox" /> Требовать смену пароля при следующем входе
        </label>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={isSubmitting || !selected} type="submit">
            {isSubmitting ? "Сброс..." : "Сбросить пароль"}
          </button>
        </div>
      </form>
    </AccountPanelCard>
  );
}

export function MobileAccountDeletePanel({
  selected,
  onClose,
  onDeleteAccount,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onDeleteAccount: () => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitDelete() {
    if (!selected) return;

    setIsSubmitting(true);
    try {
      await onDeleteAccount();
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountPanelCard
      title="Удаление аккаунта"
      note="Удаление отключит мобильный вход и отвяжет сотрудников от аккаунта."
      onClose={onClose}
    >
      <div className="account-panel-form">
        <div className="account-delete-warning">
          <strong>Удалить аккаунт {selected?.login ?? ""}?</strong>
          <span>Действие нельзя отменить. Для временного закрытия доступа лучше использовать блокировку.</span>
        </div>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button danger" disabled={isSubmitting || !selected} onClick={submitDelete} type="button">
            {isSubmitting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </AccountPanelCard>
  );
}

function AccountPanelCard({
  children,
  note,
  onClose,
  title,
}: {
  children: ReactNode;
  note: string;
  onClose?: () => void;
  title: string;
}) {
  return (
    <section className="account-panel-card">
      <header className="account-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
        <button aria-label="Закрыть окно" className="account-panel-close" onClick={onClose} type="button">
          <CloseIcon />
        </button>
      </header>
      {children}
    </section>
  );
}

function AtomLogo() {
  return (
    <div className="account-create-logo">
      <strong>AM</strong>
      <span>ATOM<br />MINERALS</span>
    </div>
  );
}

function FieldGroup({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="account-create-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function TextField({ autoFocus, icon, onChange, placeholder, right, type = "text", value }: { autoFocus?: boolean; icon: AccountCreateIconName; onChange: (value: string) => void; placeholder: string; right?: ReactNode; type?: string; value: string }) {
  return (
    <div className="account-create-control">
      <AccountCreateIcon name={icon} />
      <input autoFocus={autoFocus} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} type={type} value={value} />
      {right}
    </div>
  );
}

function SelectField({ icon, onChange, options, placeholder, statusDot, value }: { icon?: AccountCreateIconName; onChange: (value: string) => void; options: Array<{ label: string; value: string }>; placeholder?: string; statusDot?: boolean; value: string }) {
  const className = ["account-create-select", icon || statusDot ? "with-icon" : ""].filter(Boolean).join(" ");
  return (
    <div className={className}>
      {icon ? <AccountCreateIcon name={icon} /> : null}
      {statusDot ? <span className="account-create-status-dot" aria-hidden="true" /> : null}
      <select onChange={(event) => onChange(event.currentTarget.value)} value={value}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <AccountCreateIcon name="chevron" />
    </div>
  );
}

function OptionRow({ checked, icon, onChange, text, title }: { checked: boolean; icon: AccountCreateIconName; onChange: (value: boolean) => void; text: string; title: string }) {
  return (
    <label className="account-create-option">
      <input checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
      <AccountCreateIcon name={icon} />
      <span><strong>{title}</strong><small>{text}</small></span>
    </label>
  );
}

type AccountCreateIconName = "chevron" | "globe" | "info" | "lock" | "phone" | "plus" | "shield" | "user";

function AccountCreateIcon({ name }: { name: AccountCreateIconName }) {
  if (name === "user") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>;
  if (name === "lock") return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "globe") return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>;
  if (name === "shield") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>;
  if (name === "phone") return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
  if (name === "info") return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
  if (name === "plus") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" />{hidden ? <path d="M4 4l16 16" /> : null}</svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

function SelectedEmployeeCard({
  employee,
  onRemove,
}: {
  employee: EmployeeDirectoryItem;
  onRemove: () => void;
}) {
  return (
    <div className="employee-binding-selected-card">
      <EmployeeAvatar employee={employee} />
      <div>
        <strong>{employee.fullName}</strong>
        <span>{displayKnownValue(employee.position)}</span>
      </div>
      <button aria-label={`Убрать ${employee.fullName}`} onClick={onRemove} type="button">
        ×
      </button>
    </div>
  );
}

function EmployeeAvatar({ employee }: { employee: EmployeeDirectoryItem }) {
  return (
    <span className="employee-binding-avatar" aria-hidden="true">
      {employee.initials || getInitials(employee.fullName)}
    </span>
  );
}

function EmployeeTokenList({ employees }: { employees: string[] }) {
  if (employees.length === 0) return <span className="account-empty-text">Сотрудники не привязаны.</span>;

  return (
    <div className="employee-token-list">
      {employees.map((employee) => (
        <span className="employee-token" key={employee}>
          <span className="employee-token-avatar" aria-hidden="true">{getInitials(employee)}</span>
          <strong>{employee}</strong>
        </span>
      ))}
    </div>
  );
}

function statusHelpText(status: MobileAccount["status"]) {
  if (status === "Заблокирован") return "Вход будет закрыт, а активные сессии потребуется завершить.";
  if (status === "Не привязан") return "Аккаунт нельзя использовать, пока к нему не привязан сотрудник.";
  return "Аккаунт доступен для входа привязанным сотрудникам.";
}

function AccountModalIcon({ name }: { name: "phone" | "info" | "search" }) {
  if (name === "phone") {
    return (
      <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
        <rect height="18" rx="2" stroke="currentColor" strokeWidth="2" width="11" x="6.5" y="3" />
        <path d="M10 17.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10v6M12 7h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <span className="account-form-error">{errors[0]}</span>;
}

function readFieldErrors(error: unknown) {
  if (typeof error !== "object" || error === null) return {};

  const maybeErrors = (error as { errors?: unknown }).errors;
  if (!maybeErrors || typeof maybeErrors !== "object") return {};

  return maybeErrors as Record<string, string[]>;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first, second) =>
    displayKnownValue(first).localeCompare(displayKnownValue(second), "ru"),
  );
}

function displayKnownValue(value?: string) {
  if (!value) return "";

  const map: Record<string, string> = {
    "Активен": "Активен",
    "Не привязан": "Не привязан",
    "Заблокирован": "Заблокирован",
    "Онлайн": "Онлайн",
    "Офлайн": "Оффлайн",
    "Маршрутный обходчик": "Маршрутный обходчик",
    "Оператор": "Оператор",
    "Администратор": "Администратор",
    "Привязан": "Привязан",
    "Север": "Север",
    "Юг": "Юг",
    "День": "День",
    "Ночь": "Ночь",
  };

  return map[value] ?? value;
}
