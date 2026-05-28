namespace Patrol360.Contracts;

public sealed record SystemNotificationDto(
    string Id,
    string Source,
    string Title,
    string Message,
    string Tone,
    DateTimeOffset CreatedAt,
    string? EntityType,
    string? EntityId,
    string? NavigateTo);
