using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    internal DbSet<PatrolLateReportEntity> PatrolLateReports => Set<PatrolLateReportEntity>();
    internal DbSet<PatrolReportPendingPhotoEntity> PatrolReportPendingPhotos => Set<PatrolReportPendingPhotoEntity>();

    private static void ConfigurePatrolLateReports(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolLateReportEntity>(entity =>
        {
            entity.ToTable("patrol_late_reports");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.AssignmentId).HasColumnName("assignment_id");
            entity.Property(item => item.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(item => item.ClientOperationId).HasColumnName("client_operation_id").HasMaxLength(200).IsRequired();
            entity.Property(item => item.ReasonCode).HasColumnName("reason_code").HasMaxLength(40).IsRequired();
            entity.Property(item => item.AssignmentStatusAtReceipt).HasColumnName("assignment_status_at_receipt").HasMaxLength(60).IsRequired();
            entity.Property(item => item.SubmissionMode).HasColumnName("submission_mode").HasMaxLength(20);
            entity.Property(item => item.PayloadJson).HasColumnName("payload_json").HasColumnType("text").IsRequired();
            entity.Property(item => item.PayloadFingerprint).HasColumnName("payload_fingerprint").HasMaxLength(64).IsRequired();
            entity.Property(item => item.CompletedAtLocal).HasColumnName("completed_at_local");
            entity.Property(item => item.ReceivedAt).HasColumnName("received_at");
            entity.Property(item => item.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            entity.Property(item => item.ResolutionComment).HasColumnName("resolution_comment").HasMaxLength(2000).IsRequired();
            entity.Property(item => item.ResolvedBy).HasColumnName("resolved_by").HasMaxLength(256);
            entity.Property(item => item.ResolvedAt).HasColumnName("resolved_at");
            entity.HasOne(item => item.Assignment).WithMany().HasForeignKey(item => item.AssignmentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.MobileAccount).WithMany().HasForeignKey(item => item.MobileAccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(item => new { item.MobileAccountId, item.ClientOperationId })
                .IsUnique()
                .HasDatabaseName("ux_patrol_late_reports_account_operation");
            entity.HasIndex(item => new { item.Status, item.ReceivedAt })
                .HasDatabaseName("ix_patrol_late_reports_status_received");
            entity.HasIndex(item => new { item.AssignmentId, item.PayloadFingerprint })
                .HasDatabaseName("ix_patrol_late_reports_assignment_fingerprint");
        });

        modelBuilder.Entity<PatrolReportPendingPhotoEntity>(entity =>
        {
            entity.ToTable("patrol_report_pending_photos");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(item => item.AssignmentId).HasColumnName("assignment_id");
            entity.Property(item => item.PointId).HasColumnName("point_id");
            entity.Property(item => item.ClientFileId).HasColumnName("client_file_id").HasMaxLength(200).IsRequired();
            entity.Property(item => item.LateReportId).HasColumnName("late_report_id");
            entity.Property(item => item.CreatedAt).HasColumnName("created_at");
            entity.Property(item => item.UploadedFileId).HasColumnName("uploaded_file_id");
            entity.Property(item => item.LinkedAt).HasColumnName("linked_at");
            entity.HasOne<AssignmentEntity>().WithMany().HasForeignKey(item => item.AssignmentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<PatrolLateReportEntity>().WithMany().HasForeignKey(item => item.LateReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(item => new { item.MobileAccountId, item.AssignmentId, item.ClientFileId })
                .IsUnique()
                .HasDatabaseName("ux_patrol_report_pending_photos_file");
            entity.HasIndex(item => item.LinkedAt)
                .HasFilter("linked_at IS NULL")
                .HasDatabaseName("ix_patrol_report_pending_photos_unlinked");
        });
    }
}
