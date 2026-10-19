using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigurePerco(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PercoIntegrationSettingsEntity>(entity =>
        {
            entity.ToTable("perco_integration_settings");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.IsEnabled).HasColumnName("is_enabled");
            entity.Property(row => row.AuthMode).HasColumnName("auth_mode").HasMaxLength(40).IsRequired();
            entity.Property(row => row.BaseUrl).HasColumnName("base_url").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Username).HasColumnName("username").HasMaxLength(160).IsRequired();
            entity.Property(row => row.PasswordEncrypted).HasColumnName("password_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.TokenEncrypted).HasColumnName("token_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.SessionTokenEncrypted).HasColumnName("session_token_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.SessionTokenExpiresAt).HasColumnName("session_token_expires_at");
            entity.Property(row => row.Timezone).HasColumnName("timezone").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeesSyncMinutes).HasColumnName("employees_sync_minutes");
            entity.Property(row => row.EventsSyncMinutes).HasColumnName("events_sync_minutes");
            entity.Property(row => row.ShiftStartToleranceMinutes).HasColumnName("shift_start_tolerance_minutes");
            entity.Property(row => row.ShiftEndToleranceMinutes).HasColumnName("shift_end_tolerance_minutes");
            entity.Property(row => row.DevPath).HasColumnName("dev_path").HasMaxLength(200).IsRequired();
            entity.Property(row => row.EmployeesEndpoint).HasColumnName("employees_endpoint").HasMaxLength(300).IsRequired();
            entity.Property(row => row.EventsEndpoint).HasColumnName("events_endpoint").HasMaxLength(300).IsRequired();
            entity.Property(row => row.LastDiscoverySummary).HasColumnName("last_discovery_summary").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.LastConnectionCheckAt).HasColumnName("last_connection_check_at");
            entity.Property(row => row.LastConnectionStatus).HasColumnName("last_connection_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastConnectionError).HasColumnName("last_connection_error").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.LastApiSecretCheckAt).HasColumnName("last_api_secret_check_at");
            entity.Property(row => row.LastApiSecretStatus).HasColumnName("last_api_secret_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastApiSecretError).HasColumnName("last_api_secret_error").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.LastWorkerSecretCheckAt).HasColumnName("last_worker_secret_check_at");
            entity.Property(row => row.LastWorkerSecretStatus).HasColumnName("last_worker_secret_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastWorkerSecretError).HasColumnName("last_worker_secret_error").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<PercoIntegrationLogEntity>(entity =>
        {
            entity.ToTable("perco_integration_logs");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Operation).HasColumnName("operation").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Details).HasColumnName("details").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.FinishedAt).HasColumnName("finished_at");
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.Operation).HasDatabaseName("ix_perco_logs_operation");
            entity.HasIndex(row => row.StartedAt).HasDatabaseName("ix_perco_logs_started");
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_perco_logs_status");
        });

        modelBuilder.Entity<PercoSyncStateEntity>(entity =>
        {
            entity.ToTable("perco_sync_state");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.SyncType).HasColumnName("sync_type").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastSuccessAt).HasColumnName("last_success_at");
            entity.Property(row => row.LastCursor).HasColumnName("last_cursor").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.LastError).HasColumnName("last_error").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(row => row.SyncType).IsUnique().HasDatabaseName("ux_perco_sync_state_type");
        });

        modelBuilder.Entity<PercoEmployeeLinkEntity>(entity =>
        {
            entity.ToTable("perco_employee_links");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PercoEmployeeId).HasColumnName("perco_employee_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.FullName).HasColumnName("full_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PersonnelNo).HasColumnName("personnel_no").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CardNumber).HasColumnName("card_number").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Department).HasColumnName("department").HasMaxLength(220).IsRequired();
            entity.Property(row => row.MatchedByUserId).HasColumnName("matched_by_user_id");
            entity.Property(row => row.MatchedAt).HasColumnName("matched_at");
            entity.Property(row => row.MatchStatus).HasColumnName("match_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.MatchedByUser).WithMany().HasForeignKey(row => row.MatchedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PercoEmployeeId).IsUnique().HasDatabaseName("ux_perco_employee_links_perco_id");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_perco_employee_links_employee");
            entity.HasIndex(row => row.MatchStatus).HasDatabaseName("ix_perco_employee_links_status");
        });

        modelBuilder.Entity<PercoAccessEventEntity>(entity =>
        {
            entity.ToTable("perco_access_events");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PercoEventId).HasColumnName("perco_event_id").HasMaxLength(160).IsRequired();
            entity.Property(row => row.PercoEmployeeId).HasColumnName("perco_employee_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.DeviceId).HasColumnName("device_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.DeviceName).HasColumnName("device_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Direction).HasColumnName("direction").HasMaxLength(40).IsRequired();
            entity.Property(row => row.EventAt).HasColumnName("event_at");
            entity.Property(row => row.RawPayload).HasColumnName("raw_payload").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PercoEventId).IsUnique().HasDatabaseName("ux_perco_access_events_perco_event_id");
            entity.HasIndex(row => row.EventAt).HasDatabaseName("ix_perco_access_events_event_at");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_perco_access_events_employee");
            entity.HasIndex(row => new { row.EmployeeId, row.EventAt, row.Direction, row.Id })
                .HasDatabaseName("ix_perco_access_events_employee_timeline");
        });

        modelBuilder.Entity<PercoPresenceRebuildQueueEntity>(entity =>
        {
            entity.ToTable("perco_presence_rebuild_queue");
            entity.HasKey(row => row.EmployeeId);
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.EnqueuedAt).HasColumnName("enqueued_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => row.EnqueuedAt).HasDatabaseName("ix_perco_presence_rebuild_queue_enqueued");
        });

        modelBuilder.Entity<EmployeePresenceIntervalEntity>(entity =>
        {
            entity.ToTable("employee_presence_intervals");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.OpenedByEventId).HasColumnName("opened_by_event_id");
            entity.Property(row => row.ClosedByEventId).HasColumnName("closed_by_event_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.DurationMinutes).HasColumnName("duration_minutes");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.OpenedByEvent).WithMany().HasForeignKey(row => row.OpenedByEventId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ClosedByEvent).WithMany().HasForeignKey(row => row.ClosedByEventId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.StartedAt }).HasDatabaseName("ix_presence_intervals_employee_started");
            entity.HasIndex(row => row.EndedAt).HasDatabaseName("ix_presence_intervals_ended");
        });
    }
}
