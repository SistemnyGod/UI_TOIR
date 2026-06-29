using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private static MobileUserDto MapUser(MobileAccountEntity account)
    {
        var names = GetBoundEmployeeNames(account);
        return new MobileUserDto(
            account.Id,
            names.Count == 0 ? account.Login : string.Join(", ", names),
            [NormalizeOptionalText(account.Role, "mobile")],
            ["mobile.bootstrap", "mobile.outbox"],
            account.LastSeenAt ?? account.CreatedAt);
    }

    private static MobileDeviceDto MapDevice(MobileAccountEntity account, MobileAccountSessionEntity session) =>
        new(session.DeviceId, account.Id, Trusted: true, BlockedAt: null);

    private static MobileNotificationDto MapNotification(MobileNotificationEntity notification) =>
        new(
            notification.Id,
            notification.Type,
            notification.Title,
            notification.Message,
            notification.EntityType,
            notification.EntityId,
            notification.CreatedAt,
            notification.ReadAt);

    private static bool CanUseMobileApp(MobileAccountEntity account) =>
        IsActiveStatus(account.Status) && GetBoundEmployeeIds(account).Count > 0;

    private static bool IsActiveStatus(string status) =>
        status.Equals("Активен", StringComparison.OrdinalIgnoreCase)
        || status.Equals("Активен", StringComparison.OrdinalIgnoreCase)
        || status.Equals("Active", StringComparison.OrdinalIgnoreCase);

    private static bool IsClosedRequestStatus(string status)
    {
        var normalized = NormalizeOptionalText(status);
        return normalized.Equals("Завершена", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("Отменена", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("Закрыта", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("completed", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals(AssignmentStatusValues.Completed, StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("cancelled", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("canceled", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals(AssignmentStatusValues.Cancelled, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ResolveRequestEmployeeName(PatrolRequestEntity request)
    {
        if (!string.IsNullOrWhiteSpace(request.EmployeeName))
        {
            return request.EmployeeName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Employee?.FullName))
        {
            return request.Employee.FullName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Assignment?.Employee?.FullName))
        {
            return request.Assignment.Employee.FullName.Trim();
        }

        return null;
    }

    private static IReadOnlySet<Guid> GetBoundEmployeeIds(MobileAccountEntity account) =>
        account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .Select(binding => binding.EmployeeId)
            .ToHashSet();

    private static IReadOnlyList<string> GetBoundEmployeeNames(MobileAccountEntity account)
    {
        var activeBindingNames = account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .Select(binding => binding.DisplayName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return activeBindingNames.Length > 0 ? activeBindingNames : account.BoundEmployees;
    }

    private static DateTimeOffset BuildPlannedStartAt(DateOnly date, TimeOnly? time)
    {
        var dateTime = date.ToDateTime(time ?? TimeOnly.MinValue);
        return new DateTimeOffset(DateTime.SpecifyKind(dateTime, DateTimeKind.Utc));
    }

    private static string BuildWorkTaskTitle(EmuWorkSessionEntity workSession)
    {
        if (!string.IsNullOrWhiteSpace(workSession.TaskDescription))
        {
            return workSession.TaskDescription.Trim();
        }

        return string.IsNullOrWhiteSpace(workSession.WorkNumber)
            ? "Задача учета работ"
            : $"Задача {workSession.WorkNumber}";
    }

    private static string MapWorkTaskStatus(EmuWorkSessionEntity workSession, IReadOnlyCollection<Guid> boundEmployeeIds)
    {
        if (workSession.CompletedAt is not null)
        {
            return "completedServer";
        }

        var employeeRows = workSession.Employees
            .Where(employee => boundEmployeeIds.Contains(employee.EmployeeId))
            .ToArray();

        if (employeeRows.Length > 0 && employeeRows.All(employee => employee.FinishedAt is not null))
        {
            return "completedServer";
        }

        if (workSession.Pauses.Any(pause => pause.EndedAt is null))
        {
            return "paused";
        }

        return workSession.ArrivedAt <= DateTimeOffset.UtcNow ? "inProgress" : "accepted";
    }

    private static string MapRequestStatus(PatrolRequestEntity request)
    {
        if (request.Assignment?.Status == AssignmentStatusValues.InProgress)
        {
            return "inProgress";
        }

        if (request.Assignment?.Status == AssignmentStatusValues.Paused)
        {
            return "paused";
        }

        if (request.Assignment?.Status == AssignmentStatusValues.NeedsDispatcherDecision)
        {
            return "needsDispatcherDecision";
        }

        if (request.Assignment?.Status == AssignmentStatusValues.Cancelled || request.Status == AssignmentStatusValues.Cancelled)
        {
            return "cancelledServer";
        }

        if (request.Assignment is not null)
        {
            return "accepted";
        }

        return request.EmployeeId is null ? "available" : "assigned";
    }

    private static string MapAssignmentStatus(string status)
    {
        if (status == AssignmentStatusValues.Accepted || status == AssignmentStatusValues.Assigned || status == AssignmentStatusValues.Waiting)
        {
            return "accepted";
        }

        if (status == AssignmentStatusValues.InProgress)
        {
            return "inProgress";
        }

        if (status == AssignmentStatusValues.Paused)
        {
            return "paused";
        }

        if (status == AssignmentStatusValues.NeedsDispatcherDecision)
        {
            return "needsDispatcherDecision";
        }

        return "accepted";
    }

    private static string BuildMobileRequestDisplayNumber(Guid requestId) =>
        $"#{requestId.ToString("N")[..8].ToUpperInvariant()}";

    private static Dictionary<string, string[]> ValidateLoginRequest(MobileLoginRequestDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(request.Login))
        {
            errors["login"] = ["Login is required."];
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors["password"] = ["Password is required."];
        }

        if (string.IsNullOrWhiteSpace(request.DeviceId))
        {
            errors["deviceId"] = ["Device id is required."];
        }

        return errors;
    }

    private static MobileOutboxResponseDto Rejected(string clientOperationId, string message) =>
        new(clientOperationId, "rejected", null, null, message, null, null);

    private static MobileOutboxResponseDto Conflict(string clientOperationId, string message) =>
        new(clientOperationId, "conflict", null, null, message, Guid.NewGuid().ToString(), null);

    private static MobileOutboxResponseDto AcceptedPoint(string clientOperationId, Guid pointId, long revision, string message) =>
        new(clientOperationId, "accepted", pointId.ToString(), revision, message, null, null);

    private static Guid? ReadGuid(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is Guid guid)
        {
            return guid;
        }

        if (value is JsonElement element && element.ValueKind == JsonValueKind.String)
        {
            return Guid.TryParse(element.GetString(), out var parsed) ? parsed : null;
        }

        return Guid.TryParse(value.ToString(), out var fallback) ? fallback : null;
    }

    private static long? ReadLong(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            long number => number,
            int number => number,
            JsonElement element when element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out var number) => number,
            JsonElement element when element.ValueKind == JsonValueKind.String && long.TryParse(element.GetString(), out var number) => number,
            _ => long.TryParse(value.ToString(), out var parsed) ? parsed : null,
        };
    }

    private static string? ReadString(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is JsonElement element)
        {
            return element.ValueKind == JsonValueKind.String ? element.GetString() : element.ToString();
        }

        return value.ToString();
    }

    private static IReadOnlyList<string> ReadStringList(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return [];
        }

        if (value is JsonElement element)
        {
            if (element.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return element.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => NormalizeOptionalText(item.GetString()))
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        var json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<List<string>>(json, JsonOptions)?
            .Select(item => NormalizeOptionalText(item))
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToArray() ?? [];
    }

    private static IReadOnlyList<string> ReadStringListFromJson(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(value, JsonOptions)?
                .Select(item => NormalizeOptionalText(item))
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.Ordinal)
                .ToArray() ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static DateTimeOffset? ReadDateTimeOffset(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is DateTimeOffset offset)
        {
            return offset;
        }

        if (value is JsonElement element && element.ValueKind == JsonValueKind.String)
        {
            return DateTimeOffset.TryParse(element.GetString(), out var parsed) ? parsed : null;
        }

        return DateTimeOffset.TryParse(value.ToString(), out var fallback) ? fallback : null;
    }

    private static IReadOnlyList<MobilePointResultPayload> ReadPointResults(Dictionary<string, object?> payload)
    {
        if (!payload.TryGetValue("pointResults", out var value) || value is null)
        {
            return [];
        }

        if (value is JsonElement element)
        {
            return element.Deserialize<List<MobilePointResultPayload>>(JsonOptions) ?? [];
        }

        var json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<List<MobilePointResultPayload>>(json, JsonOptions) ?? [];
    }

    private static string BuildResultComment(
        IReadOnlyList<MobilePointResultPayload> pointResults,
        IEnumerable<RoutePointEntity> routePoints)
    {
        var names = routePoints.ToDictionary(point => point.Id, point => point.Name);
        var lines = pointResults
            .OrderBy(result => names.TryGetValue(result.PointId, out var name) ? name : result.PointId.ToString())
            .Select(result =>
            {
                var pointName = names.TryGetValue(result.PointId, out var name) ? name : result.PointId.ToString();
                var comment = string.IsNullOrWhiteSpace(result.Comment) ? "-" : result.Comment.Trim();
                return $"{pointName}: {FormatPointResultStatus(result.Status)}; {comment}";
            });

        return string.Join(Environment.NewLine, lines).Trim();
    }

    private static bool IsSkippedPointResult(MobilePointResultPayload result) =>
        result.Status.Equals("skipped", StringComparison.OrdinalIgnoreCase);

    private static bool IsManualPointResult(MobilePointResultPayload result) =>
        result.ConfirmationType?.Equals("manual", StringComparison.OrdinalIgnoreCase) == true;

    private static string FormatPointResultStatus(string status)
    {
        if (status.Equals("skipped", StringComparison.OrdinalIgnoreCase))
        {
            return "Метка недоступна";
        }

        if (status.Equals("ok", StringComparison.OrdinalIgnoreCase))
        {
            return "Исправно";
        }

        if (status.Equals("issue", StringComparison.OrdinalIgnoreCase))
        {
            return "Неисправно";
        }

        return status;
    }

    private static string FormatDeviation(DateTimeOffset plannedAt, DateTimeOffset actualAt)
    {
        var minutes = (int)Math.Round((actualAt - plannedAt).TotalMinutes);
        if (minutes == 0)
        {
            return "0m";
        }

        return minutes > 0 ? $"+{minutes}m" : $"{minutes}m";
    }

    private static bool TouchSession(MobileAccountSessionEntity session)
    {
        var now = DateTimeOffset.UtcNow;
        if (now - session.LastSeenAt < TimeSpan.FromSeconds(60))
        {
            return false;
        }

        session.LastSeenAt = now;
        if (session.MobileAccount is not null)
        {
            session.MobileAccount.LastSeenAt = now;
            session.MobileAccount.Session = "Онлайн";
        }

        return true;
    }

    private static MobileAuthResult UnauthorizedResult() =>
        new(null, true, EmptyErrors());

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

    private static string NormalizeLogin(string? value) =>
        new(NormalizeOptionalText(value)
            .ToLowerInvariant()
            .Replace(' ', '.')
            .Where(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-')
            .ToArray());

    private static string NormalizeOptionalText(string? value, string fallback = "") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string? NormalizeNullableText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeMobileContentType(string? contentType)
    {
        var normalized = NormalizeOptionalText(contentType).ToLowerInvariant();
        return normalized switch
        {
            "image/jpeg" or "image/jpg" => "image/jpeg",
            "video/mp4" => "video/mp4",
            _ => string.Empty
        };
    }
}
