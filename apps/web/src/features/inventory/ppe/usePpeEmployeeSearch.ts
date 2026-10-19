import { useEffect, useMemo, useRef, useState } from "react";
import type { InventoryEmployeeDto } from "../../../api/contracts";
import type { InventoryRepository } from "../../../repositories/inventoryRepository";

export function usePpeEmployeeSearch(repository: InventoryRepository, owner: string, selectedId: string) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [pages, setPages] = useState<Record<number, InventoryEmployeeDto[]>>({}), [selected, setSelected] = useState<InventoryEmployeeDto>();
  const [loading, setLoading] = useState(false), [hasMore, setHasMore] = useState(false), [total, setTotal] = useState(0);
  const [listError, setListError] = useState(""), [selectedError, setSelectedError] = useState("");
  const generation = useRef(0), pendingPage = useRef(false);
  useEffect(() => {
    setPages({}); setSelected(undefined); setQuery(""); setPage(1);
    setListError(""); setSelectedError(""); setHasMore(false); setTotal(0);
  }, [repository, owner]);
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController();
    pendingPage.current = true; setLoading(true);
    const timer = window.setTimeout(() => {
      void repository.getEmployees({ query: query.trim() || undefined, page, pageSize: 50, status: "active" }, { signal: controller.signal })
        .then(result => {
          if (current !== generation.current) return;
          setPages(old => page === 1 ? { 1: result.rows } : { ...old, [page]: result.rows });
          setHasMore(page < result.pageCount); setTotal(result.total); setListError("");
        })
        .catch(reason => {
          if (!controller.signal.aborted && current === generation.current)
            setListError(reason instanceof Error ? reason.message : "Не удалось найти сотрудников");
        })
        .finally(() => {
          if (current === generation.current) { pendingPage.current = false; setLoading(false); }
        });
    }, 300);
    return () => { generation.current++; controller.abort(); window.clearTimeout(timer); };
  }, [repository, owner, query, page, revision]);
  useEffect(() => {
    let active = true; setSelected(undefined); setSelectedError("");
    if (selectedId) void repository.getEmployee(selectedId)
      .then(value => {
        if (!active) return;
        if (value.id !== selectedId) throw new Error("Сервер вернул другого сотрудника. Повторите загрузку.");
        setSelected(value);
      })
      .catch(reason => { if (active) setSelectedError(reason instanceof Error ? reason.message : "Не удалось восстановить сотрудника"); });
    return () => { active = false; };
  }, [repository, owner, selectedId, revision]);
  const rows = useMemo(() => [...new Map(Object.keys(pages).map(Number).sort((a,b) => a-b).flatMap(key => pages[key]).map(row => [row.id, row])).values()], [pages]);
  const employees = useMemo(() => selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows, [rows, selected]);
  return {
    rows, employees, loading, hasMore, total, query,
    error: [listError, selectedError].filter(Boolean).join(" "),
    search: (value: string) => { setQuery(value); setPage(1); },
    retry: () => setRevision(value => value + 1),
    more: () => {
      if (loading || pendingPage.current || !hasMore) return;
      pendingPage.current = true;
      if (listError) setRevision(value => value + 1);
      else setPage(value => value + 1);
    },
  };
}
