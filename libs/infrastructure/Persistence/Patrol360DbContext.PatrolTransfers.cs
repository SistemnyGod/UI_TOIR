using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    internal DbSet<PatrolAssignmentTransferEntity> PatrolAssignmentTransfers => Set<PatrolAssignmentTransferEntity>();

    private static void ConfigurePatrolTransfers(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolAssignmentTransferEntity>(entity =>
        {
            entity.ToTable("patrol_assignment_transfers");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.AssignmentId).HasColumnName("assignment_id");
            entity.Property(item => item.PatrolRequestId).HasColumnName("patrol_request_id");
            entity.Property(item => item.FromEmployeeId).HasColumnName("from_employee_id");
            entity.Property(item => item.FromEmployeeName).HasColumnName("from_employee_name").HasMaxLength(300).IsRequired();
            entity.Property(item => item.ToEmployeeId).HasColumnName("to_employee_id");
            entity.Property(item => item.ToEmployeeName).HasColumnName("to_employee_name").HasMaxLength(300).IsRequired();
            entity.Property(item => item.FromMobileAccountId).HasColumnName("from_mobile_account_id");
            entity.Property(item => item.Mode).HasColumnName("mode").HasMaxLength(20).IsRequired();
            entity.Property(item => item.Reason).HasColumnName("reason").HasMaxLength(500).IsRequired();
            entity.Property(item => item.ClientOperationId).HasColumnName("client_operation_id").HasMaxLength(200).IsRequired();
            entity.Property(item => item.StatusBefore).HasColumnName("status_before").HasMaxLength(60).IsRequired();
            entity.Property(item => item.StatusAfter).HasColumnName("status_after").HasMaxLength(60).IsRequired();
            entity.Property(item => item.CarriedPointResultsJson).HasColumnName("carried_point_results_json").HasColumnType("text").IsRequired();
            entity.Property(item => item.CarriedPointCount).HasColumnName("carried_point_count");
            entity.Property(item => item.TransferredAtLocal).HasColumnName("transferred_at_local");
            entity.Property(item => item.CreatedAt).HasColumnName("created_at");
            entity.HasOne(item => item.Assignment).WithMany().HasForeignKey(item => item.AssignmentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.FromMobileAccount).WithMany().HasForeignKey(item => item.FromMobileAccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(item => new { item.FromMobileAccountId, item.ClientOperationId })
                .IsUnique()
                .HasDatabaseName("ux_patrol_assignment_transfers_account_operation");
            entity.HasIndex(item => new { item.AssignmentId, item.CreatedAt })
                .HasDatabaseName("ix_patrol_assignment_transfers_assignment_created");
            entity.HasIndex(item => item.CreatedAt)
                .HasDatabaseName("ix_patrol_assignment_transfers_created");
        });
    }
}
