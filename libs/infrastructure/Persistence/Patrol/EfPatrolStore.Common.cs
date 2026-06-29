using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private static string NormalizeOptionalText(string? value) =>
        NormalizeOptionalText(value, string.Empty);

    private static string NormalizeOptionalText(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string NormalizeTimeValue(string? value, string fallback) =>
        TimeOnly.TryParseExact(value, "HH:mm", out var time) ? time.ToString("HH:mm") : fallback;

    private static string BuildAssignmentNotificationText(string employeeName, string routeName, DateTimeOffset plannedAt) =>
        $"{employeeName}, назначен обход \"{routeName}\" на {plannedAt.ToLocalTime():dd.MM.yyyy HH:mm}. Подтвердите получение задания в мобильном приложении.";

    private static bool IsArchivedStatus(string? status) =>
        string.Equals(NormalizeOptionalText(status), "Архив", StringComparison.OrdinalIgnoreCase);

    private static bool IsActivePointStatus(string? status) =>
        !string.Equals(NormalizeOptionalText(status), "Черновик", StringComparison.OrdinalIgnoreCase);
}
