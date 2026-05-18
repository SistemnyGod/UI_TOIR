import type { PatrolResult, ResultMode, ScreenId } from "../../types";
import { Chip, EmptyState, Panel, SectionTabs } from "../ui";

export function ResultsJournalPanel({
  mode,
  onModeChange,
  onNavigate,
  onNotify,
  onSelectResult,
  results,
  selectedResultId,
  totalResults,
}: {
  mode: ResultMode;
  onModeChange: (mode: ResultMode) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onSelectResult: (id: string) => void;
  results: PatrolResult[];
  selectedResultId: string;
  totalResults: PatrolResult[];
}) {
  return (
    <Panel
      title="Журнал результатов"
      note="Фильтры и таблица результатов обходов"
      actions={
        <button className="button primary" onClick={() => onNotify("Экспорт будет сформирован после подключения результатов")} type="button">
          Экспорт
        </button>
      }
    >
      <SectionTabs
        value={mode}
        onChange={onModeChange}
        tabs={[
          { id: "all", label: "Все", count: totalResults.length },
          { id: "issues", label: "Замечания", count: totalResults.filter((item) => item.status === "Замечание").length },
          { id: "late", label: "Просрочено", count: totalResults.filter((item) => item.status === "Просрочено").length },
          { id: "photos", label: "С фото", count: totalResults.filter((item) => item.photos > 0).length },
        ]}
      />
      <div className="filters">
        <label>Период<input placeholder="Период не выбран" /></label>
        <label>Территория<select defaultValue="north"><option value="north">Промзона Север</option></select></label>
        <label>Маршрут<select defaultValue="all"><option value="all">Все маршруты</option></select></label>
        <label>Смена<select defaultValue="all"><option value="all">Все смены</option></select></label>
        <label className="wide-filter">Поиск<input placeholder="Точка, сотрудник, маршрут, комментарий" /></label>
      </div>
      {results.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Статус</th>
                <th>Точка</th>
                <th>Сотрудник</th>
                <th>Маршрут</th>
                <th>Смена</th>
                <th>План / факт</th>
                <th>Отклонение</th>
                <th>Фото</th>
                <th>Тип замечания</th>
                <th>Серьезность</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr
                  className={`clickable ${selectedResultId === result.id ? "selected" : ""}`}
                  key={result.id}
                  onClick={() => onSelectResult(result.id)}
                >
                  <td><Chip>{result.status}</Chip></td>
                  <td><strong>{result.point}</strong><span className="muted-line">ID: {result.pointId}</span></td>
                  <td><strong>{result.employee}</strong><span className="muted-line">ID: {result.employeeId}</span></td>
                  <td>{result.route}</td>
                  <td><Chip>{result.shift}</Chip></td>
                  <td>{result.plannedAt}<span className="muted-line">{result.actualAt}</span></td>
                  <td className={result.deviation.startsWith("+") ? "danger-text" : "success-text"}>{result.deviation}</td>
                  <td>{result.photos}</td>
                  <td>{result.issueType}</td>
                  <td>{result.severity === "-" ? "—" : <Chip>{result.severity}</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Результатов нет"
          description="Таблица заполнится после получения результатов обходов."
          action={<button className="button ghost" onClick={() => onNavigate("assign")} type="button">Перейти к назначениям</button>}
        />
      )}
      <div className="table-footer">
        <span>Показано {results.length} из {totalResults.length}</span>
        <div className="pagination">
          <button disabled={results.length === 0} type="button">‹</button>
          <button className="active" type="button">1</button>
          <button disabled={results.length === 0} type="button">2</button>
          <button disabled={results.length === 0} type="button">3</button>
          <button disabled={results.length === 0} type="button">›</button>
        </div>
      </div>
    </Panel>
  );
}
