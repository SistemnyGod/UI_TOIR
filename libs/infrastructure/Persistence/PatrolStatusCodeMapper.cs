namespace Patrol360.Infrastructure.Persistence;

public static class PatrolStatusCodeMapper
{
    public static class Assignment
    {
        public const string Assigned = "assigned";
        public const string Waiting = "waiting";
        public const string Accepted = "accepted";
        public const string InProgress = "in_progress";
        public const string Paused = "paused";
        public const string Completed = "completed";
        public const string Cancelled = "cancelled";
        public const string DispatcherReview = "dispatcher_review";
        public const string Overdue = "overdue";
        public const string Delayed = "delayed";
    }

    public static class Request
    {
        public const string New = "new";
        public const string Dispatched = "dispatched";
    }

    public static class Result
    {
        public const string Confirmed = "confirmed";
        public const string Issue = "issue";
        public const string Overdue = "overdue";
        public const string Cancelled = "cancelled";
    }

    private static readonly IReadOnlyDictionary<string, string> AssignmentToCode = CreateMap(
        (Assignment.Assigned, ["Назначена", "Назначено", "assigned"]),
        (Assignment.Waiting, ["Ожидает", "Ожидает принятия", "waiting"]),
        (Assignment.Accepted, ["Принята", "Принято", "accepted"]),
        (Assignment.InProgress, ["В пути", "В работе", "in_progress", "in progress"]),
        (Assignment.Paused, ["Приостановлена", "Приостановлено", "paused"]),
        (Assignment.Completed, ["Завершено", "Завершена", "Выполнено", "completed", "closed"]),
        (Assignment.Cancelled, ["Отменено", "Отменена", "cancelled", "canceled"]),
        (Assignment.DispatcherReview, ["Требует решения диспетчера", "dispatcher_review"]),
        (Assignment.Overdue, ["Просрочена", "Просрочено", "overdue"]),
        (Assignment.Delayed, ["Задержка", "delayed"]));

    private static readonly IReadOnlyDictionary<string, string> RequestToCode = MergeMaps(
        AssignmentToCode,
        CreateMap(
            (Request.New, ["Новая", "new"]),
            (Request.Dispatched, ["Отправлена", "Отправлено", "dispatched", "sent"])));

    private static readonly IReadOnlyDictionary<string, string> ResultToCode = CreateMap(
        (Result.Confirmed, ["Подтверждено", "Выполнено", "ok", "success", "completed", "confirmed"]),
        (Result.Issue, ["Замечание", "issue"]),
        (Result.Overdue, ["Просрочено", "Просрочена", "overdue"]),
        (Result.Cancelled, ["Отменено", "Отменена", "cancelled", "canceled"]));

    private static readonly IReadOnlyDictionary<string, string> AssignmentLegacy = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [Assignment.Assigned] = "Назначена",
        [Assignment.Waiting] = "Ожидает",
        [Assignment.Accepted] = "Принята",
        [Assignment.InProgress] = "В пути",
        [Assignment.Paused] = "Приостановлена",
        [Assignment.Completed] = "Завершено",
        [Assignment.Cancelled] = "Отменено",
        [Assignment.DispatcherReview] = "Требует решения диспетчера",
        [Assignment.Overdue] = "Просрочена",
        [Assignment.Delayed] = "Задержка",
    };

    private static readonly IReadOnlyDictionary<string, string> RequestLegacy = new Dictionary<string, string>(AssignmentLegacy, StringComparer.OrdinalIgnoreCase)
    {
        [Request.New] = "Новая",
        [Request.Dispatched] = "Отправлена",
    };

    private static readonly IReadOnlyDictionary<string, string> ResultLegacy = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [Result.Confirmed] = "Подтверждено",
        [Result.Issue] = "Замечание",
        [Result.Overdue] = "Просрочено",
        [Result.Cancelled] = "Отменено",
    };

    public static string? ToAssignmentCode(string? value) => ToCode(AssignmentToCode, value);

    public static string? ToRequestCode(string? value) => ToCode(RequestToCode, value);

    public static string? ToResultCode(string? value) => ToCode(ResultToCode, value);

    public static string? ToAssignmentLegacy(string? code) => ToLegacy(AssignmentLegacy, code);

    public static string? ToRequestLegacy(string? code) => ToLegacy(RequestLegacy, code);

    public static string? ToResultLegacy(string? code) => ToLegacy(ResultLegacy, code);

    private static string? ToCode(IReadOnlyDictionary<string, string> map, string? value)
    {
        var normalized = value?.Trim();
        return !string.IsNullOrWhiteSpace(normalized) && map.TryGetValue(normalized, out var code) ? code : null;
    }

    private static string? ToLegacy(IReadOnlyDictionary<string, string> map, string? code)
    {
        var normalized = code?.Trim();
        return !string.IsNullOrWhiteSpace(normalized) && map.TryGetValue(normalized, out var legacy) ? legacy : null;
    }

    private static IReadOnlyDictionary<string, string> CreateMap(params (string Code, string[] Values)[] definitions)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (code, values) in definitions)
        {
            map[code] = code;
            foreach (var value in values)
            {
                map[value] = code;
            }
        }

        return map;
    }

    private static IReadOnlyDictionary<string, string> MergeMaps(
        IReadOnlyDictionary<string, string> first,
        IReadOnlyDictionary<string, string> second)
    {
        var result = new Dictionary<string, string>(first, StringComparer.OrdinalIgnoreCase);
        foreach (var item in second)
        {
            result[item.Key] = item.Value;
        }

        return result;
    }
}
