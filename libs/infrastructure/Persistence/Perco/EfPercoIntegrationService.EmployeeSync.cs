using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPercoIntegrationService
{
    public async Task<PercoSyncResultDto> SyncEmployeesAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var startedAt = DateTimeOffset.UtcNow;

        try
        {
            using var session = await CreateAuthenticatedSessionAsync(settings, cancellationToken);
            var rawEmployees = await GetJsonAsync<List<PercoStaffRow>>(session, settings.EmployeesEndpoint, cancellationToken) ?? [];
            var employees = rawEmployees.Where(IsActivePercoStaff).ToList();
            var inactivePercoIds = rawEmployees
                .Where(row => !IsActivePercoStaff(row))
                .Select(row => row.Id.ToString(CultureInfo.InvariantCulture))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingLinks = await dbContext.PercoEmployeeLinks.ToListAsync(cancellationToken);
            var linksByPercoId = existingLinks.ToDictionary(link => link.PercoEmployeeId, StringComparer.OrdinalIgnoreCase);
            var projectEmployees = (await dbContext.Employees.AsNoTracking().ToListAsync(cancellationToken))
                .Where(IsActiveProjectEmployee)
                .ToList();
            var employeesByPersonnel = projectEmployees
                .Where(employee => !string.IsNullOrWhiteSpace(employee.PersonnelNo))
                .GroupBy(employee => employee.PersonnelNo.Trim(), StringComparer.OrdinalIgnoreCase)
                .Where(group => group.Count() == 1)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
            var employeesByName = projectEmployees
                .GroupBy(employee => NormalizeName(employee.FullName))
                .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

            var created = 0;
            var updated = 0;
            var unmatched = 0;
            var duplicates = 0;
            var now = DateTimeOffset.UtcNow;

            foreach (var link in existingLinks.Where(link => inactivePercoIds.Contains(link.PercoEmployeeId)))
            {
                if (link.MatchStatus == "PERCO_INACTIVE" && link.EmployeeId is null)
                {
                    continue;
                }

                link.EmployeeId = null;
                link.MatchStatus = "PERCO_INACTIVE";
                link.UpdatedAt = now;
                updated++;
            }

            foreach (var row in employees)
            {
                var percoEmployeeId = row.Id.ToString(CultureInfo.InvariantCulture);
                if (string.IsNullOrWhiteSpace(percoEmployeeId))
                {
                    duplicates++;
                    continue;
                }

                var fullName = JoinName(row.LastName, row.FirstName, row.MiddleName);
                var personnelNo = (row.TabelNumber ?? string.Empty).Trim();
                var matchedEmployee = FindEmployee(row, fullName, personnelNo, employeesByPersonnel, employeesByName);
                var matchStatus = matchedEmployee is null ? "UNMATCHED" : "AUTO_MATCHED";

                if (!linksByPercoId.TryGetValue(percoEmployeeId, out var link))
                {
                    link = new PercoEmployeeLinkEntity
                    {
                        Id = Guid.NewGuid(),
                        PercoEmployeeId = percoEmployeeId,
                        CreatedAt = now
                    };
                    dbContext.PercoEmployeeLinks.Add(link);
                    linksByPercoId[percoEmployeeId] = link;
                    created++;
                }
                else
                {
                    updated++;
                }

                link.FullName = fullName;
                link.PersonnelNo = personnelNo;
                link.CardNumber = string.Empty;
                link.Department = row.DivisionName ?? string.Empty;
                if (link.MatchStatus == "MATCHED")
                {
                    if (link.EmployeeId is not null && !projectEmployees.Any(employee => employee.Id == link.EmployeeId.Value))
                    {
                        link.EmployeeId = null;
                        link.MatchStatus = matchStatus;
                    }
                }
                else if (link.MatchStatus != "IGNORED")
                {
                    link.EmployeeId = matchedEmployee?.Id;
                    link.MatchStatus = matchStatus;
                }

                link.UpdatedAt = now;

                if (link.EmployeeId is null && link.MatchStatus != "IGNORED")
                {
                    unmatched++;
                }
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            var backfilledEvents = await BackfillAccessEventEmployeesAsync(cancellationToken);
            if (backfilledEvents > 0)
            {
                await RebuildPresenceIntervalsForNewEventsAsync(cancellationToken);
            }

            await UpsertSyncStateAsync(EmployeesSyncType, now, employees.Count.ToString(CultureInfo.InvariantCulture), string.Empty, cancellationToken);
            await AddLogAsync(
                "SYNC_EMPLOYEES",
                "SUCCESS",
                $"Синхронизация сотрудников PERCo завершена: загружено {employees.Count}.",
                $"endpoint={settings.EmployeesEndpoint}; loadedRaw={rawEmployees.Count}; active={employees.Count}; skippedInactive={rawEmployees.Count - employees.Count}; created={created}; updated={updated}; unmatched={unmatched}; backfilledEvents={backfilledEvents}",
                actorUserId,
                startedAt,
                now,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new PercoSyncResultDto(true, "success", "Сотрудники PERCo синхронизированы.", employees.Count, created, updated, 0, duplicates, unmatched, 0, now);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException)
        {
            var finishedAt = DateTimeOffset.UtcNow;
            await UpsertSyncStateAsync(EmployeesSyncType, null, string.Empty, exception.Message, cancellationToken);
            await AddLogAsync("SYNC_EMPLOYEES", "ERROR", "Ошибка синхронизации сотрудников PERCo.", exception.Message, actorUserId, startedAt, finishedAt, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            return new PercoSyncResultDto(false, "error", "Ошибка синхронизации сотрудников PERCo.", 0, 0, 0, 0, 0, 0, 1, finishedAt);
        }
    }

    public async Task<IReadOnlyList<PercoUnmatchedEmployeeDto>> GetUnmatchedEmployeesAsync(CancellationToken cancellationToken = default)
    {
        var links = await dbContext.PercoEmployeeLinks
            .AsNoTracking()
            .Where(link => link.MatchStatus == "UNMATCHED")
            .OrderBy(link => link.FullName)
            .Take(500)
            .ToListAsync(cancellationToken);
        var projectEmployees = (await dbContext.Employees.AsNoTracking().ToListAsync(cancellationToken))
            .Where(IsActiveProjectEmployee)
            .ToList();
        var employeesByPersonnel = projectEmployees
            .Where(employee => !string.IsNullOrWhiteSpace(employee.PersonnelNo))
            .GroupBy(employee => employee.PersonnelNo.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var employeesByName = projectEmployees
            .GroupBy(employee => NormalizeName(employee.FullName))
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        return links.Select(link =>
        {
            var suggested = employeesByPersonnel.GetValueOrDefault(link.PersonnelNo)
                ?? employeesByName.GetValueOrDefault(NormalizeName(link.FullName));
            return new PercoUnmatchedEmployeeDto(
                link.PercoEmployeeId,
                link.FullName,
                link.PersonnelNo,
                link.CardNumber,
                link.Department,
                suggested?.Id,
                suggested?.FullName ?? string.Empty);
        }).ToList();
    }

    public async Task<PercoSyncResultDto> MatchEmployeeAsync(
        MatchPercoEmployeeDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var link = await dbContext.PercoEmployeeLinks
            .FirstOrDefaultAsync(row => row.PercoEmployeeId == request.PercoEmployeeId, cancellationToken);
        if (link is null)
        {
            return new PercoSyncResultDto(false, "not_found", "Сотрудник PERCo не найден в списке синхронизации.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        if (request.Action.Equals("ignore", StringComparison.OrdinalIgnoreCase))
        {
            link.EmployeeId = null;
            link.MatchStatus = "IGNORED";
        }
        else
        {
            if (request.EmployeeId is null)
            {
                return new PercoSyncResultDto(false, "validation_error", "Для сопоставления нужно выбрать сотрудника проекта.", 0, 0, 0, 0, 0, 0, 1, now);
            }

            var employee = await dbContext.Employees.AsNoTracking().FirstOrDefaultAsync(employee => employee.Id == request.EmployeeId, cancellationToken);
            if (employee is null)
            {
                return new PercoSyncResultDto(false, "not_found", "Сотрудник проекта не найден.", 0, 0, 0, 0, 0, 0, 1, now);
            }

            if (!IsActiveProjectEmployee(employee))
            {
                return new PercoSyncResultDto(false, "validation_error", "Нельзя привязать PERCo к уволенному или архивному сотруднику.", 0, 0, 0, 0, 0, 0, 1, now);
            }

            link.EmployeeId = request.EmployeeId;
            link.MatchStatus = "MATCHED";
        }

        link.MatchedAt = now;
        link.MatchedByUserId = actorUserId;
        link.UpdatedAt = now;

        await AddLogAsync(
            "MATCH_EMPLOYEES",
            "SUCCESS",
            "Сопоставление сотрудника PERCo сохранено.",
            $"percoEmployeeId={request.PercoEmployeeId}; action={request.Action}; employeeId={request.EmployeeId}",
            actorUserId,
            now,
            now,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new PercoSyncResultDto(true, "success", "Сопоставление сотрудника PERCo сохранено.", 0, 0, 1, 0, 0, 0, 0, now);
    }

    private static EmployeeEntity? FindEmployee(
        PercoStaffRow row,
        string fullName,
        string personnelNo,
        IReadOnlyDictionary<string, EmployeeEntity> employeesByPersonnel,
        IReadOnlyDictionary<string, EmployeeEntity> employeesByName)
    {
        var normalizedFullName = NormalizeName(fullName);
        var byName = string.IsNullOrWhiteSpace(normalizedFullName)
            ? null
            : employeesByName.GetValueOrDefault(normalizedFullName);

        if (!string.IsNullOrWhiteSpace(personnelNo) && employeesByPersonnel.TryGetValue(personnelNo, out var byPersonnel))
        {
            if (byName is not null && NormalizeName(byPersonnel.FullName) != normalizedFullName)
            {
                return byName;
            }

            return byPersonnel;
        }

        return byName;
    }

    private static bool IsActivePercoStaff(PercoStaffRow row) => row.IsActive == 1;

    private static bool IsActiveProjectEmployee(EmployeeEntity employee)
    {
        var status = (employee.Status ?? string.Empty).Trim().ToLowerInvariant();
        if (status.Length == 0)
        {
            return true;
        }

        if (status is "archived" or "archive" or "inactive" or "disabled" or "dismissed" or "terminated" or "fired")
        {
            return false;
        }

        return !status.Contains("увол", StringComparison.OrdinalIgnoreCase)
            && !status.Contains("архив", StringComparison.OrdinalIgnoreCase)
            && !status.Contains("неактив", StringComparison.OrdinalIgnoreCase);
    }
}
