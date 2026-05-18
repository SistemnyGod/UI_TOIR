import type { ScreenId } from "../types";

export function NavIcon({ screen }: { screen: ScreenId }) {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      {screen === "dashboard" ? (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.4" />
          <rect x="14" y="4" width="6" height="6" rx="1.4" />
          <rect x="4" y="14" width="6" height="6" rx="1.4" />
          <rect x="14" y="14" width="6" height="6" rx="1.4" />
        </>
      ) : null}
      {screen === "results" ? (
        <>
          <path d="M7 5h10" />
          <path d="M7 12h10" />
          <path d="M7 19h10" />
          <circle cx="4" cy="5" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="19" r="1" />
        </>
      ) : null}
      {screen === "assign" ? (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M4.5 19c.7-3.2 2.3-5 4.5-5s3.8 1.8 4.5 5" />
          <path d="M17 8v6" />
          <path d="M14 11h6" />
        </>
      ) : null}
      {screen === "schedule" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 10h16" />
          <path d="M8 14h2" />
          <path d="M14 14h2" />
        </>
      ) : null}
      {screen === "employees" ? (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M3.5 19c.8-3.2 2.3-5 4.5-5s3.7 1.8 4.5 5" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M14 18.5c.5-2.3 1.5-3.6 3-3.6 1.7 0 2.8 1.4 3.3 3.6" />
        </>
      ) : null}
      {screen === "accounts" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M10 6h4" />
          <circle cx="12" cy="17" r="1" />
        </>
      ) : null}
      {screen === "routes" ? (
        <>
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="8" r="2.4" />
          <circle cx="10" cy="18" r="2.4" />
          <path d="M8.2 7.2 15.7 7.8" />
          <path d="M16.4 10.1 11.3 16" />
        </>
      ) : null}
      {screen === "users" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="12" cy="10" r="2.6" />
          <path d="M8 17c.7-2.5 2-3.8 4-3.8s3.3 1.3 4 3.8" />
          <path d="M17 5.5v4" />
          <path d="M15 7.5h4" />
        </>
      ) : null}
    </svg>
  );
}
