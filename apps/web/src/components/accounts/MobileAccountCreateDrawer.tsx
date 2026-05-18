import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  CreateMobileAccountPayload,
  EmployeeDirectoryItem,
  MobileAccount,
  UpdateMobileAccountPayload,
} from "../../types";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function resetDraft() {
    onClose?.();
  }

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      setFieldErrors({});
      await onCreateAccount({
        employee: "",
        employeeScope: "selected",
        login: String(formData.get("login") ?? ""),
        role: String(formData.get("role") ?? "Маршрутный обходчик"),
        bindEmployee: false,
        restrictToBoundDevice: formData.get("restrictToBoundDevice") === "on",
        temporaryPassword: formData.get("temporaryPassword") === "on",
      });

      form.reset();
      onClose?.();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountPanelCard
      title="Создание аккаунта"
      note="Создает логин, роль и временный пароль. Привязка сотрудников выполняется отдельно."
      onClose={onClose}
    >
      <form className="account-panel-form" onSubmit={submitCreateAccount}>
        <div className="account-form-grid two">
          <label>
            Логин *
            <input autoFocus name="login" placeholder="Введите логин" />
            <FieldError errors={fieldErrors.login} />
          </label>
          <label>
            Пароль
            <input disabled placeholder="Временный пароль выдаст backend" readOnly type="text" />
          </label>
        </div>

        <label>
          Подтвердить пароль
          <input disabled placeholder="Покажется один раз после создания" readOnly type="text" />
        </label>

        <div className="account-form-grid two">
          <label>
            Роль *
            <select defaultValue="Маршрутный обходчик" name="role">
              <option>Маршрутный обходчик</option>
              <option>Оператор</option>
              <option>Администратор мобильного доступа</option>
            </select>
            <FieldError errors={fieldErrors.role} />
          </label>
          <label>
            Статус *
            <select disabled value="Активен">
              <option>Активен</option>
            </select>
          </label>
        </div>

        <label className="toggle-filter">
          <input defaultChecked name="temporaryPassword" type="checkbox" /> Требовать смену пароля при первом входе
        </label>
        <label className="toggle-filter">
          <input defaultChecked name="restrictToBoundDevice" type="checkbox" /> Разрешать вход только с привязанного устройства
        </label>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={resetDraft} type="reset">
            Отмена
          </button>
          <button className="button primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохранение..." : "Создать"}
          </button>
        </div>
      </form>
    </AccountPanelCard>
  );
}

