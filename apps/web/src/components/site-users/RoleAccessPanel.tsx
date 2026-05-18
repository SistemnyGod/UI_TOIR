import { Chip, Panel } from "../ui";
import { countUsersByRole, roleDescriptions } from "../../repositories/siteUsersRepository";
import type { SiteUser } from "../../types";

export function RoleAccessPanel({ users, onNotify }: { users: SiteUser[]; onNotify: (message: string) => void }) {
  return (
    <Panel
      title="Роли и доступ"
      actions={
        <button
          className="button ghost"
          onClick={() => onNotify("Настройка ролей будет отдельным RBAC-экраном")}
          type="button"
        >
          Настроить роли
        </button>
      }
    >
      <div className="role-card-grid">
        {roleDescriptions.map((item) => (
          <div key={item.role}>
            <Chip>{item.role}</Chip>
            <strong>{countUsersByRole(users, item.role)} пользователей</strong>
            <span>{item.description}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
