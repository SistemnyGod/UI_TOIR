import { RoleAccessPanel } from "../components/site-users/RoleAccessPanel";
import { SiteUserFormPanel } from "../components/site-users/SiteUserFormPanel";
import { SiteUserProfileDrawer } from "../components/site-users/SiteUserProfileDrawer";
import { SiteUsersTablePanel } from "../components/site-users/SiteUsersTablePanel";
import { findSiteUser, siteUsersFallback } from "../repositories/siteUsersRepository";

export function SiteUsersScreen({
  selectedUserId,
  onNotify,
  onSelectUser,
}: {
  selectedUserId: string;
  onNotify: (message: string) => void;
  onSelectUser: (id: string) => void;
}) {
  const siteUsers = siteUsersFallback;
  const selected = findSiteUser(siteUsers, selectedUserId);

  return (
    <div className="user-admin-layout">
      <SiteUserFormPanel onNotify={onNotify} />

      <div className="users-main-column">
        <SiteUsersTablePanel
          onNotify={onNotify}
          onSelectUser={onSelectUser}
          selectedUserId={selected?.id}
          users={siteUsers}
        />
        <RoleAccessPanel onNotify={onNotify} users={siteUsers} />
      </div>

      <SiteUserProfileDrawer onNotify={onNotify} user={selected} />
    </div>
  );
}
