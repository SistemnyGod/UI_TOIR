import type { ReactNode } from "react";
import { ChevronDown, Eye, EyeOff, Globe, Info, LockKeyhole, Plus, Search, Shield, Smartphone, UserRound, X } from "lucide-react";
import type { EmployeeDirectoryItem, MobileAccount } from "../../../types";

export const MAX_BOUND_EMPLOYEES = 5;

export function AccountPanelCard({
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

export function FieldGroup({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="account-create-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function TextField({ autoFocus, icon, onChange, placeholder, right, type = "text", value }: { autoFocus?: boolean; icon: AccountCreateIconName; onChange: (value: string) => void; placeholder: string; right?: ReactNode; type?: string; value: string }) {
  return (
    <div className="account-create-control">
      <AccountCreateIcon name={icon} />
      <input aria-label={icon === "lock" ? placeholder.startsWith("Повторите") ? "Подтвердите пароль" : "Пароль" : "Логин"} autoComplete={icon === "lock" ? "new-password" : "username"} autoFocus={autoFocus} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} type={type} value={value} />
      {right}
    </div>
  );
}

export function SelectField({ icon, onChange, options, placeholder, statusDot, value }: { icon?: AccountCreateIconName; onChange: (value: string) => void; options: Array<{ label: string; value: string }>; placeholder?: string; statusDot?: boolean; value: string }) {
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

type AccountCreateIconName = "chevron" | "globe" | "info" | "lock" | "phone" | "plus" | "shield" | "user";

export function AccountCreateIcon({ name }: { name: AccountCreateIconName }) {
  const Icon = { chevron: ChevronDown, globe: Globe, info: Info, lock: LockKeyhole, phone: Smartphone, plus: Plus, shield: Shield, user: UserRound }[name];
  return <Icon aria-hidden="true" size={20} />;
}
export function EyeIcon({ hidden }: { hidden: boolean }) { const Icon = hidden ? EyeOff : Eye; return <Icon aria-hidden="true" size={20} />; }
export function CloseIcon() { return <X aria-hidden="true" size={20} />; }

export function SelectedEmployeeCard({
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

export function EmployeeAvatar({ employee }: { employee: EmployeeDirectoryItem }) {
  return (
    <span className="employee-binding-avatar" aria-hidden="true">
      {employee.initials || getInitials(employee.fullName)}
    </span>
  );
}

export function EmployeeTokenList({ employees }: { employees: string[] }) {
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

export function statusHelpText(status: MobileAccount["status"]) {
  if (status === "Заблокирован") return "Вход будет закрыт, а активные сессии потребуется завершить.";
  if (status === "Не привязан") return "Аккаунт нельзя использовать, пока к нему не привязан сотрудник.";
  return "Аккаунт доступен для входа привязанным сотрудникам.";
}

export function AccountModalIcon({ name }: { name: "phone" | "info" | "search" }) {
  const Icon = { phone: Smartphone, info: Info, search: Search }[name];
  return <Icon aria-hidden="true" size={20} />;
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <span className="account-form-error">{errors[0]}</span>;
}

export function readFieldErrors(error: unknown) {
  if (typeof error !== "object" || error === null) return {};

  const maybeErrors = (error as { errors?: unknown }).errors;
  if (!maybeErrors || typeof maybeErrors !== "object") return {};

  return maybeErrors as Record<string, string[]>;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first, second) =>
    displayKnownValue(first).localeCompare(displayKnownValue(second), "ru"),
  );
}

export function displayKnownValue(value?: string) {
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
