import { Chip, EmptyState, Panel } from "../ui";
import type { SiteUser } from "../../types";

interface SiteUsersTablePanelProps {
  users: SiteUser[];
  selectedUserId?: string;
  onNotify: (message: string) => void;
  onSelectUser: (id: string) => void;
}

export function SiteUsersTablePanel({ users, selectedUserId, onNotify, onSelectUser }: SiteUsersTablePanelProps) {
  return (
    <Panel
      title="Пользователи"
      note="Веб-доступ, роли и статусы учетных записей"
      actions={
        <>
          <button
            className="button primary"
            onClick={() => onNotify("Заполните форму слева для создания пользователя")}
            type="button"
          >
            Создать пользователя
          </button>
          <button
            className="icon-button"
            onClick={() => onNotify("Дополнительные действия пользователей будут доступны после RBAC")}
            title="Дополнительные действия"
            type="button"
          >
            ...
          </button>
        </>
      }
    >
      <div className="filters users-filters">
        <label className="wide-filter">
          Поиск
          <input placeholder="Логин, ФИО или роль" />
        </label>
        <label>
          Роль
          <select defaultValue="all">
            <option value="all">Все роли</option>
          </select>
        </label>
        <label>
          Статус
          <select defaultValue="all">
            <option value="all">Все статусы</option>
          </select>
        </label>
      </div>
      {users.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Логин</th>
                <th>Сотрудник</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Последний вход</th>
                <th>Доступ</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  className={`clickable ${selectedUserId === user.id ? "selected" : ""}`}
                  key={user.id}
                  onClick={() => onSelectUser(user.id)}
                >
                  <td><strong>{user.login}</strong></td>
                  <td>{user.fullName}</td>
                  <td><Chip>{user.role}</Chip></td>
                  <td><Chip>{user.status}</Chip></td>
                  <td>{user.lastLogin}</td>
                  <td><span className="muted-line">{user.access.length} модулей</span></td>
                  <td>
                    <button className="icon-button" onClick={() => onSelectUser(user.id)} title="Открыть" type="button">
                      &gt;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Пользователей сайта нет"
          description="Таблица заполнится после создания учетных записей веб-панели."
          action={
            <button
              className="button ghost"
              onClick={() => onNotify("Заполните форму слева для создания первого пользователя")}
              type="button"
            >
              Создать пользователя
            </button>
          }
        />
      )}
      <div className="table-footer">
        <span>
          Показано {users.length} из {users.length}
        </span>
        <div className="pagination">
          <button disabled={users.length === 0} type="button">&lt;</button>
          <button className="active" type="button">1</button>
          <button disabled={users.length === 0} type="button">&gt;</button>
        </div>
      </div>
    </Panel>
  );
}
