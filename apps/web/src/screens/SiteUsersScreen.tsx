import { RoleAccessPanel } from "../components/site-users/RoleAccessPanel";
import { SiteUserFormPanel } from "../components/site-users/SiteUserFormPanel";
import { SiteUserProfileDrawer } from "../components/site-users/SiteUserProfileDrawer";
import { SiteUsersTablePanel } from "../components/site-users/SiteUsersTablePanel";
import { EmptyState } from "../components/ui";
import { useSiteUsersWorkspace, type TemporarySiteUserPasswordNotice } from "../hooks/useSiteUsersWorkspace";
import { findSiteUser } from "../repositories/siteUsersRepository";
import type { DataSourceMode } from "../types";

export function SiteUsersScreen({
  canManage = true,
  dataSourceMode,
  selectedUserId,
  onNotify,
  onSelectUser,
  onShowTemporaryPassword,
}: {
  canManage?: boolean;
  dataSourceMode: DataSourceMode;
  selectedUserId: string;
  onNotify: (message: string) => void;
  onSelectUser: (id: string) => void;
  onShowTemporaryPassword: (notice: TemporarySiteUserPasswordNotice) => void;
}) {
  const siteUsersWorkspace = useSiteUsersWorkspace({
    dataSourceMode,
    showTemporaryPassword: onShowTemporaryPassword,
    showToast: onNotify,
  });
  const siteUsers = siteUsersWorkspace.users;
  const selected = findSiteUser(siteUsers, selectedUserId) ?? siteUsers[0];

  return (
    <div className="user-admin-layout">
      <SiteUserFormPanel canManage={canManage} onCreateUser={siteUsersWorkspace.createUser} onNotify={onNotify} />

      <div className="users-main-column">
        <SiteUsersTablePanel
          errorMessage={siteUsersWorkspace.errorMessage}
          onNotify={onNotify}
          onRetry={siteUsersWorkspace.refreshUsers}
          onSelectUser={onSelectUser}
          selectedUserId={selected?.id}
          status={siteUsersWorkspace.status}
          users={siteUsers}
        />
        {siteUsersWorkspace.status === "error" ? (
          <EmptyState
            title="Пользователи сайта API не загружены"
            description={siteUsersWorkspace.errorMessage}
            action={
              <button className="button ghost" onClick={siteUsersWorkspace.refreshUsers} type="button">
                Повторить загрузку
              </button>
            }
          />
        ) : (
          <RoleAccessPanel onNotify={onNotify} users={siteUsers} />
        )}
      </div>

      <SiteUserProfileDrawer
        onNotify={onNotify}
        onResetPassword={canManage ? siteUsersWorkspace.resetPassword : undefined}
        onToggleBlock={canManage ? siteUsersWorkspace.toggleBlockUser : undefined}
        user={selected}
      />
    </div>
  );
}
