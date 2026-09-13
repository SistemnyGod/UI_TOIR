import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { ModalShell } from "../../shared/ui/ModalShell";

export function MobileSearch({ query, onChange, onSearch }: { query: string; onChange: (value: string) => void; onSearch: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button className="topbar-mobile-search" ref={trigger} type="button" onClick={() => setOpen(true)} aria-label="Открыть поиск">
      <Search size={18} aria-hidden="true" /> Поиск
    </button>
    {open ? <ModalShell title="Поиск по обходам" subtitle="Область поиска: обходы, маршруты и сотрудники." onClose={() => setOpen(false)} restoreFocusRef={trigger}>
      <form className="mobile-search-form" onSubmit={(event) => { event.preventDefault(); onSearch(query); setOpen(false); }}>
        <label htmlFor="mobile-global-search">Что найти</label>
        <input id="mobile-global-search" type="search" value={query} onChange={(event) => onChange(event.target.value)} />
        <button className="ui-button is-primary" type="submit">Найти</button>
      </form>
    </ModalShell> : null}
  </>;
}
