namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class AssignmentSettingsEntity
{
    public int Id { get; set; }

    public string DayStart { get; set; } = "08:00";

    public string DayEnd { get; set; } = "20:00";

    public string NightStart { get; set; } = "20:00";

    public string NightEnd { get; set; } = "08:00";

    public DateTimeOffset UpdatedAt { get; set; }
}

internal sealed class AssignmentFavoriteEmployeeEntity
{
    public Guid Id { get; set; }

    public Guid EmployeeId { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public EmployeeEntity? Employee { get; set; }
}
