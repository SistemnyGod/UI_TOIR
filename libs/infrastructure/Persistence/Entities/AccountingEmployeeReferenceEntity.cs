namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class AccountingEmployeeReferenceEntity
{
    public Guid Id { get; set; }

    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool IsArchived { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
