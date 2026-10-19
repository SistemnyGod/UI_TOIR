using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigureRoutes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RouteEntity>(entity =>
        {
            entity.ToTable("routes");
            entity.HasKey(route => route.Id);

            entity.Property(route => route.Id).HasColumnName("id");
            entity.Property(route => route.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(route => route.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(route => route.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(route => route.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(route => route.Duration).HasColumnName("duration").HasMaxLength(40).IsRequired();
            entity.Property(route => route.Distance).HasColumnName("distance").HasMaxLength(40).IsRequired();
            entity.Property(route => route.Periodicity).HasColumnName("periodicity").HasMaxLength(120).IsRequired();
            entity.Property(route => route.VersionNo).HasColumnName("version_no").IsConcurrencyToken();
            entity.Property(route => route.AllowFreeOrder).HasColumnName("allow_free_order").HasDefaultValue(true);
            entity.Property(route => route.NfcEnabled).HasColumnName("nfc_enabled").HasDefaultValue(true);
            entity.Property(route => route.QrFallbackEnabled).HasColumnName("qr_fallback_enabled").HasDefaultValue(true);
            entity.Property(route => route.IsArchived).HasColumnName("is_archived");
            entity.Property(route => route.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(route => route.Name)
                .HasDatabaseName("ix_routes_name_trgm")
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");
            entity.HasIndex(route => route.IsArchived).HasDatabaseName("ix_routes_archived");
        });
    }

    private static void ConfigureRoutePoints(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoutePointEntity>(entity =>
        {
            entity.ToTable("route_points");
            entity.HasKey(point => point.Id);

            entity.Property(point => point.Id).HasColumnName("id");
            entity.Property(point => point.RouteId).HasColumnName("route_id");
            entity.Property(point => point.SequenceNo).HasColumnName("seq_no");
            entity.Property(point => point.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Zone).HasColumnName("zone").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Type).HasColumnName("point_type").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Tag).HasColumnName("tag").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(point => point.Instruction).HasColumnName("instruction").HasMaxLength(2000).IsRequired();
            entity.Property(point => point.Interval).HasColumnName("interval").HasMaxLength(40).IsRequired();
            entity.Property(point => point.ExpectedTime).HasColumnName("expected_time").HasMaxLength(40).IsRequired();
            entity.Property(point => point.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(point => point.NfcCode).HasColumnName("nfc_code").HasMaxLength(80);
            entity.Property(point => point.IsRequired).HasColumnName("is_required");
            entity.Property(point => point.RequiresPhoto).HasColumnName("requires_photo");

            entity.HasOne(point => point.Route)
                .WithMany(route => route.Points)
                .HasForeignKey(point => point.RouteId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(point => new { point.RouteId, point.SequenceNo })
                .IsUnique()
                .HasDatabaseName("ux_route_points_route_seq");

            entity.HasIndex(point => new { point.RouteId, point.NfcCode })
                .IsUnique()
                .HasFilter("nfc_code IS NOT NULL AND nfc_code <> ''")
                .HasDatabaseName("ux_route_points_route_nfc_code");
        });
    }

    private static void ConfigureRouteRevisions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RouteRevisionEntity>(entity =>
        {
            entity.ToTable("route_revisions");
            entity.HasKey(revision => revision.Id);
            entity.Property(revision => revision.Id).HasColumnName("id");
            entity.Property(revision => revision.RouteId).HasColumnName("route_id");
            entity.Property(revision => revision.VersionNo).HasColumnName("version_no");
            entity.Property(revision => revision.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(revision => revision.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(revision => revision.AllowFreeOrder).HasColumnName("allow_free_order").HasDefaultValue(true);
            entity.Property(revision => revision.NfcEnabled).HasColumnName("nfc_enabled").HasDefaultValue(true);
            entity.Property(revision => revision.QrFallbackEnabled).HasColumnName("qr_fallback_enabled").HasDefaultValue(true);
            entity.Property(revision => revision.CreatedAt).HasColumnName("created_at");
            entity.HasOne(revision => revision.Route)
                .WithMany(route => route.Revisions)
                .HasForeignKey(revision => revision.RouteId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(revision => new { revision.RouteId, revision.VersionNo })
                .IsUnique()
                .HasDatabaseName("ux_route_revisions_route_version");
        });

        modelBuilder.Entity<RouteRevisionPointEntity>(entity =>
        {
            entity.ToTable("route_revision_points");
            entity.HasKey(point => point.Id);
            entity.Property(point => point.Id).HasColumnName("id");
            entity.Property(point => point.RouteRevisionId).HasColumnName("route_revision_id");
            entity.Property(point => point.SourceRoutePointId).HasColumnName("source_route_point_id");
            entity.Property(point => point.SequenceNo).HasColumnName("seq_no");
            entity.Property(point => point.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Zone).HasColumnName("zone").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Type).HasColumnName("point_type").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Tag).HasColumnName("tag").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(point => point.Instruction).HasColumnName("instruction").HasMaxLength(2000).IsRequired();
            entity.Property(point => point.NfcCode).HasColumnName("nfc_code").HasMaxLength(80);
            entity.Property(point => point.IsRequired).HasColumnName("is_required");
            entity.Property(point => point.RequiresPhoto).HasColumnName("requires_photo");
            entity.Property(point => point.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.HasOne(point => point.RouteRevision)
                .WithMany(revision => revision.Points)
                .HasForeignKey(point => point.RouteRevisionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(point => new { point.RouteRevisionId, point.SequenceNo })
                .IsUnique()
                .HasDatabaseName("ux_route_revision_points_revision_seq");
            entity.HasIndex(point => new { point.RouteRevisionId, point.SourceRoutePointId })
                .IsUnique()
                .HasDatabaseName("ux_route_revision_points_revision_source");
        });
    }

    private static void ConfigureEmployees(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmployeeEntity>(entity =>
        {
            entity.ToTable("employees");
            entity.HasKey(employee => employee.Id);

            entity.Property(employee => employee.Id).HasColumnName("id");
            entity.Property(employee => employee.FullName).HasColumnName("full_name").HasMaxLength(220).IsRequired();
            entity.Property(employee => employee.PersonnelNo).HasColumnName("personnel_no").HasMaxLength(60).IsRequired();
            entity.Property(employee => employee.Position).HasColumnName("position").HasMaxLength(160).IsRequired();
            entity.Property(employee => employee.Department).HasColumnName("department").HasMaxLength(160).IsRequired();
            entity.Property(employee => employee.EmployeeGroup).HasColumnName("employee_group").HasMaxLength(120).IsRequired();
            entity.Property(employee => employee.EmuShiftReportCategory).HasColumnName("emu_shift_report_category").HasMaxLength(30);
            entity.Property(employee => employee.HiredAt).HasColumnName("hired_at");
            entity.Property(employee => employee.BirthDate).HasColumnName("birth_date");
            entity.Property(employee => employee.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(employee => employee.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(employee => employee.HasMobileAccount).HasColumnName("has_mobile_account");
            entity.Property(employee => employee.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasIndex(employee => employee.PersonnelNo)
                .IsUnique()
                .HasDatabaseName("ux_employees_personnel_no");

            entity.HasIndex(employee => employee.Status).HasDatabaseName("ix_employees_status");
            entity.HasIndex(employee => employee.Department).HasDatabaseName("ix_employees_department");
            entity.HasIndex(employee => employee.EmployeeGroup).HasDatabaseName("ix_employees_employee_group");
            entity.HasIndex(employee => employee.FullName)
                .HasDatabaseName("ix_employees_full_name_trgm")
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");
        });
    }

    private static void ConfigureAccountingEmployeeReferences(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AccountingEmployeeReferenceEntity>(entity =>
        {
            entity.ToTable("accounting_employee_references");
            entity.HasKey(reference => reference.Id);

            entity.Property(reference => reference.Id).HasColumnName("id");
            entity.Property(reference => reference.Kind).HasColumnName("kind").HasMaxLength(40).IsRequired();
            entity.Property(reference => reference.Name).HasColumnName("name").HasMaxLength(180).IsRequired();
            entity.Property(reference => reference.IsArchived).HasColumnName("is_archived");
            entity.Property(reference => reference.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(reference => new { reference.Kind, reference.Name })
                .IsUnique()
                .HasDatabaseName("ux_accounting_employee_references_kind_name");
            entity.HasIndex(reference => new { reference.Kind, reference.IsArchived })
                .HasDatabaseName("ix_accounting_employee_references_kind_active");
        });
    }

    private static void ConfigurePatrolRequests(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolRequestEntity>(entity =>
        {
            entity.ToTable("patrol_requests");
            entity.HasKey(request => request.Id);

            entity.Property(request => request.Id).HasColumnName("id");
            entity.Property(request => request.Number).HasColumnName("number").HasMaxLength(40).IsRequired();
            entity.Property(request => request.EmployeeId).HasColumnName("employee_id");
            entity.Property(request => request.EmployeeName).HasColumnName("employee_name").HasMaxLength(220).IsRequired();
            entity.Property(request => request.RouteId).HasColumnName("route_id");
            entity.Property(request => request.RouteName).HasColumnName("route_name").HasMaxLength(160).IsRequired();
            entity.Property(request => request.SourceResultId).HasColumnName("source_result_id");
            entity.Property(request => request.ScheduledDate).HasColumnName("scheduled_date");
            entity.Property(request => request.ScheduledTime).HasColumnName("scheduled_time");
            entity.Property(request => request.NotifyEmployee).HasColumnName("notify_employee");
            entity.Property(request => request.NotificationText).HasColumnName("notification_text").HasMaxLength(1000).IsRequired();
            entity.Property(request => request.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(request => request.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(request => request.CreatedAt).HasColumnName("created_at");
            entity.Property(request => request.CancellationReasonCode).HasColumnName("cancellation_reason_code").HasMaxLength(60);
            entity.Property(request => request.CancellationReasonText).HasColumnName("cancellation_reason_text").HasMaxLength(1000);
            entity.Property(request => request.CancelledAt).HasColumnName("cancelled_at");
            entity.Property(request => request.CancelledByUserId).HasColumnName("cancelled_by_user_id");
            entity.Property(request => request.CancelledByUserName).HasColumnName("cancelled_by_user_name").HasMaxLength(220);
            entity.Property(request => request.Description).HasColumnName("description").HasMaxLength(1200).IsRequired();
            entity.Property(request => request.SearchText)
                .HasColumnName("search_text")
                .HasColumnType("text")
                .HasComputedColumnSql(
                    "lower(number || ' ' || employee_name || ' ' || route_name || ' ' || description)",
                    stored: true);

            entity.HasOne(request => request.Employee)
                .WithMany(employee => employee.PatrolRequests)
                .HasForeignKey(request => request.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(request => request.Route)
                .WithMany()
                .HasForeignKey(request => request.RouteId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(request => request.SourceResult)
                .WithMany()
                .HasForeignKey(request => request.SourceResultId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(request => request.Number)
                .IsUnique()
                .HasDatabaseName("ux_patrol_requests_number");
            entity.HasIndex(request => new { request.CreatedAt, request.Id })
                .IsDescending()
                .HasDatabaseName("ix_patrol_requests_created_id");

            entity.HasIndex(request => request.Status).HasDatabaseName("ix_patrol_requests_status");
            entity.HasIndex(request => request.StatusCode).HasDatabaseName("ix_patrol_requests_status_code");
            entity.HasIndex(request => new { request.ScheduledDate, request.StatusCode })
                .HasDatabaseName("ix_patrol_requests_scheduled_date_status_code");
            entity.HasIndex(request => request.ScheduledDate).HasDatabaseName("ix_patrol_requests_scheduled_date");
            entity.HasIndex(request => request.SourceResultId).HasDatabaseName("ix_patrol_requests_source_result_id");
            entity.HasIndex(request => request.SearchText)
                .HasDatabaseName("ix_patrol_requests_search_text_trgm")
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");
        });

        modelBuilder.Entity<PatrolRequestHistoryEventEntity>(entity =>
        {
            entity.ToTable("patrol_request_history_events");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.PatrolRequestId).HasColumnName("patrol_request_id");
            entity.Property(item => item.EventType).HasColumnName("event_type").HasMaxLength(80).IsRequired();
            entity.Property(item => item.FromStatus).HasColumnName("from_status").HasMaxLength(60).IsRequired();
            entity.Property(item => item.ToStatus).HasColumnName("to_status").HasMaxLength(60).IsRequired();
            entity.Property(item => item.Details).HasColumnName("details").HasMaxLength(1500).IsRequired();
            entity.Property(item => item.ActorUserId).HasColumnName("actor_user_id");
            entity.Property(item => item.ActorName).HasColumnName("actor_name").HasMaxLength(220).IsRequired();
            entity.Property(item => item.CreatedAt).HasColumnName("created_at");
            entity.HasOne(item => item.PatrolRequest)
                .WithMany()
                .HasForeignKey(item => item.PatrolRequestId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(item => new { item.PatrolRequestId, item.CreatedAt })
                .HasDatabaseName("ix_patrol_request_history_events_request_created");
        });
    }

    private static void ConfigurePatrolResults(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultEntity>(entity =>
        {
            entity.ToTable("patrol_results");
            entity.HasKey(result => result.Id);

            entity.Property(result => result.Id).HasColumnName("id");
            entity.Property(result => result.AssignmentId).HasColumnName("assignment_id");
            entity.Property(result => result.RouteId).HasColumnName("route_id");
            entity.Property(result => result.EmployeeId).HasColumnName("employee_id");
            entity.Property(result => result.RoutePointId).HasColumnName("route_point_id");
            entity.Property(result => result.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(result => result.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(result => result.PointName).HasColumnName("point_name").HasMaxLength(160).IsRequired();
            entity.Property(result => result.EmployeeName).HasColumnName("employee_name").HasMaxLength(220).IsRequired();
            entity.Property(result => result.RouteName).HasColumnName("route_name").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(result => result.PlannedAt).HasColumnName("planned_at");
            entity.Property(result => result.ActualAt).HasColumnName("actual_at");
            entity.Property(result => result.Deviation).HasColumnName("deviation").HasMaxLength(40).IsRequired();
            entity.Property(result => result.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(result => result.IssueType).HasColumnName("issue_type").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Severity).HasColumnName("severity").HasMaxLength(60).IsRequired();
            entity.Property(result => result.Photos).HasColumnName("photos");
            entity.Property(result => result.CreatedAt).HasColumnName("created_at");
            entity.Property(result => result.ArchivedAt).HasColumnName("archived_at");

            entity.HasOne(result => result.Assignment)
                .WithMany()
                .HasForeignKey(result => result.AssignmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(result => result.AssignmentId)
                .HasDatabaseName("ix_patrol_results_assignment_id");

            entity.HasOne(result => result.Route)
                .WithMany()
                .HasForeignKey(result => result.RouteId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(result => result.Employee)
                .WithMany()
                .HasForeignKey(result => result.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(result => result.RoutePoint)
                .WithMany()
                .HasForeignKey(result => result.RoutePointId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(result => result.Status).HasDatabaseName("ix_patrol_results_status");
            entity.HasIndex(result => result.StatusCode).HasDatabaseName("ix_patrol_results_status_code");
            entity.HasIndex(result => result.RouteId).HasDatabaseName("ix_patrol_results_route_id");
            entity.HasIndex(result => result.EmployeeId).HasDatabaseName("ix_patrol_results_employee_id");
            entity.HasIndex(result => result.ActualAt).HasDatabaseName("ix_patrol_results_actual_at");
            entity.HasIndex(result => result.ArchivedAt).HasDatabaseName("ix_patrol_results_archived_at");
            entity.HasIndex(result => new { result.ActualAt, result.AssignmentId })
                .HasDatabaseName("ix_patrol_results_actual_at_assignment_id");
        });
    }

    private static void ConfigurePatrolResultIssues(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultIssueEntity>(entity =>
        {
            entity.ToTable("patrol_result_issues");
            entity.HasKey(issue => issue.Id);

            entity.Property(issue => issue.Id).HasColumnName("id");
            entity.Property(issue => issue.PatrolResultId).HasColumnName("patrol_result_id");
            entity.Property(issue => issue.Type).HasColumnName("issue_type").HasMaxLength(160).IsRequired();
            entity.Property(issue => issue.Severity).HasColumnName("severity").HasMaxLength(60).IsRequired();
            entity.Property(issue => issue.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(issue => issue.CreatedAt).HasColumnName("created_at");

            entity.HasOne(issue => issue.PatrolResult)
                .WithMany(result => result.Issues)
                .HasForeignKey(issue => issue.PatrolResultId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(issue => new { issue.PatrolResultId, issue.CreatedAt })
                .HasDatabaseName("ix_patrol_result_issues_result_created");
        });
    }

    private static void ConfigurePatrolResultAttachments(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultAttachmentEntity>(entity =>
        {
            entity.ToTable("patrol_result_attachments");
            entity.HasKey(attachment => attachment.Id);

            entity.Property(attachment => attachment.Id).HasColumnName("id");
            entity.Property(attachment => attachment.PatrolResultId).HasColumnName("patrol_result_id");
            entity.Property(attachment => attachment.FileName).HasColumnName("file_name").HasMaxLength(260).IsRequired();
            entity.Property(attachment => attachment.ContentType).HasColumnName("content_type").HasMaxLength(120).IsRequired();
            entity.Property(attachment => attachment.SizeBytes).HasColumnName("size_bytes");
            entity.Property(attachment => attachment.CreatedAt).HasColumnName("created_at");

            entity.HasOne(attachment => attachment.PatrolResult)
                .WithMany(result => result.Attachments)
                .HasForeignKey(attachment => attachment.PatrolResultId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(attachment => new { attachment.PatrolResultId, attachment.CreatedAt })
                .HasDatabaseName("ix_patrol_result_attachments_result_created");
        });
    }

    private static void ConfigureAssignments(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssignmentEntity>(entity =>
        {
            entity.ToTable("assignments");
            entity.HasKey(assignment => assignment.Id);

            entity.Property(assignment => assignment.Id).HasColumnName("id");
            entity.Property(assignment => assignment.PatrolRequestId).HasColumnName("patrol_request_id");
            entity.Property(assignment => assignment.RouteId).HasColumnName("route_id");
            entity.Property(assignment => assignment.RouteVersionNo).HasColumnName("route_version_no");
            entity.Property(assignment => assignment.RouteRevisionId).HasColumnName("route_revision_id");
            entity.Property(assignment => assignment.EmployeeId).HasColumnName("employee_id");
            entity.Property(assignment => assignment.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(assignment => assignment.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(assignment => assignment.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(assignment => assignment.PlannedAt).HasColumnName("planned_at");
            entity.Property(assignment => assignment.StartedAt).HasColumnName("started_at");
            entity.Property(assignment => assignment.FinishedAt).HasColumnName("finished_at");
            entity.Property(assignment => assignment.ProgressPercent).HasColumnName("progress_percent");
            entity.Property(assignment => assignment.LockVersion).HasColumnName("lock_version").IsConcurrencyToken();

            entity.HasOne(assignment => assignment.PatrolRequest)
                .WithOne(request => request.Assignment)
                .HasForeignKey<AssignmentEntity>(assignment => assignment.PatrolRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(assignment => assignment.Route)
                .WithMany()
                .HasForeignKey(assignment => assignment.RouteId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(assignment => assignment.RouteRevision)
                .WithMany()
                .HasForeignKey(assignment => assignment.RouteRevisionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(assignment => assignment.Employee)
                .WithMany(employee => employee.Assignments)
                .HasForeignKey(assignment => assignment.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(assignment => new { assignment.EmployeeId, assignment.Status })
                .HasDatabaseName("ix_assignments_employee_status");
            entity.HasIndex(assignment => assignment.EmployeeId)
                .IsUnique()
                .HasFilter("status = 'В пути'")
                .HasDatabaseName("ux_assignments_employee_started");
            entity.HasIndex(assignment => new { assignment.EmployeeId, assignment.StatusCode })
                .HasDatabaseName("ix_assignments_employee_status_code");
            entity.HasIndex(assignment => new { assignment.PlannedAt, assignment.StatusCode })
                .HasDatabaseName("ix_assignments_planned_at_status_code");

            entity.HasIndex(assignment => assignment.RouteId).HasDatabaseName("ix_assignments_route_id");
            entity.HasIndex(assignment => assignment.RouteRevisionId).HasDatabaseName("ix_assignments_route_revision_id");
            entity.HasIndex(assignment => assignment.PlannedAt).HasDatabaseName("ix_assignments_planned_at");
        });
    }

    private static void ConfigureAssignmentSettings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssignmentSettingsEntity>(entity =>
        {
            entity.ToTable("assignment_settings");
            entity.HasKey(settings => settings.Id);
            entity.Property(settings => settings.Id).HasColumnName("id");
            entity.Property(settings => settings.DayStart).HasColumnName("day_start").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.DayEnd).HasColumnName("day_end").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.NightStart).HasColumnName("night_start").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.NightEnd).HasColumnName("night_end").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<AssignmentFavoriteEmployeeEntity>(entity =>
        {
            entity.ToTable("assignment_favorite_employees");
            entity.HasKey(favorite => favorite.Id);
            entity.Property(favorite => favorite.Id).HasColumnName("id");
            entity.Property(favorite => favorite.EmployeeId).HasColumnName("employee_id");
            entity.Property(favorite => favorite.SortOrder).HasColumnName("sort_order");
            entity.Property(favorite => favorite.CreatedAt).HasColumnName("created_at");
            entity.HasOne(favorite => favorite.Employee)
                .WithMany()
                .HasForeignKey(favorite => favorite.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(favorite => favorite.EmployeeId)
                .IsUnique()
                .HasDatabaseName("ux_assignment_favorite_employees_employee");
            entity.HasIndex(favorite => favorite.SortOrder)
                .HasDatabaseName("ix_assignment_favorite_employees_sort");
        });
    }

}
