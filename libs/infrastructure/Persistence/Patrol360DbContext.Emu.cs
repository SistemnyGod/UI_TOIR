using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigureEmu(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmuWorkSectionEntity>(entity =>
        {
            entity.ToTable("emu_work_sections");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_work_sections_code");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_work_sections_active");
        });

        modelBuilder.Entity<EmuWaitReasonEntity>(entity =>
        {
            entity.ToTable("emu_wait_reasons");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_wait_reasons_code");
        });

        modelBuilder.Entity<EmuNotCompletedReasonEntity>(entity =>
        {
            entity.ToTable("emu_not_completed_reasons");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_not_completed_reasons_code");
        });

        modelBuilder.Entity<EmuWorkTemplateEntity>(entity =>
        {
            entity.ToTable("emu_work_templates");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(180).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_work_templates_active");
        });

        modelBuilder.Entity<EmuFavoriteEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_favorite_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => row.EmployeeId).IsUnique().HasDatabaseName("ux_emu_favorite_employees_employee");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_favorite_employees_active");
        });

        modelBuilder.Entity<EmuShiftTemplateEntity>(entity =>
        {
            entity.ToTable("emu_shift_templates");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.StartTime).HasColumnName("start_time");
            entity.Property(row => row.EndTime).HasColumnName("end_time");
            entity.Property(row => row.LunchStartTime).HasColumnName("lunch_start_time");
            entity.Property(row => row.LunchEndTime).HasColumnName("lunch_end_time");
            entity.Property(row => row.CrossesMidnight).HasColumnName("crosses_midnight");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_shift_templates_code");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_shift_templates_active");
        });

        modelBuilder.Entity<EmuEmployeeShiftEntity>(entity =>
        {
            entity.ToTable("emu_employee_shifts");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.ShiftDate).HasColumnName("shift_date");
            entity.Property(row => row.TemplateId).HasColumnName("template_id");
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.PlannedStartAt).HasColumnName("planned_start_at");
            entity.Property(row => row.PlannedEndAt).HasColumnName("planned_end_at");
            entity.Property(row => row.ActualStartAt).HasColumnName("actual_start_at");
            entity.Property(row => row.ActualEndAt).HasColumnName("actual_end_at");
            entity.Property(row => row.LunchStartAt).HasColumnName("lunch_start_at");
            entity.Property(row => row.LunchEndAt).HasColumnName("lunch_end_at");
            entity.Property(row => row.LunchTaken).HasColumnName("lunch_taken");
            entity.Property(row => row.LunchOverridden).HasColumnName("lunch_overridden");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.Reason).HasColumnName("reason").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.AdjustedByUserId).HasColumnName("adjusted_by_user_id");
            entity.Property(row => row.AdjustedByName).HasColumnName("adjusted_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.AdjustedAt).HasColumnName("adjusted_at");
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Template).WithMany().HasForeignKey(row => row.TemplateId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.AdjustedByUser).WithMany().HasForeignKey(row => row.AdjustedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ShiftDate }).IsUnique().HasDatabaseName("ux_emu_employee_shifts_employee_date");
            entity.HasIndex(row => row.ShiftDate).HasDatabaseName("ix_emu_employee_shifts_date");
            entity.HasIndex(row => row.Source).HasDatabaseName("ix_emu_employee_shifts_source");
        });

        modelBuilder.Entity<EmuWorkPlanTaskEntity>(entity =>
        {
            entity.ToTable("emu_work_plan_tasks");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.PlannedDate).HasColumnName("planned_date");
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ApprovalStatus).HasColumnName("approval_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Priority).HasColumnName("priority").HasMaxLength(40).IsRequired();
            entity.Property(row => row.IsRecurring).HasColumnName("is_recurring");
            entity.Property(row => row.RecurrenceRule).HasColumnName("recurrence_rule").HasMaxLength(200).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ApprovedByUserId).HasColumnName("approved_by_user_id");
            entity.Property(row => row.ApprovedAt).HasColumnName("approved_at");
            entity.Property(row => row.RowVersion).HasColumnName("row_version").IsConcurrencyToken();
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ApprovedByUser).WithMany().HasForeignKey(row => row.ApprovedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PlannedDate).HasDatabaseName("ix_emu_plan_tasks_planned_date");
            entity.HasIndex(row => row.ApprovalStatus).HasDatabaseName("ix_emu_plan_tasks_approval_status");
        });

        modelBuilder.Entity<EmuWorkPlanTaskEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_plan_task_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.HasOne(row => row.PlanTask).WithMany(task => task.Employees).HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PlanTaskId, row.EmployeeId }).IsUnique().HasDatabaseName("ux_emu_plan_task_employees_task_employee");
        });

        modelBuilder.Entity<EmuWorkSessionEntity>(entity =>
        {
            entity.ToTable("emu_work_sessions");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkNumber).HasColumnName("work_number").HasMaxLength(40).IsRequired();
            entity.Property(row => row.WorkDate).HasColumnName("work_date");
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.TaskDescription).HasColumnName("task_description").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ResultStatus).HasColumnName("result_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ResultComment).HasColumnName("result_comment").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.NotCompletedReasonId).HasColumnName("not_completed_reason_id");
            entity.Property(row => row.ArrivedAt).HasColumnName("arrived_at");
            entity.Property(row => row.CompletedAt).HasColumnName("completed_at");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.Property(row => row.DeletedAt).HasColumnName("deleted_at");
            entity.Property(row => row.DeletedByUserId).HasColumnName("deleted_by_user_id");
            entity.Property(row => row.DeleteReason).HasColumnName("delete_reason").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.WorkMinutes).HasColumnName("work_minutes");
            entity.Property(row => row.WaitingMinutes).HasColumnName("waiting_minutes");
            entity.Property(row => row.OtherWorkMinutes).HasColumnName("other_work_minutes");
            entity.Property(row => row.RowVersion).HasColumnName("row_version").IsConcurrencyToken();
            entity.Property(row => row.IsCarriedOver).HasColumnName("is_carried_over");
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.NotCompletedReason).WithMany().HasForeignKey(row => row.NotCompletedReasonId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.DeletedByUser).WithMany().HasForeignKey(row => row.DeletedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.WorkNumber).IsUnique().HasDatabaseName("ux_emu_work_sessions_number");
            entity.HasIndex(row => row.WorkDate).HasDatabaseName("ix_emu_work_sessions_work_date");
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_emu_work_sessions_status");
            entity.HasIndex(row => row.Source).HasDatabaseName("ix_emu_work_sessions_source");
            entity.HasIndex(row => row.DeletedAt).HasDatabaseName("ix_emu_work_sessions_deleted_at");
        });

        modelBuilder.Entity<EmuWorkSessionEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_session_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.FullNameSnapshot).HasColumnName("full_name_snapshot").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PositionSnapshot).HasColumnName("position_snapshot").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ArrivedAt).HasColumnName("arrived_at");
            entity.Property(row => row.FinishedAt).HasColumnName("finished_at");
            entity.Property(row => row.WorkMinutes).HasColumnName("work_minutes");
            entity.Property(row => row.WaitingMinutes).HasColumnName("waiting_minutes");
            entity.Property(row => row.OtherWorkMinutes).HasColumnName("other_work_minutes");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.Employees).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_emu_work_session_employees_employee_status");
        });

        modelBuilder.Entity<EmuWorkParticipationIntervalEntity>(entity =>
        {
            entity.ToTable("emu_work_participation_intervals");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.WorkSessionEmployeeId).HasColumnName("work_session_employee_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Reason).HasColumnName("reason").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.Property(row => row.CreatedByName).HasColumnName("created_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.WorkSessionEmployee).WithMany(row => row.ParticipationIntervals).HasForeignKey(row => row.WorkSessionEmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.WorkSessionId, row.StartedAt }).HasDatabaseName("ix_emu_participation_session_started");
            entity.HasIndex(row => new { row.EmployeeId, row.StartedAt }).HasDatabaseName("ix_emu_participation_employee_started");
            entity.HasIndex(row => new { row.WorkSessionEmployeeId, row.EndedAt }).HasDatabaseName("ix_emu_participation_participant_ended");
        });

        modelBuilder.Entity<EmuWorkPauseEntity>(entity =>
        {
            entity.ToTable("emu_work_pauses");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.WaitReasonId).HasColumnName("wait_reason_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.IsOtherWork).HasColumnName("is_other_work");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.Pauses).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.WaitReason).WithMany().HasForeignKey(row => row.WaitReasonId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.WorkSessionId, row.StartedAt }).HasDatabaseName("ix_emu_work_pauses_session_started");
        });

        modelBuilder.Entity<EmuWorkPauseEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_pause_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PauseId).HasColumnName("pause_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.HasOne(row => row.Pause).WithMany(pause => pause.Employees).HasForeignKey(row => row.PauseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PauseId, row.EmployeeId }).IsUnique().HasDatabaseName("ux_emu_work_pause_employees_pause_employee");
        });

        modelBuilder.Entity<EmuWorkSessionCarryOverEntity>(entity =>
        {
            entity.ToTable("emu_work_session_carry_overs");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.FromDate).HasColumnName("from_date");
            entity.Property(row => row.ToDate).HasColumnName("to_date");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.WorkSessionId, row.ToDate }).IsUnique().HasDatabaseName("ux_emu_work_carry_overs_session_date");
        });

        modelBuilder.Entity<EmuWorkAuditEventEntity>(entity =>
        {
            entity.ToTable("emu_work_audit_events");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(120).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.ActorUserId).HasColumnName("actor_user_id");
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(220).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.AuditEvents).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.ActorUser).WithMany().HasForeignKey(row => row.ActorUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.WorkSessionId, row.CreatedAt }).HasDatabaseName("ix_emu_audit_session_created");
            entity.HasIndex(row => new { row.PlanTaskId, row.CreatedAt }).HasDatabaseName("ix_emu_audit_plan_created");
        });

        modelBuilder.Entity<EmuDecisionEntity>(entity =>
        {
            entity.ToTable("emu_decisions");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.DecisionType).HasColumnName("decision_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Severity).HasColumnName("severity").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.ShiftDate).HasColumnName("shift_date");
            entity.Property(row => row.DetectedAt).HasColumnName("detected_at");
            entity.Property(row => row.ResolvedAt).HasColumnName("resolved_at");
            entity.Property(row => row.ResolvedByUserId).HasColumnName("resolved_by_user_id");
            entity.Property(row => row.ResolvedByName).HasColumnName("resolved_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.Resolution).HasColumnName("resolution").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1600).IsRequired();
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ResolvedByUser).WithMany().HasForeignKey(row => row.ResolvedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.DedupeKey).IsUnique().HasDatabaseName("ux_emu_decisions_dedupe_key");
            entity.HasIndex(row => new { row.Status, row.Severity }).HasDatabaseName("ix_emu_decisions_status_severity");
            entity.HasIndex(row => new { row.EmployeeId, row.ShiftDate }).HasDatabaseName("ix_emu_decisions_employee_shift");
            entity.HasIndex(row => row.WorkSessionId).HasDatabaseName("ix_emu_decisions_work_session");
        });

        modelBuilder.Entity<EmuNotificationEntity>(entity =>
        {
            entity.ToTable("emu_notifications");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.NotificationType).HasColumnName("notification_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Severity).HasColumnName("severity").HasMaxLength(40).IsRequired();
            entity.Property(row => row.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(180).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ResolvedAt).HasColumnName("resolved_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_emu_notifications_status");
            entity.HasIndex(row => row.DedupeKey).IsUnique().HasDatabaseName("ux_emu_notifications_dedupe_key");
        });
    }

    private static void ConfigureEmuShiftReports(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmuShiftReportEntity>(entity =>
        {
            entity.ToTable("emu_shift_reports");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ReportDate).HasColumnName("report_date");
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.WorkerCategory).HasColumnName("worker_category").HasMaxLength(30).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.EmployeeNameSnapshot).HasColumnName("employee_name_snapshot").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PersonnelNoSnapshot).HasColumnName("personnel_no_snapshot").HasMaxLength(60).IsRequired();
            entity.Property(row => row.PositionSnapshot).HasColumnName("position_snapshot").HasMaxLength(160).IsRequired();
            entity.Property(row => row.DepartmentSnapshot).HasColumnName("department_snapshot").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.Property(row => row.CreatedByName).HasColumnName("created_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.SubmittedAt).HasColumnName("submitted_at");
            entity.Property(row => row.RowVersion).HasColumnName("row_version").IsConcurrencyToken();
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ReportDate, row.ShiftType }).IsUnique().HasDatabaseName("ux_emu_shift_reports_employee_date_shift");
            entity.HasIndex(row => row.ReportDate).HasDatabaseName("ix_emu_shift_reports_date");
            entity.HasIndex(row => new { row.WorkerCategory, row.ReportDate, row.ShiftType }).HasDatabaseName("ix_emu_shift_reports_category_date_shift");
            entity.HasIndex(row => row.CreatedByUserId).HasDatabaseName("ix_emu_shift_reports_created_by");
            entity.HasIndex(row => new { row.ReportDate, row.SubmittedAt }).HasDatabaseName("ix_emu_shift_reports_date_submitted");
            entity.HasIndex(row => new { row.CreatedByUserId, row.ReportDate, row.SubmittedAt }).HasDatabaseName("ix_emu_shift_reports_owner_date_submitted");
        });

        modelBuilder.Entity<EmuShiftReportLineEntity>(entity =>
        {
            entity.ToTable("emu_shift_report_lines", table =>
            {
                table.HasCheckConstraint("ck_emu_shift_report_lines_duration", "duration_minutes >= 1 AND duration_minutes <= 1440");
                table.HasCheckConstraint("ck_emu_shift_report_lines_sequence", "sequence_no > 0");
            });
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ReportId).HasColumnName("report_id");
            entity.Property(row => row.SequenceNo).HasColumnName("sequence_no");
            entity.Property(row => row.WorkDescription).HasColumnName("work_description").HasMaxLength(1500).IsRequired();
            entity.Property(row => row.DurationMinutes).HasColumnName("duration_minutes");
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.SectionNameSnapshot).HasColumnName("section_name_snapshot").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Note).HasColumnName("note").HasMaxLength(1500).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Report).WithMany(report => report.Lines).HasForeignKey(row => row.ReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.ReportId, row.SequenceNo }).IsUnique().HasDatabaseName("ux_emu_shift_report_lines_report_sequence");
            entity.HasIndex(row => row.ReportId).HasDatabaseName("ix_emu_shift_report_lines_report");
        });

        modelBuilder.Entity<EmuShiftReportDraftEntity>(entity =>
        {
            entity.ToTable("emu_shift_report_drafts");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ReportDate).HasColumnName("report_date");
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.WorkerCategory).HasColumnName("worker_category").HasMaxLength(30).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.EditorInstanceId).HasColumnName("editor_instance_id").HasMaxLength(80).IsRequired();
            entity.Property(row => row.EditorUserId).HasColumnName("editor_user_id");
            entity.Property(row => row.EditorName).HasColumnName("editor_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.LeaseExpiresAt).HasColumnName("lease_expires_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.EditorUser).WithMany().HasForeignKey(row => row.EditorUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ReportDate, row.ShiftType }).IsUnique().HasDatabaseName("ux_emu_shift_report_drafts_employee_date_shift");
            entity.HasIndex(row => row.LeaseExpiresAt).HasDatabaseName("ix_emu_shift_report_drafts_lease_expires");
        });
    }

}
