using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    internal DbSet<MobilePatrolAppealEntity> MobilePatrolAppeals => Set<MobilePatrolAppealEntity>();
    private static void ConfigureMobilePatrolAppeals(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobilePatrolAppealEntity>(entity =>
        {
            entity.ToTable("mobile_patrol_appeals");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Version).IsConcurrencyToken();
            entity.Property(item => item.Kind).HasMaxLength(32);
            entity.Property(item => item.Message).HasMaxLength(2000);
            entity.Property(item => item.Reply).HasMaxLength(2000);
            entity.Property(item => item.Status).HasMaxLength(32);
            entity.Property(item => item.DeviceId).HasMaxLength(256);
            entity.Property(item => item.ResolvedBy).HasMaxLength(256);
            entity.HasOne(item => item.Assignment).WithMany().HasForeignKey(item => item.AssignmentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(item => new { item.AssignmentId, item.Kind }).IsUnique().HasFilter("\"Status\" = 'open' AND \"Kind\" = 'cancel'");
            entity.HasIndex(item => new { item.MobileAccountId, item.CreatedAt });
            entity.HasIndex(item => new { item.Status, item.CreatedAt });
            entity.HasIndex(item => new { item.MobileAccountId, item.UpdatedAt });
            entity.HasIndex(item => new { item.Status, item.UpdatedAt });
        });
    }
}
