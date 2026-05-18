type ChromeIconName = "bell" | "calendar" | "menu" | "message" | "plant" | "search" | "shield" | "sun";

export function ChromeIcon({ name }: { name: ChromeIconName }) {
  return (
    <svg className="chrome-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "shield" ? (
        <path d="M12 3 5.5 5.4v5.7c0 4.1 2.6 7.8 6.5 9.4 3.9-1.6 6.5-5.3 6.5-9.4V5.4L12 3Z" />
      ) : null}
      {name === "menu" ? (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      ) : null}
      {name === "calendar" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 10h16" />
        </>
      ) : null}
      {name === "sun" ? (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.8v2" />
          <path d="M12 19.2v2" />
          <path d="m4.7 4.7 1.4 1.4" />
          <path d="m17.9 17.9 1.4 1.4" />
          <path d="M2.8 12h2" />
          <path d="M19.2 12h2" />
          <path d="m4.7 19.3 1.4-1.4" />
          <path d="m17.9 6.1 1.4-1.4" />
        </>
      ) : null}
      {name === "plant" ? (
        <>
          <path d="M4 19h16" />
          <path d="M7 19V9l5-3 5 3v10" />
          <path d="M9 19v-5h6v5" />
          <path d="M9 11h.1" />
          <path d="M12 11h.1" />
          <path d="M15 11h.1" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </>
      ) : null}
      {name === "bell" ? (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </>
      ) : null}
      {name === "message" ? (
        <>
          <path d="M5 5h14v10H8l-3 3V5Z" />
          <path d="M8 9h8" />
          <path d="M8 12h5" />
        </>
      ) : null}
    </svg>
  );
}
