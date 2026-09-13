using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class PpeIssueDocumentConfiguration : IEntityTypeConfiguration<PpeIssueDocumentEntity>
{
    public void Configure(EntityTypeBuilder<PpeIssueDocumentEntity> entity)
    {
        entity.ToTable("ppe_issue_documents", "inventory");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
        entity.Property(x => x.NormSetId).HasColumnName("norm_set_id");
        entity.Property(x => x.LegacyCardId).HasColumnName("legacy_card_id");
        entity.Property(x => x.Version).HasColumnName("version").IsConcurrencyToken();
        entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(20);
        entity.Property(x => x.ContentJson).HasColumnName("content_json").HasColumnType("jsonb");
        entity.Property(x => x.ValidationJson).HasColumnName("validation_json").HasColumnType("jsonb");
        entity.Property(x => x.IdempotencyKey).HasColumnName("idempotency_key").HasMaxLength(120);
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.ConfirmedAt).HasColumnName("confirmed_at");
        entity.Property(x => x.CreatedBy).HasColumnName("created_by").HasMaxLength(240);
        entity.HasOne<EmployeeEntity>().WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<InventoryPpeNormSetEntity>().WithMany().HasForeignKey(x => x.NormSetId).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(x => new { x.EmployeeId, x.CreatedAt });
        entity.HasIndex(x => x.IdempotencyKey).IsUnique().HasFilter("idempotency_key IS NOT NULL");
        entity.HasIndex(x => x.LegacyCardId).IsUnique().HasFilter("legacy_card_id IS NOT NULL");
    }
}

internal sealed class PpeIssueFactConfiguration : IEntityTypeConfiguration<InventoryPpeCardLineEntity>
{
    public void Configure(EntityTypeBuilder<InventoryPpeCardLineEntity> entity)
    {
        entity.Property(x => x.IssueDocumentId).HasColumnName("issue_document_id");
        entity.Property(x => x.IssueDate).HasColumnName("issue_date");
        entity.Property(x => x.RequirementKey).HasColumnName("requirement_key");
        entity.Property(x => x.NormUnitsPerItem).HasColumnName("norm_units_per_item").HasPrecision(18, 6);
        entity.HasOne<PpeIssueDocumentEntity>().WithMany().HasForeignKey(x => x.IssueDocumentId).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(x => new { x.RequirementKey, x.IssueDate });
    }
}
