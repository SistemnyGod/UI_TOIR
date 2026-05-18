import { Chip, EmptyState, Field, Panel } from "../ui";
import type { SiteUser } from "../../types";

export function SiteUserProfileDrawer({
  user,
  onNotify,
}: {
  user?: SiteUser;
  onNotify: (message: string) => void;
}) {
  return (
    <aside className="side-drawer user-profile-drawer">
      {!user ? (
        <EmptyState
          title="Пользователь не выбран"
          description="Профиль, права и последние входы появятся после выбора учетной записи."
        />
      ) : (
        <>
          <div className="profile-head">
            <span className="avatar profile-avatar">{user.fullName.slice(0, 2)}</span>
            <div>
              <h2>{user.fullName}</h2>
              <p>{user.login}</p>
            </div>
            <Chip>{user.status}</Chip>
          </div>
          <dl className="meta-list">
            <Field label="Роль" value={<Chip>{user.role}</Chip>} />
            <Field label="ID пользователя" value={user.id} />
            <Field label="Создан" value={user.createdAt} />
          </dl>

          <Panel title="Доступ и разрешения" actions={<span>{user.access.length} модулей</span>}>
            <div className="permission-list">
              {user.access.map((module) => <Chip key={module}>{module}</Chip>)}
            </div>
            <button
              className="link-button"
              onClick={() => onNotify("Управление доступом будет доступно после RBAC-модели")}
              type="button"
            >
              Управление доступом
            </button>
          </Panel>

          <Panel title="Последние входы">
            {user.recentSessions.length > 0 ? (
              <ol className="event-list compact-list">
                {user.recentSessions.map((session) => {
                  const [date, ...details] = session.split(" / ");
                  return (
                    <li key={session}>
                      <time>{date}</time>
                      <span>{details.join(" / ") || session}</span>
                      <Chip>Успешно</Chip>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="Входов нет" />
            )}
            <button
              className="link-button"
              onClick={() => onNotify("Полный журнал сессий будет доступен после подключения аудита")}
              type="button"
            >
              Все сессии
            </button>
          </Panel>

          <Panel title="Безопасность и действия">
            <div className="security-action-list">
              <button
                onClick={() => onNotify("Ссылка для сброса пароля будет отправляться после почтового сервиса")}
                type="button"
              >
                <strong>Сбросить пароль</strong>
                <span>Отправить ссылку для сброса</span>
              </button>
              <button
                onClick={() => onNotify("Блокировка пользователя будет доступна после backend RBAC")}
                type="button"
              >
                <strong>Заблокировать пользователя</strong>
                <span>Временно запретить вход</span>
              </button>
              <button
                onClick={() => onNotify("Журнал активности будет доступен после подключения аудита")}
                type="button"
              >
                <strong>Журнал активности</strong>
                <span>Посмотреть действия пользователя</span>
              </button>
            </div>
          </Panel>
        </>
      )}
    </aside>
  );
}
