namespace Patrol360.Infrastructure.Persistence;

internal static class AssignmentStatusValues
{
    // These values are persisted in the database. Do not rename them as UI labels
    // without a migration/backfill plan for existing assignments and requests.
    public const string Assigned = "Назначена";
    public const string Waiting = "Ожидает";
    public const string Accepted = "Принята";
    public const string InProgress = "В пути";
    public const string Paused = "Приостановлена";
    public const string Completed = "Завершено";
    public const string Cancelled = "Отменено";
    public const string NeedsDispatcherDecision = "Требует решения диспетчера";

    public static readonly string[] Active = [Assigned, Waiting, Accepted, InProgress, Paused, NeedsDispatcherDecision];
    public static readonly string[] Delayed = ["Просрочена", "Задержка"];

    public static readonly IReadOnlyDictionary<string, string> DisplayLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [Assigned] = "Назначено",
        [Waiting] = "Ожидает принятия",
        [Accepted] = "Принято",
        [InProgress] = "В работе",
        [Paused] = "Приостановлено",
        [Completed] = "Завершено",
        [Cancelled] = "Отменено",
        [NeedsDispatcherDecision] = "Требует решения диспетчера"
    };

    public static string ToDisplayLabel(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return string.Empty;
        }

        return DisplayLabels.TryGetValue(status.Trim(), out var label) ? label : status.Trim();
    }
}
