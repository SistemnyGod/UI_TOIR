import { Chip } from "../../../shared/ui";
import { countUsersByRole, roleDescriptions } from "../../../repositories/siteUsersRepository";
import type { SiteUser } from "../../../types";

export function RoleAccessPanel({ users }: { users: SiteUser[] }) {
  return (
    <section className="site-user-roles-panel role-access-panel">
      <details>
        <summary>
          <span>
            <strong>Роли и доступ</strong>
            <small>Базовые шаблоны прав, точная настройка справа.</small>
          </span>
          <em>{roleDescriptions.length}</em>
        </summary>
        <div className="role-card-grid">
          {roleDescriptions.map((item) => (
            <article key={item.role}>
              <Chip>{item.role}</Chip>
              <strong>{countUsersByRole(users, item.role)} пользователей</strong>
              <span>{item.description}</span>
            </article>
          ))}
        </div>
        <p className="site-user-roles-hint">Роль задаётся в панели доступа выбранного пользователя, а точные персональные права — ниже в редакторе разрешений.</p>
      </details>
    </section>
  );
}
