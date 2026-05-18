export function AssignmentToolbar() {
  return (
    <div className="toolbar-row">
      <label className="toggle-filter">
        <input defaultChecked type="checkbox" /> Только свободные
      </label>
      <label>
        Территория
        <select defaultValue="north">
          <option value="north">Промзона Север</option>
        </select>
      </label>
      <label>
        Смена
        <select defaultValue="day">
          <option value="day">День (07:00-19:00)</option>
          <option value="night">Ночь (19:00-07:00)</option>
        </select>
      </label>
      <label>
        Приоритет
        <select defaultValue="all">
          <option value="all">Все</option>
        </select>
      </label>
      <label className="wide-filter">
        Поиск
        <input placeholder="Сотрудник, маршрут, зона" />
      </label>
    </div>
  );
}