export function MobileAccountLinkPanel({
  employeeDirectory,
  selected,
  onAttachEmployee,
  onClose,
  onNotify,
}: {
  employeeDirectory: EmployeeDirectoryItem[];
  selected?: MobileAccount;
  onAttachEmployee: (employeeId: string, employeeName: string) => Promise<void> | void;
  onClose?: () => void;
  onNotify: (message: string) => void;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const boundEmployees = selected?.boundEmployees ?? [];
  const boundEmployeeIds = selected?.boundEmployeeIds ?? [];
  const selectedEmployee = employeeDirectory.find((employee) => employee.id === selectedEmployeeId);
  const isDuplicateEmployee = Boolean(
    selectedEmployee &&
      (boundEmployeeIds.includes(selectedEmployee.id) ||
        boundEmployees.some((employee) => employee.toLowerCase() === selectedEmployee.fullName.toLowerCase())),
  );
  const hasEmployeeName = Boolean(selectedEmployee);
  const canAttachMore = selected?.employeeScope === "all" || boundEmployees.length < MAX_BOUND_EMPLOYEES;
  const canSubmit = Boolean(selected) && hasEmployeeName && canAttachMore && !isDuplicateEmployee;

  async function submitAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт");
      return;
    }

    if (!canAttachMore) {
      onNotify(`К аккаунту уже привязано ${MAX_BOUND_EMPLOYEES} сотрудников`);
      return;
    }

    if (!selectedEmployee) {
      onNotify("Выберите сотрудника из справочника");
      return;
    }

    if (isDuplicateEmployee) {
      onNotify(`${selectedEmployee.fullName} уже привязан к аккаунту`);
      return;
    }

    try {
      setFieldErrors({});
      await onAttachEmployee(selectedEmployee.id, selectedEmployee.fullName);
      setSelectedEmployeeId("");
      onClose?.();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
    }
  }

  return (
    <AccountPanelCard
      title="Привязка сотрудника"
      note="Добавляйте сотрудников по одному, чтобы не превысить лимит."
      onClose={onClose}
    >
      <form className="account-panel-form" onSubmit={submitAttach}>
        <label>
          Аккаунт
          <input disabled readOnly value={selected?.login ?? "Выберите аккаунт в таблице"} />
        </label>
        <label>
          Поиск сотрудника
          <select
            autoFocus
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            value={selectedEmployeeId}
          >
            <option value="">Выберите сотрудника</option>
            {employeeDirectory.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} - {employee.position}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors.employeeId ?? fieldErrors.employeeName} />
        </label>

        <div className="selected-employee-block">
          <div>
            <strong>Выберите сотрудников</strong>
            <span>
              {selected?.employeeScope === "all" ? "Все сотрудники" : `${boundEmployees.length} / ${MAX_BOUND_EMPLOYEES}`}
            </span>
          </div>
          <EmployeeTokenList employees={boundEmployees} emptyText="Пока нет привязанных сотрудников" />
        </div>

        <div className="notice info-soft">
          <strong>Лимит привязки</strong>
          <span>
            К одному мобильному аккаунту можно привязать до 5 сотрудников. Общий доступ остается отдельным режимом.
          </span>
        </div>
        {!canAttachMore ? (
          <span className="account-form-error">Лимит - {MAX_BOUND_EMPLOYEES} сотрудников. Перед новой привязкой отвяжите лишнего сотрудника.</span>
        ) : null}
        {isDuplicateEmployee ? <span className="account-form-error">Этот сотрудник уже есть в списке привязки.</span> : null}

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={!canSubmit} type="submit">
            Привязать
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
  onOpenLink: () => void;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт");
      return;
    }

    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      await onUpdateAccount({
        login: String(formData.get("login") ?? ""),
        role: String(formData.get("role") ?? ""),
        status: String(formData.get("status") ?? selected.status) as MobileAccount["status"],
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
      note={selected ? selected.login : "Выберите аккаунт в таблице"}
      onClose={onClose}
    >
      <form
        className="account-panel-form"
        key={selected?.id ?? "empty"}
        onSubmit={submitUpdate}
      >
        <div className="account-form-section">
          <div className="account-form-section-head">
            <strong>Основные данные</strong>
            <span>ожидает API редактирования</span>
          </div>
          <div className="account-form-grid two">
            <label>
              Логин
              <input autoFocus defaultValue={selected?.login ?? ""} disabled={!selected} name="login" />
              <FieldError errors={fieldErrors.login} />
            </label>
            <label>
              Роль
              <select defaultValue={selected?.role ?? "Маршрутный обходчик"} disabled={!selected} name="role">
                <option>Маршрутный обходчик</option>
                <option>Оператор</option>
                <option>Администратор мобильного доступа</option>
              </select>
              <FieldError errors={fieldErrors.role} />
            </label>
          </div>
        </div>

        <div className="account-form-section">
          <label>
            Статус
            <select defaultValue={selected?.status ?? "Активен"} disabled={!selected} name="status">
              <option>Активен</option>
              <option>Не привязан</option>
              <option>Заблокирован</option>
            </select>
            <FieldError errors={fieldErrors.status} />
          </label>

          <div className="selected-employee-block">
            <div>
              <strong>Привязанные сотрудники</strong>
              <span>
                {selected?.employeeScope === "all" ? "Все" : `${selected?.boundEmployees.length ?? 0} / ${MAX_BOUND_EMPLOYEES}`}
              </span>
            </div>
            <EmployeeTokenList employees={selected?.boundEmployees ?? []} emptyText="Сотрудники не привязаны" />
          </div>

          <button className="button ghost account-dashed-action" onClick={onOpenLink} type="button">
            + Добавить сотрудника
          </button>
        </div>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={!selected || isSubmitting} type="submit">
            {isSubmitting ? "Сохранение..." : "Сохранить"}
          </button>
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
  onOpenEdit: () => void;
  onOpenLink: () => void;
  onOpenPassword: () => void;
}) {
  const boundEmployees = selected?.boundEmployees ?? [];

  return (
    <AccountPanelCard
      title="Просмотр аккаунта"
      note={selected ? selected.login : "Выберите аккаунт в таблице"}
      onClose={onClose}
    >
      <div className="account-panel-form">
        <div className="account-view-summary">
          <div>
            <span>Логин</span>
            <strong>{selected?.login ?? "Аккаунт не выбран"}</strong>
          </div>
          <div>
            <span>Статус</span>
            <strong>{selected?.status ?? "—"}</strong>
          </div>
          <div>
            <span>Роль</span>
            <strong>{selected?.role ?? "—"}</strong>
          </div>
          <div>
            <span>Сессия</span>
            <strong>{selected?.session ?? "—"}</strong>
          </div>
        </div>

        <div className="account-form-section">
          <div className="account-form-section-head">
            <strong>Доступ и устройство</strong>
            <span>{selected?.employeeScope === "all" ? "общий доступ" : `${boundEmployees.length} / ${MAX_BOUND_EMPLOYEES}`}</span>
          </div>
          <dl className="account-detail-list">
            <div>
              <dt>Последняя активность</dt>
              <dd>{selected?.lastSeen ?? "—"}</dd>
            </div>
            <div>
              <dt>Устройство</dt>
              <dd>{selected ? `${selected.device} ${selected.version}`.trim() : "—"}</dd>
            </div>
            <div>
              <dt>Состояние пароля</dt>
              <dd>{selected?.passwordState ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="selected-employee-block">
          <div>
            <strong>Привязанные сотрудники</strong>
            <span>{selected?.employeeScope === "all" ? "Все" : `${boundEmployees.length} / ${MAX_BOUND_EMPLOYEES}`}</span>
          </div>
          <EmployeeTokenList
            employees={selected?.employeeScope === "all" ? ["Все сотрудники"] : boundEmployees}
            emptyText="Сотрудники не привязаны"
          />
        </div>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onOpenLink} disabled={!selected} type="button">
            Привязать
          </button>
          <button className="button ghost" onClick={onOpenPassword} disabled={!selected} type="button">
            Пароль
          </button>
          <button className="button primary" onClick={onOpenEdit} disabled={!selected} type="button">
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
  return (
    <AccountPanelCard
      title="Изменение пароля"
      note="Пароль не вводится вручную и показывается один раз."
      onClose={onClose}
    >
      <form
        className="account-panel-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selected) {
            onNotify("Сначала выберите мобильный аккаунт");
            return;
          }

          await onResetPassword();
          onClose?.();
        }}
      >
        <div className="password-reset-summary">
          <span>Аккаунт</span>
          <strong>{selected?.login ?? "Выберите аккаунт в таблице"}</strong>
          <em>{selected?.passwordState ?? "Пароль будет сгенерирован backend"}</em>
        </div>
        <div className="notice info-soft">
          <strong>Одноразовый показ пароля</strong>
          <span>
            После сохранения временный пароль появится в отдельной всплывающей панели и не попадет в toast.
          </span>
        </div>
        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={!selected} type="submit">
            Выдать временный пароль
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
  const [isDeleting, setIsDeleting] = useState(false);

  async function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || isDeleting) return;

    setIsDeleting(true);
    try {
      await onDeleteAccount();
      onClose?.();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AccountPanelCard
      title="Удаление аккаунта"
      note={selected ? selected.login : "Выберите аккаунт в таблице"}
      onClose={onClose}
    >
      <form className="account-panel-form" onSubmit={submitDelete}>
        <div className="account-delete-warning">
          <strong>{selected ? `Удалить мобильный аккаунт ${selected.login}?` : "Аккаунт не выбран"}</strong>
          <span>
            Действие удалит мобильный логин, привязки сотрудников и текущие параметры доступа. Восстановление будет
            возможно только через повторное создание аккаунта.
          </span>
        </div>

        <div className="password-reset-summary">
          <span>Статус</span>
          <strong>{selected?.status ?? "—"}</strong>
          <em>{selected?.boundEmployees.length ? `Привязано сотрудников: ${selected.boundEmployees.length}` : "Нет привязанных сотрудников"}</em>
        </div>

        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button danger-outline" disabled={!selected || isDeleting} type="submit">
            {isDeleting ? "Удаление..." : "Удалить аккаунт"}
          </button>
        </div>
      </form>
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
  note?: string;
  onClose?: () => void;
  title: string;
}) {
  return (
    <section className="account-panel-card">
      <div className="account-panel-head">
        <div>
          <h3>{title}</h3>
          {note ? <p>{note}</p> : null}
        </div>
        {onClose ? (
          <button aria-label={`Закрыть: ${title}`} className="account-panel-close" onClick={onClose} type="button">
            ×
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmployeeTokenList({ employees, emptyText }: { employees: string[]; emptyText: string }) {
  const visibleEmployees = useMemo(() => employees.slice(0, MAX_BOUND_EMPLOYEES), [employees]);

  if (visibleEmployees.length === 0) {
    return <span className="account-empty-text">{emptyText}</span>;
  }

  return (
    <div className="employee-token-list">
      {visibleEmployees.map((employee) => (
        <span className="employee-token" key={employee}>
          <span>{getInitials(employee)}</span>
          {employee}
          <span className="employee-token-remove" aria-hidden="true">
            ×
          </span>
        </span>
      ))}
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <span className="account-form-error">{errors[0]}</span>;
}

function readFieldErrors(error: unknown) {
  if (typeof error !== "object" || error === null || !("errors" in error)) {
    return {};
  }

  const errors = (error as { errors?: Record<string, string[]> }).errors;
  return errors ?? {};
}

function getInitials(value: string) {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length === 0) return "С";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}
