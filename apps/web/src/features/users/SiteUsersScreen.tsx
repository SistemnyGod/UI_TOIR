import { useEffect, useState } from "react";
import { RoleAccessPanel } from "./components/RoleAccessPanel";
import { SiteUserAccessPanel } from "./components/SiteUserAccessPanel";
import { SiteUserFormPanel } from "./components/SiteUserFormPanel";
import { SiteUsersTablePanel } from "./components/SiteUsersTablePanel";
import { EmptyState } from "../../shared/ui";
import { useSiteUsersWorkspace, type TemporarySiteUserPasswordNotice } from "../../hooks/useSiteUsersWorkspace";
import { findSiteUser } from "../../repositories/siteUsersRepository";
import type { DataSourceMode, SiteUser } from "../../types";

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
  const selectedFromId = findSiteUser(siteUsers, selectedUserId);
  const selected = selectedFromId ?? siteUsers[0];
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<SiteUser | undefined>();
  const [profileUserId, setProfileUserId] = useState<string | undefined>();
  const profileUser = profileUserId ? findSiteUser(siteUsers, profileUserId) : undefined;

  useEffect(() => {
    if (!selectedFromId && siteUsers.length > 0) {
      onSelectUser(siteUsers[0].id);
    }
  }, [onSelectUser, selectedFromId, siteUsers]);

  useEffect(() => {
    if (profileUserId && !profileUser) {
      setProfileUserId(undefined);
    }
  }, [profileUser, profileUserId]);

  function openCreateModal() {
    setEditingUser(undefined);
    setFormMode("create");
  }

  function openEditModal(user: SiteUser) {
    setEditingUser(user);
    setFormMode("edit");
    setProfileUserId(undefined);
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingUser(undefined);
  }

  function openProfileModal(user: SiteUser) {
    setProfileUserId(user.id);
  }

  function closeProfileModal() {
    setProfileUserId(undefined);
  }

  async function createUser(payload: Parameters<typeof siteUsersWorkspace.createUser>[0]) {
    await siteUsersWorkspace.createUser(payload);
    closeFormModal();
  }

  async function updateUser(userId: string, payload: Parameters<typeof siteUsersWorkspace.updateUser>[1]) {
    await siteUsersWorkspace.updateUser(userId, payload);
    closeFormModal();
  }

  async function resetProfilePassword() {
    if (!profileUser) return;
    await siteUsersWorkspace.resetPassword(profileUser);
  }

  async function toggleProfileBlock() {
    if (!profileUser) return;
    await siteUsersWorkspace.toggleBlockUser(profileUser);
  }

  return (
    <>
      <section className="user-admin-screen">
        <div className="user-admin-layout">
          <div className="users-main-column user-admin-main">
            <SiteUsersTablePanel
              canManage={canManage}
              errorMessage={siteUsersWorkspace.errorMessage}
              onOpenCreate={openCreateModal}
              onOpenProfile={openProfileModal}
              onRetry={siteUsersWorkspace.refreshUsers}
              onSelectUser={onSelectUser}
              selectedUserId={selected?.id}
              status={siteUsersWorkspace.status}
              users={siteUsers}
            />

            {siteUsersWorkspace.status === "error" ? (
              <EmptyState
                title="API пользователей не ответил"
                description={siteUsersWorkspace.errorMessage}
                action={<button className="button ghost" onClick={siteUsersWorkspace.refreshUsers} type="button">Повторить загрузку</button>}
              />
            ) : (
              <RoleAccessPanel onNotify={onNotify} users={siteUsers} />
            )}
          </div>

          <SiteUserAccessPanel
            canManage={canManage}
            loadAccess={siteUsersWorkspace.loadUserAccess}
            onNotify={onNotify}
            onOpenProfile={openProfileModal}
            onSavePermissions={siteUsersWorkspace.saveUserPermissions}
            onSaveScopes={siteUsersWorkspace.saveUserScopes}
            user={selected}
          />
        </div>
      </section>

      {formMode ? (
        <div className="site-user-modal-backdrop" onMouseDown={closeFormModal}>
          <div className="site-user-modal site-user-modal-wide" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <SiteUserFormPanel
              canManage={canManage}
              initialUser={editingUser}
              mode={formMode}
              onClose={closeFormModal}
              onCreateUser={createUser}
              onNotify={onNotify}
              onUpdateUser={updateUser}
            />
          </div>
        </div>
      ) : null}

      {profileUser ? (
        <div className="site-user-modal-backdrop" onMouseDown={closeProfileModal}>
          <div className="site-user-modal site-user-profile-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header>
              <div className="site-user-access-identity">
                <span>{getInitials(profileUser.fullName || profileUser.login)}</span>
                <div>
                  <h2>{profileUser.fullName || profileUser.login}</h2>
                  <p>{profileUser.login} · {profileUser.role}</p>
                </div>
              </div>
              <button className="button ghost" onClick={closeProfileModal} type="button">Закрыть</button>
            </header>
            <div className="site-user-profile-facts">
              <span><b>Логин</b>{profileUser.login}</span>
              <span><b>Роль</b>{profileUser.role}</span>
              <span><b>Статус</b>{profileUser.status}</span>
              <span><b>Создан</b>{profileUser.createdAt}</span>
              <span><b>Последний вход</b>{profileUser.lastLogin}</span>
              <span><b>Итоговых прав</b>{profileUser.access.length}</span>
              <span><b>Индивидуальных</b>{profileUser.directPermissions?.length ?? 0}</span>
            </div>
            <footer className="site-user-modal-actions">
              <button className="button ghost" disabled={!canManage} onClick={() => openEditModal(profileUser)} type="button">
                Изменить
              </button>
              <button className="button ghost" disabled={!canManage} onClick={resetProfilePassword} type="button">
                Пересоздать пароль
              </button>
              <button className="button ghost danger" disabled={!canManage} onClick={toggleProfileBlock} type="button">
                {profileUser.status === "Заблокирован" ? "Разблокировать" : "Заблокировать"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "П";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
