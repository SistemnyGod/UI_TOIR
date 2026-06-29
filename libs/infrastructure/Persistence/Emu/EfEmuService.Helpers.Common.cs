using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService
{
    private static string NormalizeOperationalStatus(string? value)
    {
        var normalized = NormalizeRequired(value);
        return normalized is StatusInWork or StatusWaiting or StatusCompleted or StatusDeleted ? normalized : string.Empty;
    }

    private static string NormalizeResultStatus(string value)
    {
        var normalized = NormalizeRequired(value);
        return normalized is "Выполнено" or "Частично выполнено" or "Не выполнено" or "Отменено" ? normalized : string.Empty;
    }

    private static string NormalizeFinishParticipationStatus(string value)
    {
        var normalized = NormalizeRequired(value);
        return normalized is EmployeeDone or EmployeePartial ? normalized : string.Empty;
    }

    private static string NormalizePriority(string value)
    {
        var normalized = NormalizeOptional(value);
        return normalized is "Низкий" or "Высокий" or "Срочно" ? normalized : "Обычный";
    }

    private static string NormalizeRequired(string? value) => (value ?? string.Empty).Trim();

    private static string NormalizeOptional(string? value) => (value ?? string.Empty).Trim();

    private static string DisplayName(string? value, string fallback = "не указано") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string GenerateCode(string name) =>
        string.Join("-", name.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static DateOnly GetBusinessDate(DateTimeOffset value) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(value, BusinessTimeZone).DateTime);

    private static TimeZoneInfo ResolveBusinessTimeZone()
    {
        foreach (var id in new[] { "Asia/Yekaterinburg", "Ekaterinburg Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Local;
    }

    private static void SetProperty<TValue>(object target, string propertyName, TValue value)
    {
        var property = target.GetType().GetProperty(propertyName);
        property?.SetValue(target, value);
    }

    private static EmuCommandResult<T> Success<T>(T value) =>
        new(value, new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase));

    private static EmuCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase) { [key] = [message] });

    private static Paging NormalizePaging(int page, int pageSize) =>
        new(Math.Max(1, page), Math.Clamp(pageSize, 1, 500));

    private static EmuListResponseDto<T> ToList<T>(IReadOnlyList<T> rows, int total, Paging paging) =>
        new(rows, total, paging.Page, paging.PageSize, Math.Max(1, (int)Math.Ceiling(total / (double)paging.PageSize)));

    private sealed record Paging(int Page, int PageSize);
}
