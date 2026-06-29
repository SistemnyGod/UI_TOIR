import type { MobileAccount, Tone } from "../../../types";

type AccountMetricIcon = "check" | "lock" | "user" | "user-plus" | "wifi";

export function MobileAccountMetrics({ accounts }: { accounts: MobileAccount[] }) {
  const activeAccounts = accounts.filter((account) => isAccountStatus(account.status, "active")).length;
  const onlineSessions = accounts.filter((account) => isSessionStatus(account.session, "online")).length;
  const unboundAccounts = accounts.filter((account) => isAccountStatus(account.status, "unbound") || account.boundEmployees.length === 0).length;
  const blockedAccounts = accounts.filter((account) => isAccountStatus(account.status, "blocked")).length;

  const metrics: Array<{
    icon: AccountMetricIcon;
    label: string;
    value: number;
    hint: string;
    tone: Tone;
  }> = [
    { icon: "user", label: "Всего аккаунтов", value: accounts.length, hint: "в мобильном контуре", tone: "blue" },
    { icon: "check", label: "Активные аккаунты", value: activeAccounts, hint: "доступны для входа", tone: "green" },
    { icon: "user-plus", label: "Не привязанные", value: unboundAccounts, hint: "ожидают сотрудника", tone: "orange" },
    { icon: "wifi", label: "Онлайн-сессии", value: onlineSessions, hint: "сейчас в системе", tone: "blue" },
    { icon: "lock", label: "Заблокированные", value: blockedAccounts, hint: "временно закрыт вход", tone: "red" },
  ];

  return (
    <section className="mobile-am-kpis" aria-label="Показатели мобильных аккаунтов">
      {metrics.map((metric) => (
        <article className={`mobile-am-kpi ${metric.tone}`} key={metric.label}>
          <span className="mobile-am-icon">
            <MobileAccountIcon name={metric.icon} />
          </span>
          <div>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function MobileAccountIcon({ name }: { name: AccountMetricIcon }) {
  return (
    <svg className="mobile-am-svg" viewBox="0 0 24 24" aria-hidden="true">
      {name === "user" ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c1-4 3.3-6 7-6s6 2 7 6" />
        </>
      ) : null}
      {name === "check" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.6 12.2 2.2 2.2 4.8-5" />
        </>
      ) : null}
      {name === "user-plus" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4 20c.8-3.8 2.5-5.7 5-5.7 1.7 0 3 .8 4 2.3" />
          <path d="M17 10v6" />
          <path d="M14 13h6" />
        </>
      ) : null}
      {name === "wifi" ? (
        <>
          <path d="M4.8 9.2a11 11 0 0 1 14.4 0" />
          <path d="M8 12.4a6.5 6.5 0 0 1 8 0" />
          <path d="M10.8 15.5a2 2 0 0 1 2.4 0" />
          <path d="M12 18h.01" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          <path d="M12 14v2" />
        </>
      ) : null}
    </svg>
  );
}

function isAccountStatus(value: string, status: "active" | "blocked" | "unbound") {
  const normalized = normalizeValue(value);
  if (status === "active") return normalized.includes("актив");
  if (status === "blocked") return normalized.includes("заблок");
  return normalized.includes("не привязан");
}

function isSessionStatus(value: string, status: "online") {
  return status === "online" && normalizeValue(value).includes("онлайн");
}

function normalizeValue(value: string) {
  const map: Record<string, string> = {
    "Активен": "Активен",
    "Не привязан": "Не привязан",
    "Заблокирован": "Заблокирован",
    "Онлайн": "Онлайн",
    "Офлайн": "Оффлайн",
  };

  return (map[value] ?? value).toLowerCase();
}
