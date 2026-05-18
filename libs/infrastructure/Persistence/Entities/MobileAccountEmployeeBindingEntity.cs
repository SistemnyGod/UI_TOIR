namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileAccountEmployeeBindingEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public Guid EmployeeId { get; set; }

    public EmployeeEntity? Employee { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? DetachedAt { get; set; }
}
