import { Chip, EmptyState, Field, Panel } from "../ui";
import type { SiteUser } from "../../types";

export function SiteUserProfileDrawer({
  user,
  onNotify,
  onResetPassword,
  onToggleBlock,
}: {
  user?: SiteUser;
  onNotify: (message: string) => void;
  onResetPassword?: (user: SiteUser) => Promise<void> | void;
  onToggleBlock?: (user: SiteUser) => Promise<void> | void;
}) {
  const canManage = Boolean(onResetPassword && onToggleBlock);

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

          <Panel title="Доступ и разрешения" actions={<span>{user.access.length} прав</span>}>
            <div className="permission-list">
              {user.access.map((permission) => <Chip key={permission}>{permission}</Chip>)}
            </div>
            <button
              className="link-button"
              onClick={() => onNotify("Редактирование матрицы доступа будет вынесено в отдельный RBAC экран")}
              type="button"
            >
              Управление доступом
            </button>
          </Panel>

          <Panel title="Последние входы">
            {user.recentSessions.length > 0 ? (
              <ol className="event-list compact-list">
                {user.recentSessions.map((session) => (
                  <li key={session}>
                    <time>{session}</time>
                    <span>{user.login}</span>
                    <Chip>Успешно</Chip>
                  </li>
                ))}
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
              <button disabled={!canManage} onClick={() => void onResetPassword?.(user)} type="button">
                <strong>Сбросить пароль</strong>
                <span>Выдать временный пароль из backend</span>
              </button>
              <button disabled={!canManage} onClick={() => void onToggleBlock?.(user)} type="button">
                <strong>{user.status === "Заблокирован" ? "Разблокировать пользователя" : "Заблокировать пользователя"}</strong>
                <span>{user.status === "Заблокирован" ? "Вернуть доступ к входу" : "Временно запретить вход"}</span>
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
