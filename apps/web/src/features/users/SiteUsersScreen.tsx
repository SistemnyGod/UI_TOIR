import { useEffect, useState } from "react";
import { SiteUserAccessPanel } from "./components/SiteUserAccessPanel";
import { SiteUserFormPanel } from "./components/SiteUserFormPanel";
import { SiteUsersTablePanel } from "./components/SiteUsersTablePanel";
import { EmptyState } from "../../shared/ui";
import { useSiteUsersWorkspace, type TemporarySiteUserPasswordNotice } from "../../hooks/useSiteUsersWorkspace";
import { findSiteUser } from "../../repositories/siteUsersRepository";
import type { DataSourceMode, SiteUser } from "../../types";

export function SiteUsersScreen({
  canManage = true,
  createIntent = 0,
  dataSourceMode,
  selectedUserId,
  onNotify,
  onSelectUser,
  onShowTemporaryPassword,
}: {
  canManage?: boolean;
  createIntent?: number;
  dataSourceMode: DataSourceMode;
  selectedUserId: string;
  onNotify: (message: string) => void;
  onSelectUser: (id: string) => void;
  onShowTemporaryPassword: (notice: TemporarySiteUserPasswordNotice) => void;
}) {
  const workspace = useSiteUsersWorkspace({
    dataSourceMode,
    showTemporaryPassword: onShowTemporaryPassword,
    showToast: onNotify,
  });
  const selected = findSiteUser(workspace.users, selectedUserId) ?? workspace.users[0];
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<SiteUser | undefined>();
  const [hasUnsavedAccessChanges, setHasUnsavedAccessChanges] = useState(false);

  useEffect(() => {
    if (!selected && workspace.users.length > 0) onSelectUser(workspace.users[0].id);
  }, [onSelectUser, selected, workspace.users]);

  useEffect(() => {
    if (createIntent > 0 && canManage) {
      setEditingUser(undefined);
      setFormMode("create");
    }
  }, [canManage, createIntent]);

  function openCreateModal() {
    setEditingUser(undefined);
    setFormMode("create");
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingUser(undefined);
  }

  async function createUser(payload: Parameters<typeof workspace.createUser>[0]) {
    await workspace.createUser(payload);
    closeFormModal();
  }

  async function updateUser(userId: string, payload: Parameters<typeof workspace.updateUser>[1]) {
    await workspace.updateUser(userId, payload);
    closeFormModal();
  }

  async function updateUserRole(userId: string, role: SiteUser["role"]) {
    const target = findSiteUser(workspace.users, userId);
    if (!target) return;
    await workspace.updateUser(userId, {
      fullName: target.fullName,
      login: target.login,
      permissionCodes: target.directPermissions ?? [],
      permissionOverrides: target.permissionOverrides ?? [],
      requirePasswordChange: target.requirePasswordChange,
      role,
      status: target.status,
    });
  }

  function handleSelectUser(id: string) {
    if (id === selected?.id) return;
    if (hasUnsavedAccessChanges && !window.confirm("\u0415\u0441\u0442\u044c \u043d\u0435\u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f. \u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u0431\u0435\u0437 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f?")) return;
    setHasUnsavedAccessChanges(false);
    onSelectUser(id);
  }
  return (
    <>
      <section className="user-admin-screen">
        <div className="user-admin-layout">
          <div className="users-main-column user-admin-main">
            <SiteUsersTablePanel
              canManage={canManage}
              errorMessage={workspace.errorMessage}
              onOpenCreate={openCreateModal}
              onOpenProfile={(user) => handleSelectUser(user.id)}
              onRetry={workspace.refreshUsers}
              onSelectUser={handleSelectUser}
              selectedUserId={selected?.id}
              status={workspace.status}
              users={workspace.users}
            />
            {workspace.status === "error" ? (
              <EmptyState
                title="Не удалось загрузить пользователей"
                description={workspace.errorMessage}
                action={<button className="button ghost" onClick={workspace.refreshUsers} type="button">Повторить</button>}
              />
            ) : null}
          </div>

          <SiteUserAccessPanel
            canManage={canManage}
            catalog={workspace.catalog}
            emuSections={workspace.emuSections}
            loadAccess={workspace.loadUserAccess}
            loadAudit={workspace.loadAudit}
            loadSessions={workspace.loadSessions}
            onChangeRole={updateUserRole}
            onDirtyChange={setHasUnsavedAccessChanges}
            onEditProfile={(target) => { setEditingUser(target); setFormMode("edit"); }}
            onNotify={onNotify}
            onExportAudit={workspace.exportAudit}
            onSavePermissions={workspace.saveUserPermissions}
            onSaveScopes={workspace.saveUserScopes}
            onToggleBlock={workspace.toggleBlockUser}
            user={selected}
          />
        </div>
      </section>

      {formMode ? (
        <div className="site-user-modal-backdrop" onMouseDown={closeFormModal}>
          <div className="site-user-modal site-user-modal-wide" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <SiteUserFormPanel
              canManage={canManage}
              catalog={workspace.catalog}
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
    </>
  );
}
