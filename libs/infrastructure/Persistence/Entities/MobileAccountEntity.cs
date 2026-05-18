namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileAccountEntity
{
    public Guid Id { get; set; }

    public string Login { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public bool PasswordResetRequired { get; set; }

    public DateTimeOffset? LastPasswordResetAt { get; set; }

    public string EmployeeScope { get; set; } = string.Empty;

    public string[] BoundEmployees { get; set; } = [];

    public string Role { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string Session { get; set; } = string.Empty;

    public DateTimeOffset? LastSeenAt { get; set; }

    public string Device { get; set; } = string.Empty;

    public string Version { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }
}
