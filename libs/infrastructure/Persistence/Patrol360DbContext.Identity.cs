using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigureSiteUsers(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserEntity>(entity =>
        {
            entity.ToTable("site_users");
            entity.HasKey(user => user.Id);

            entity.Property(user => user.Id).HasColumnName("id");
            entity.Property(user => user.Login).HasColumnName("login").HasMaxLength(120).IsRequired();
            entity.Property(user => user.NormalizedLogin).HasColumnName("normalized_login").HasMaxLength(120).IsRequired();
            entity.Property(user => user.DisplayName).HasColumnName("display_name").HasMaxLength(220).IsRequired();
            entity.Property(user => user.PasswordHash).HasColumnName("password_hash").HasMaxLength(512).IsRequired();
            entity.Property(user => user.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(user => user.CreatedAt).HasColumnName("created_at");
            entity.Property(user => user.LastLoginAt).HasColumnName("last_login_at");
            entity.Property(user => user.RequirePasswordChange).HasColumnName("require_password_change");

            entity.HasIndex(user => user.NormalizedLogin)
                .IsUnique()
                .HasDatabaseName("ux_site_users_normalized_login");
            entity.HasIndex(user => user.Status).HasDatabaseName("ix_site_users_status");
            entity.HasIndex(user => user.DisplayName).HasDatabaseName("ix_site_users_display_name");
        });
    }

    private static void ConfigureRoles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoleEntity>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(role => role.Id);

            entity.Property(role => role.Id).HasColumnName("id");
            entity.Property(role => role.Code).HasColumnName("code").HasMaxLength(120).IsRequired();
            entity.Property(role => role.Name).HasColumnName("name").HasMaxLength(220).IsRequired();

            entity.HasIndex(role => role.Code)
                .IsUnique()
                .HasDatabaseName("ux_roles_code");
        });
    }

    private static void ConfigurePermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PermissionEntity>(entity =>
        {
            entity.ToTable("permissions");
            entity.HasKey(permission => permission.Id);

            entity.Property(permission => permission.Id).HasColumnName("id");
            entity.Property(permission => permission.Code).HasColumnName("code").HasMaxLength(160).IsRequired();
            entity.Property(permission => permission.Name).HasColumnName("name").HasMaxLength(220).IsRequired();
            entity.Property(permission => permission.ModuleKey).HasColumnName("module_key").HasMaxLength(80).IsRequired();
            entity.Property(permission => permission.Category).HasColumnName("category").HasMaxLength(80).IsRequired();
            entity.Property(permission => permission.IsViewDefault).HasColumnName("is_view_default");
            entity.Property(permission => permission.DisplayOrder).HasColumnName("display_order");

            entity.HasIndex(permission => permission.Code)
                .IsUnique()
                .HasDatabaseName("ux_permissions_code");
        });
    }

    private static void ConfigureSiteUserRoles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserRoleEntity>(entity =>
        {
            entity.ToTable("site_user_roles");
            entity.HasKey(userRole => new { userRole.SiteUserId, userRole.RoleId });

            entity.Property(userRole => userRole.SiteUserId).HasColumnName("site_user_id");
            entity.Property(userRole => userRole.RoleId).HasColumnName("role_id");

            entity.HasOne(userRole => userRole.SiteUser)
                .WithMany(user => user.Roles)
                .HasForeignKey(userRole => userRole.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(userRole => userRole.Role)
                .WithMany(role => role.Users)
                .HasForeignKey(userRole => userRole.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureRolePermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RolePermissionEntity>(entity =>
        {
            entity.ToTable("role_permissions");
            entity.HasKey(rolePermission => new { rolePermission.RoleId, rolePermission.PermissionId });

            entity.Property(rolePermission => rolePermission.RoleId).HasColumnName("role_id");
            entity.Property(rolePermission => rolePermission.PermissionId).HasColumnName("permission_id");

            entity.HasOne(rolePermission => rolePermission.Role)
                .WithMany(role => role.Permissions)
                .HasForeignKey(rolePermission => rolePermission.RoleId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(rolePermission => rolePermission.Permission)
                .WithMany(permission => permission.Roles)
                .HasForeignKey(rolePermission => rolePermission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureSiteUserPermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserPermissionEntity>(entity =>
        {
            entity.ToTable("site_user_permissions");
            entity.HasKey(userPermission => new { userPermission.SiteUserId, userPermission.PermissionId });

            entity.Property(userPermission => userPermission.SiteUserId).HasColumnName("site_user_id");
            entity.Property(userPermission => userPermission.PermissionId).HasColumnName("permission_id");
            entity.Property(userPermission => userPermission.Effect).HasColumnName("effect").HasMaxLength(16).IsRequired();

            entity.HasOne(userPermission => userPermission.SiteUser)
                .WithMany(user => user.Permissions)
                .HasForeignKey(userPermission => userPermission.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(userPermission => userPermission.Permission)
                .WithMany(permission => permission.Users)
                .HasForeignKey(userPermission => userPermission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(userPermission => userPermission.PermissionId)
                .HasDatabaseName("ix_site_user_permissions_permission_id");
        });
    }

    private static void ConfigureSiteUserAccessScopes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserAccessScopeEntity>(entity =>
        {
            entity.ToTable("site_user_access_scopes");
            entity.HasKey(scope => scope.Id);

            entity.Property(scope => scope.Id).HasColumnName("id");
            entity.Property(scope => scope.SiteUserId).HasColumnName("site_user_id");
            entity.Property(scope => scope.ModuleKey).HasColumnName("module_key").HasMaxLength(80).IsRequired();
            entity.Property(scope => scope.ScopeType).HasColumnName("scope_type").HasMaxLength(80).IsRequired();
            entity.Property(scope => scope.ScopeId).HasColumnName("scope_id");
            entity.Property(scope => scope.SortOrder).HasColumnName("sort_order");
            entity.Property(scope => scope.CreatedAt).HasColumnName("created_at");
            entity.Property(scope => scope.CreatedByUserId).HasColumnName("created_by_user_id");

            entity.HasOne(scope => scope.SiteUser)
                .WithMany(user => user.AccessScopes)
                .HasForeignKey(scope => scope.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(scope => new { scope.SiteUserId, scope.ModuleKey, scope.ScopeType, scope.ScopeId })
                .IsUnique()
                .HasDatabaseName("ux_site_user_access_scopes_user_scope");
            entity.HasIndex(scope => new { scope.ModuleKey, scope.ScopeType, scope.ScopeId })
                .HasDatabaseName("ix_site_user_access_scopes_scope");
        });
    }

    private static void ConfigureSiteUserSessions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserSessionEntity>(entity =>
        {
            entity.ToTable("site_user_sessions");
            entity.HasKey(session => session.Id);

            entity.Property(session => session.Id).HasColumnName("id");
            entity.Property(session => session.SiteUserId).HasColumnName("site_user_id");
            entity.Property(session => session.TokenHash).HasColumnName("token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.CreatedAt).HasColumnName("created_at");
            entity.Property(session => session.ExpiresAt).HasColumnName("expires_at");
            entity.Property(session => session.RevokedAt).HasColumnName("revoked_at");
            entity.Property(session => session.IpAddress).HasColumnName("ip_address").HasMaxLength(120);
            entity.Property(session => session.UserAgent).HasColumnName("user_agent").HasMaxLength(512);
            entity.Property(session => session.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasOne(session => session.SiteUser)
                .WithMany(user => user.Sessions)
                .HasForeignKey(session => session.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(session => session.TokenHash)
                .IsUnique()
                .HasDatabaseName("ux_site_user_sessions_token_hash");
            entity.HasIndex(session => new { session.SiteUserId, session.ExpiresAt })
                .HasDatabaseName("ix_site_user_sessions_user_expires");
        });
    }

    private static void ConfigureSiteUserAuditEvents(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserAuditEventEntity>(entity =>
        {
            entity.ToTable("site_user_audit_events");
            entity.HasKey(audit => audit.Id);
            entity.Property(audit => audit.Id).HasColumnName("id");
            entity.Property(audit => audit.SiteUserId).HasColumnName("site_user_id");
            entity.Property(audit => audit.ActorUserId).HasColumnName("actor_user_id");
            entity.Property(audit => audit.ActorName).HasColumnName("actor_name").HasMaxLength(220);
            entity.Property(audit => audit.EventType).HasColumnName("event_type").HasMaxLength(120).IsRequired();
            entity.Property(audit => audit.ModuleKey).HasColumnName("module_key").HasMaxLength(80);
            entity.Property(audit => audit.Details).HasColumnName("details").HasMaxLength(1000).IsRequired();
            entity.Property(audit => audit.BeforeJson).HasColumnName("before_json").HasColumnType("jsonb");
            entity.Property(audit => audit.AfterJson).HasColumnName("after_json").HasColumnType("jsonb");
            entity.Property(audit => audit.CreatedAt).HasColumnName("created_at");
            entity.Property(audit => audit.IpAddress).HasColumnName("ip_address").HasMaxLength(120);
            entity.Property(audit => audit.UserAgent).HasColumnName("user_agent").HasMaxLength(512);
            entity.HasOne(audit => audit.SiteUser).WithMany().HasForeignKey(audit => audit.SiteUserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(audit => new { audit.SiteUserId, audit.CreatedAt }).HasDatabaseName("ix_site_user_audit_user_created");
            entity.HasIndex(audit => new { audit.EventType, audit.CreatedAt }).HasDatabaseName("ix_site_user_audit_type_created");
        });
    }

}
