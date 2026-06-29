import { Chip } from "../../../shared/ui";
import { countUsersByRole, roleDescriptions } from "../../../repositories/siteUsersRepository";
import type { SiteUser } from "../../../types";

export function RoleAccessPanel({ users, onNotify }: { users: SiteUser[]; onNotify: (message: string) => void }) {
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
        <button
          className="button ghost"
          onClick={() => onNotify("Настройка шаблонов ролей будет отдельным RBAC-экраном")}
          type="button"
        >
          Настроить роли
        </button>
      </details>
    </section>
  );
}
