using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigureMobileAccounts(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountEntity>(entity =>
        {
            entity.ToTable("mobile_accounts");
            entity.HasKey(account => account.Id);

            entity.Property(account => account.Id).HasColumnName("id");
            entity.Property(account => account.Login).HasColumnName("login").HasMaxLength(120).IsRequired();
            entity.Property(account => account.PasswordHash).HasColumnName("password_hash").HasMaxLength(512).IsRequired();
            entity.Property(account => account.PasswordResetRequired).HasColumnName("password_reset_required");
            entity.Property(account => account.LastPasswordResetAt).HasColumnName("last_password_reset_at");
            entity.Property(account => account.EmployeeScope).HasColumnName("employee_scope").HasMaxLength(40).IsRequired();
            entity.Property(account => account.BoundEmployees).HasColumnName("bound_employees");
            entity.Property(account => account.Role).HasColumnName("role").HasMaxLength(160).IsRequired();
            entity.Property(account => account.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(account => account.Session).HasColumnName("session").HasMaxLength(60).IsRequired();
            entity.Property(account => account.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(account => account.Device).HasColumnName("device").HasMaxLength(160).IsRequired();
            entity.Property(account => account.RestrictToBoundDevice).HasColumnName("restrict_to_bound_device").HasDefaultValue(false).IsRequired();
            entity.Property(account => account.Version).HasColumnName("version").HasMaxLength(40).IsRequired();
            entity.Property(account => account.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(account => account.Login)
                .IsUnique()
                .HasDatabaseName("ux_mobile_accounts_login");

            entity.HasIndex(account => account.Status).HasDatabaseName("ix_mobile_accounts_status");
        });
    }

    private static void ConfigureMobileAccountEmployeeBindings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountEmployeeBindingEntity>(entity =>
        {
            entity.ToTable("mobile_account_employee_bindings");
            entity.HasKey(binding => binding.Id);

            entity.Property(binding => binding.Id).HasColumnName("id");
            entity.Property(binding => binding.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(binding => binding.EmployeeId).HasColumnName("employee_id");
            entity.Property(binding => binding.DisplayName).HasColumnName("display_name").HasMaxLength(240).IsRequired();
            entity.Property(binding => binding.CreatedAt).HasColumnName("created_at");
            entity.Property(binding => binding.DetachedAt).HasColumnName("detached_at");

            entity.HasOne(binding => binding.MobileAccount)
                .WithMany(account => account.EmployeeBindings)
                .HasForeignKey(binding => binding.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(binding => binding.Employee)
                .WithMany()
                .HasForeignKey(binding => binding.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(binding => new { binding.MobileAccountId, binding.EmployeeId, binding.DetachedAt })
                .HasDatabaseName("ix_mobile_account_employee_bindings_account_employee");
            entity.HasIndex(binding => binding.EmployeeId)
                .HasDatabaseName("ix_mobile_account_employee_bindings_employee");
        });
    }

    private static void ConfigureMobileAccountSessions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountSessionEntity>(entity =>
        {
            entity.ToTable("mobile_account_sessions");
            entity.HasKey(session => session.Id);

            entity.Property(session => session.Id).HasColumnName("id");
            entity.Property(session => session.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(session => session.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(session => session.DeviceId).HasColumnName("device_id").HasMaxLength(120).IsRequired();
            entity.Property(session => session.Device).HasColumnName("device").HasMaxLength(160).IsRequired();
            entity.Property(session => session.Platform).HasColumnName("platform").HasMaxLength(80).IsRequired();
            entity.Property(session => session.AppVersion).HasColumnName("app_version").HasMaxLength(40).IsRequired();
            entity.Property(session => session.IpAddress).HasColumnName("ip_address").HasMaxLength(80).IsRequired();
            entity.Property(session => session.PushToken).HasColumnName("push_token").HasMaxLength(512).IsRequired();
            entity.Property(session => session.PushTokenRegisteredAt).HasColumnName("push_token_registered_at");
            entity.Property(session => session.PushTokenRevokedAt).HasColumnName("push_token_revoked_at");
            entity.Property(session => session.TokenHash).HasColumnName("token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.RefreshTokenHash).HasColumnName("refresh_token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenHash).HasColumnName("previous_refresh_token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.PreviousAccessTokenProtected).HasColumnName("previous_access_token_protected").HasMaxLength(4096).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenProtected).HasColumnName("previous_refresh_token_protected").HasMaxLength(4096).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenValidUntil).HasColumnName("previous_refresh_token_valid_until");
            entity.Property(session => session.RefreshGeneration).HasColumnName("refresh_generation").IsRequired().IsConcurrencyToken();
            entity.Property(session => session.CreatedAt).HasColumnName("created_at");
            entity.Property(session => session.ExpiresAt).HasColumnName("expires_at");
            entity.Property(session => session.RefreshExpiresAt).HasColumnName("refresh_expires_at");
            entity.Property(session => session.RevokedAt).HasColumnName("revoked_at");
            entity.Property(session => session.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasOne(session => session.MobileAccount)
                .WithMany(account => account.Sessions)
                .HasForeignKey(session => session.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(session => new { session.MobileAccountId, session.LastSeenAt })
                .HasDatabaseName("ix_mobile_account_sessions_account_seen");
            entity.HasIndex(session => session.TokenHash)
                .IsUnique()
                .HasFilter("token_hash <> ''")
                .HasDatabaseName("ux_mobile_account_sessions_token_hash");
            entity.HasIndex(session => session.PreviousRefreshTokenHash)
                .HasDatabaseName("ix_mobile_account_sessions_previous_refresh_token_hash")
                .HasFilter("previous_refresh_token_hash <> ''");
            entity.HasIndex(session => session.RefreshTokenHash)
                .IsUnique()
                .HasFilter("refresh_token_hash <> ''")
                .HasDatabaseName("ux_mobile_account_sessions_refresh_token_hash");
        });
    }

    private static void ConfigureMobileDevices(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileDeviceEntity>(entity =>
        {
            entity.ToTable("mobile_devices");
            entity.HasKey(device => device.DeviceId);

            entity.Property(device => device.DeviceId).HasColumnName("device_id").HasMaxLength(120);
            entity.Property(device => device.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(device => device.Trusted).HasColumnName("trusted").IsRequired();
            entity.Property(device => device.BlockedAt).HasColumnName("blocked_at");
            entity.Property(device => device.BlockReason).HasColumnName("block_reason").HasMaxLength(240).IsRequired();
            entity.Property(device => device.CreatedAt).HasColumnName("created_at");
            entity.Property(device => device.UpdatedAt).HasColumnName("updated_at");
            entity.Property(device => device.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasOne(device => device.MobileAccount)
                .WithMany()
                .HasForeignKey(device => device.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(device => device.MobileAccountId)
                .HasDatabaseName("ix_mobile_devices_account");
            entity.HasIndex(device => device.BlockedAt)
                .HasDatabaseName("ix_mobile_devices_blocked_at");
        });
    }
    private static void ConfigureMobileRefreshTokenHistories(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileRefreshTokenHistoryEntity>(entity =>
        {
            entity.ToTable("mobile_refresh_token_histories");
            entity.HasKey(history => history.Id);

            entity.Property(history => history.Id).HasColumnName("id");
            entity.Property(history => history.MobileAccountSessionId).HasColumnName("mobile_account_session_id");
            entity.Property(history => history.TokenHash).HasColumnName("token_hash").HasMaxLength(128).IsRequired();
            entity.Property(history => history.Generation).HasColumnName("generation").IsRequired();
            entity.Property(history => history.RotatedAt).HasColumnName("rotated_at");
            entity.Property(history => history.ClientOperationId).HasColumnName("client_operation_id").HasMaxLength(120);
            entity.Property(history => history.AccessTokenProtected).HasColumnName("access_token_protected").HasMaxLength(4096);
            entity.Property(history => history.RefreshTokenProtected).HasColumnName("refresh_token_protected").HasMaxLength(4096);
            entity.Property(history => history.AccessTokenExpiresAt).HasColumnName("access_token_expires_at");
            entity.Property(history => history.RefreshTokenExpiresAt).HasColumnName("refresh_token_expires_at");
            entity.Property(history => history.ReplayValidUntil).HasColumnName("replay_valid_until");

            entity.HasOne(history => history.MobileAccountSession)
                .WithMany()
                .HasForeignKey(history => history.MobileAccountSessionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(history => history.TokenHash)
                .IsUnique()
                .HasDatabaseName("ux_mobile_refresh_token_histories_token_hash");
            entity.HasIndex(history => history.MobileAccountSessionId)
                .HasDatabaseName("ix_mobile_refresh_token_histories_session");
        });
    }
    private static void ConfigureMobileAccountAuditEvents(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountAuditEventEntity>(entity =>
        {
            entity.ToTable("mobile_account_audit_events");
            entity.HasKey(auditEvent => auditEvent.Id);

            entity.Property(auditEvent => auditEvent.Id).HasColumnName("id");
            entity.Property(auditEvent => auditEvent.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(auditEvent => auditEvent.Action).HasColumnName("action").HasMaxLength(120).IsRequired();
            entity.Property(auditEvent => auditEvent.Details).HasColumnName("details").HasMaxLength(500).IsRequired();
            entity.Property(auditEvent => auditEvent.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(auditEvent => auditEvent.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(auditEvent => new { auditEvent.MobileAccountId, auditEvent.CreatedAt })
                .HasDatabaseName("ix_mobile_account_audit_account_created");
            entity.HasIndex(auditEvent => auditEvent.Action)
                .HasDatabaseName("ix_mobile_account_audit_action");
        });
    }

    private static void ConfigureMobileNotifications(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileNotificationEntity>(entity =>
        {
            entity.ToTable("mobile_notifications");
            entity.HasKey(notification => notification.Id);

            entity.Property(notification => notification.Id).HasColumnName("id");
            entity.Property(notification => notification.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(notification => notification.EmployeeId).HasColumnName("employee_id");
            entity.Property(notification => notification.Type).HasColumnName("notification_type").HasMaxLength(80).IsRequired();
            entity.Property(notification => notification.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(notification => notification.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(notification => notification.EntityType).HasColumnName("entity_type").HasMaxLength(80);
            entity.Property(notification => notification.EntityId).HasColumnName("entity_id").HasMaxLength(120);
            entity.Property(notification => notification.IdempotencyKey).HasColumnName("idempotency_key").HasMaxLength(160).IsRequired();
            entity.Property(notification => notification.PushStatus).HasColumnName("push_status").HasMaxLength(40).IsRequired();
            entity.Property(notification => notification.PushTokenSnapshot).HasColumnName("push_token_snapshot").HasMaxLength(512).IsRequired();
            entity.Property(notification => notification.PushAttemptCount).HasColumnName("push_attempt_count");
            entity.Property(notification => notification.PushLastError).HasColumnName("push_last_error").HasMaxLength(1200).IsRequired();
            entity.Property(notification => notification.PushSentAt).HasColumnName("push_sent_at");
            entity.Property(notification => notification.PushClaimedAt).HasColumnName("push_claimed_at");
            entity.Property(notification => notification.CreatedAt).HasColumnName("created_at");
            entity.Property(notification => notification.ReadAt).HasColumnName("read_at");

            entity.HasOne(notification => notification.MobileAccount)
                .WithMany()
                .HasForeignKey(notification => notification.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(notification => new { notification.MobileAccountId, notification.CreatedAt })
                .HasDatabaseName("ix_mobile_notifications_account_created");
            entity.HasIndex(notification => new { notification.MobileAccountId, notification.IdempotencyKey })
                .IsUnique()
                .HasDatabaseName("ux_mobile_notifications_account_idempotency");
            entity.HasIndex(notification => notification.ReadAt)
                .HasDatabaseName("ix_mobile_notifications_read_at");
            entity.HasIndex(notification => new { notification.PushStatus, notification.CreatedAt })
                .HasDatabaseName("ix_mobile_notifications_push_status_created");
        });
    }

    private static void ConfigureMobileOutboxOperations(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileOutboxOperationEntity>(entity =>
        {
            entity.ToTable("mobile_outbox_operations");
            entity.HasKey(operation => new { operation.MobileAccountId, operation.ClientOperationId });

            entity.Property(operation => operation.ClientOperationId).HasColumnName("client_operation_id").HasMaxLength(80);
            entity.Property(operation => operation.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(operation => operation.CommandType).HasColumnName("command_type").HasMaxLength(80).IsRequired();
            entity.Property(operation => operation.EntityType).HasColumnName("entity_type").HasMaxLength(80).IsRequired();
            entity.Property(operation => operation.EntityLocalId).HasColumnName("entity_local_id").HasMaxLength(120);
            entity.Property(operation => operation.EntityServerId).HasColumnName("entity_server_id").HasMaxLength(120);
            entity.Property(operation => operation.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(operation => operation.PayloadFingerprint).HasColumnName("payload_fingerprint").HasMaxLength(64);
            entity.Property(operation => operation.CreatedAtLocal).HasColumnName("created_at_local");
            entity.Property(operation => operation.CreatedAtServer).HasColumnName("created_at_server");
            entity.Property(operation => operation.AttemptCount).HasColumnName("attempt_count");
            entity.Property(operation => operation.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(operation => operation.ResponseJson).HasColumnName("response_json").HasColumnType("jsonb").IsRequired();

            entity.HasOne(operation => operation.MobileAccount)
                .WithMany()
                .HasForeignKey(operation => operation.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(operation => new { operation.MobileAccountId, operation.CreatedAtServer })
                .HasDatabaseName("ix_mobile_outbox_operations_account_created");
            entity.HasIndex(operation => operation.ClientOperationId)
                .HasDatabaseName("ix_mobile_outbox_operations_client_operation_id");
            entity.HasIndex(operation => operation.Status)
                .HasDatabaseName("ix_mobile_outbox_operations_status");
            entity.HasIndex(operation => new
            {
                operation.MobileAccountId,
                operation.CommandType,
                operation.EntityServerId,
                operation.Status,
                operation.PayloadFingerprint,
            })
                .HasFilter("payload_fingerprint IS NOT NULL")
                .HasDatabaseName("ix_mobile_outbox_operations_complete_fingerprint");
        });
    }

    private static void ConfigureMobileUploadedFiles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileUploadedFileEntity>(entity =>
        {
            entity.ToTable("mobile_uploaded_files");
            entity.HasKey(file => file.Id);

            entity.Property(file => file.Id).HasColumnName("id");
            entity.Property(file => file.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(file => file.ClientFileId).HasColumnName("client_file_id").HasMaxLength(80).IsRequired();
            entity.Property(file => file.AssignmentId).HasColumnName("assignment_id");
            entity.Property(file => file.PointId).HasColumnName("point_id");
            entity.Property(file => file.RemarkId).HasColumnName("remark_id").HasMaxLength(80);
            entity.Property(file => file.WorkTaskId).HasColumnName("work_task_id");
            entity.Property(file => file.LinkedAt).HasColumnName("linked_at");
            entity.Property(file => file.StorageFileName).HasColumnName("storage_file_name").HasMaxLength(260).IsRequired();
            entity.Property(file => file.OriginalFileName).HasColumnName("original_file_name").HasMaxLength(260).IsRequired();
            entity.Property(file => file.ContentType).HasColumnName("content_type").HasMaxLength(120).IsRequired();
            entity.Property(file => file.Sha256).HasColumnName("sha256").HasMaxLength(128).IsRequired();
            entity.Property(file => file.SizeBytes).HasColumnName("size_bytes");
            entity.Property(file => file.CapturedAtLocal).HasColumnName("captured_at_local");
            entity.Property(file => file.UploadedAt).HasColumnName("uploaded_at");

            entity.HasOne(file => file.MobileAccount)
                .WithMany()
                .HasForeignKey(file => file.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(file => file.Assignment)
                .WithMany()
                .HasForeignKey(file => file.AssignmentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(file => file.Point)
                .WithMany()
                .HasForeignKey(file => file.PointId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(file => new { file.MobileAccountId, file.ClientFileId })
                .IsUnique()
                .HasDatabaseName("ux_mobile_uploaded_files_account_client_file");
            entity.HasIndex(file => new { file.AssignmentId, file.PointId })
                .HasDatabaseName("ix_mobile_uploaded_files_assignment_point");
            entity.HasIndex(file => new { file.MobileAccountId, file.RemarkId })
                .HasDatabaseName("ix_mobile_uploaded_files_account_remark");
            entity.HasIndex(file => new { file.MobileAccountId, file.WorkTaskId })
                .HasDatabaseName("ix_mobile_uploaded_files_account_work_task");
        });
    }

    private static void ConfigureMobileShiftRemarks(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileShiftRemarkEntity>(entity =>
        {
            entity.ToTable("mobile_shift_remarks");
            entity.HasKey(remark => remark.Id);

            entity.Property(remark => remark.Id).HasColumnName("id");
            entity.Property(remark => remark.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(remark => remark.EmployeeId).HasColumnName("employee_id");
            entity.Property(remark => remark.SectionId).HasColumnName("section_id");
            entity.Property(remark => remark.Title).HasColumnName("title").HasMaxLength(240).IsRequired();
            entity.Property(remark => remark.Comment).HasColumnName("comment").HasMaxLength(4000).IsRequired();
            entity.Property(remark => remark.MediaClientFileIdsJson).HasColumnName("media_client_file_ids_json").HasColumnType("jsonb").IsRequired();
            entity.Property(remark => remark.CreatedAtLocal).HasColumnName("created_at_local");
            entity.Property(remark => remark.CreatedAtServer).HasColumnName("created_at_server");
            entity.Property(remark => remark.Status).HasColumnName("status").HasMaxLength(40).IsRequired();

            entity.HasOne(remark => remark.MobileAccount)
                .WithMany()
                .HasForeignKey(remark => remark.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(remark => remark.Employee)
                .WithMany()
                .HasForeignKey(remark => remark.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(remark => remark.Section)
                .WithMany()
                .HasForeignKey(remark => remark.SectionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(remark => new { remark.MobileAccountId, remark.CreatedAtServer })
                .HasDatabaseName("ix_mobile_shift_remarks_account_created");
            entity.HasIndex(remark => remark.EmployeeId)
                .HasDatabaseName("ix_mobile_shift_remarks_employee");
        });
    }

    private static void ConfigureMobileSyncConflictResolutions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileSyncConflictResolutionEntity>(entity =>
        {
            entity.ToTable("mobile_sync_conflict_resolutions");
            entity.HasKey(resolution => new { resolution.MobileAccountId, resolution.ClientOperationId });

            entity.Property(resolution => resolution.MobileAccountId)
                .HasColumnName("mobile_account_id");
            entity.Property(resolution => resolution.ClientOperationId)
                .HasColumnName("client_operation_id")
                .HasMaxLength(80);
            entity.Property(resolution => resolution.Status)
                .HasColumnName("status")
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(resolution => resolution.Comment)
                .HasColumnName("comment")
                .HasMaxLength(1200)
                .IsRequired();
            entity.Property(resolution => resolution.ResolvedBy)
                .HasColumnName("resolved_by")
                .HasMaxLength(220)
                .IsRequired();
            entity.Property(resolution => resolution.ResolvedAt).HasColumnName("resolved_at");

            entity.HasOne(resolution => resolution.Operation)
                .WithOne()
                .HasForeignKey<MobileSyncConflictResolutionEntity>(resolution => new { resolution.MobileAccountId, resolution.ClientOperationId })
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(resolution => resolution.Status)
                .HasDatabaseName("ix_mobile_sync_conflict_resolutions_status");
        });
    }

}
