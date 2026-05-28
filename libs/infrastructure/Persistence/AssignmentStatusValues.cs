namespace Patrol360.Infrastructure.Persistence;

internal static class AssignmentStatusValues
{
    public const string Assigned = "Назначена";
    public const string Waiting = "Ожидает";
    public const string InProgress = "В пути";
    public const string Completed = "Завершено";
    public const string Cancelled = "Отменено";

    public static readonly string[] Active = [Assigned, Waiting, InProgress];
    public static readonly string[] Delayed = ["Просрочена", "Задержка"];
}
