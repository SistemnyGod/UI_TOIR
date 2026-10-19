import { useEffect, useMemo, useRef, useState } from "react";
import type { PercoUnmatchedEmployeeDto } from "../../api/contracts";
import type { EmployeeDirectoryItem } from "../../types";
import { ConfirmIgnoreEmployeeModal, EmptyBlock, ListPagination, type LoadStatus, defaultListPageSize, getMatchSuggestionReason, isBusyStatus, normalizeSearch, usePercoPagination } from "./percoScreenSupport";

export function MatchingTab({
  errorMessage,
  canMatch,
  employeeOptions,
  search,
  selectedMatch,
  status,
  unmatchedEmployees,
  onSearch,
  onSelect,
  onSubmit,
}: {
  errorMessage?: string | null;
  canMatch: boolean;
  employeeOptions: EmployeeDirectoryItem[];
  search: string;
  selectedMatch: Record<string, string | null>;
  status: LoadStatus;
  unmatchedEmployees: PercoUnmatchedEmployeeDto[];
  onSearch: (value: string) => void;
  onSelect: (percoEmployeeId: string, employeeId: string) => void;
  onSubmit: (percoEmployeeId: string, action: "match" | "ignore") => Promise<boolean>;
}) {
  const [ignoreCandidate, setIgnoreCandidate] = useState<PercoUnmatchedEmployeeDto | null>(null);
  const [ignoreSaving, setIgnoreSaving] = useState(false), [ignoreError, setIgnoreError] = useState("");
  const ignorePending = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function confirmIgnore() {
    if (!canMatch || !ignoreCandidate || ignorePending.current) return;
    const id = ignoreCandidate.percoEmployeeId;
    ignorePending.current = true; setIgnoreSaving(true); setIgnoreError("");
    try {
      const accepted = await onSubmit(id, "ignore");
      if (alive.current && accepted) setIgnoreCandidate(current => current?.percoEmployeeId === id ? null : current);
    } catch (reason) { if (alive.current) setIgnoreError(reason instanceof Error ? reason.message : "Не удалось сохранить действие. Повторите попытку."); }
    finally { ignorePending.current = false; if (alive.current) setIgnoreSaving(false); }
  }
  const [percoQuery, setPercoQuery] = useState("");
  const normalizedPercoQuery = useMemo(() => normalizeSearch(percoQuery), [percoQuery]);
  const filteredUnmatchedEmployees = useMemo(
    () =>
      unmatchedEmployees.filter((item) =>
        !normalizedPercoQuery ||
        normalizeSearch(`${item.fullName} ${item.personnelNo} ${item.cardNumber} ${item.department}`).includes(normalizedPercoQuery),
      ),
    [normalizedPercoQuery, unmatchedEmployees],
  );
  const suggestedCount = filteredUnmatchedEmployees.filter((item) => item.suggestedEmployeeId).length;
  const pagination = usePercoPagination(filteredUnmatchedEmployees, defaultListPageSize, normalizedPercoQuery);

  return (
    <section className="perco-card">
      <header>
        <div>
          <h2>Сопоставление сотрудников</h2>
          <span>Свяжите сотрудников PERCo с действующим справочником проекта по ФИО, табельному номеру или карте.</span>
        </div>
      </header>
      <div className="perco-match-toolbar">
        <input
          aria-label="Поиск сотрудника PERCO"
          onChange={(event) => setPercoQuery(event.target.value)}
          placeholder="Найти сотрудника PERCO"
          type="search"
          value={percoQuery}
        />
        <input
          aria-label="Фильтр кандидатов проекта"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Фильтр кандидатов проекта"
          type="search"
          value={search}
        />
        <span>PERCO: {filteredUnmatchedEmployees.length} · готовых рекомендаций: {suggestedCount} · кандидатов: {employeeOptions.length}</span>
      </div>
      {filteredUnmatchedEmployees.length === 0 ? (
        <EmptyBlock title={normalizedPercoQuery ? "Сотрудники по запросу не найдены" : "Несопоставленных сотрудников нет"} text={normalizedPercoQuery ? "Измените ФИО, табельный номер или карту в поиске." : "Новые записи появятся после синхронизации сотрудников PERCo."} />
      ) : (
        <>
          <div className="perco-table">
            {pagination.pageItems.map((item) => (
              <article key={item.percoEmployeeId}>
              <div>
                <strong>{item.fullName || "Без ФИО"}</strong>
                <span>
                  Табельный: {item.personnelNo || "-"} · карта: {item.cardNumber || "-"} · {item.department || "подразделение не указано"}
                </span>
                {item.suggestedEmployeeName ? (
                  <small className="perco-match-suggestion">
                    Рекомендация: <b>{item.suggestedEmployeeName}</b> · {getMatchSuggestionReason(item, employeeOptions)} · подставлено автоматически, проверьте перед подтверждением.
                  </small>
                ) : (
                  <small className="perco-match-empty-hint">Совпадение не найдено автоматически. Используйте поиск кандидатов проекта.</small>
                )}
              </div>
              <div className="perco-match-actions">
                <select
                  aria-label={`Сотрудник проекта для ${item.fullName || item.percoEmployeeId}`}
                  disabled={!canMatch || isBusyStatus(status)}
                  onChange={(event) => onSelect(item.percoEmployeeId, event.target.value)}
                  value={selectedMatch[item.percoEmployeeId] ?? ""}
                >
                  <option value="">Выберите сотрудника</option>
                  {item.suggestedEmployeeId && !employeeOptions.some((employee) => employee.id === item.suggestedEmployeeId) ? (
                    <option value={item.suggestedEmployeeId}>{item.suggestedEmployeeName} · рекомендация</option>
                  ) : null}
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} · {employee.personnelNo || "без таб."}
                    </option>
                  ))}
                </select>
                <button className="perco-button perco-button-primary" disabled={!canMatch || isBusyStatus(status) || !selectedMatch[item.percoEmployeeId]} onClick={() => onSubmit(item.percoEmployeeId, "match")} type="button">
                  {status === "saving" ? "Сохраняем…" : item.suggestedEmployeeId && selectedMatch[item.percoEmployeeId] === item.suggestedEmployeeId ? "Подтвердить предложение" : "Связать"}
                </button>
                <button className="perco-button perco-button-secondary" disabled={!canMatch || isBusyStatus(status)} onClick={() => { setIgnoreError(""); setIgnoreCandidate(item); }} type="button">
                  Игнорировать
                </button>
              </div>
              </article>
            ))}
          </div>
          <ListPagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            total={filteredUnmatchedEmployees.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
      {ignoreCandidate ? (
        <ConfirmIgnoreEmployeeModal
          employee={ignoreCandidate}
          pending={ignoreSaving || isBusyStatus(status)}
          errorMessage={ignoreError || errorMessage}
          onCancel={() => { if (!ignorePending.current) setIgnoreCandidate(null); }}
          onConfirm={() => void confirmIgnore()}
        />
      ) : null}
    </section>
  );
}

