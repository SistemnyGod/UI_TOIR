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
    public async Task<IReadOnlyList<PercoIntegrationLogDto>> GetLogsAsync(
        int take = 100,
        CancellationToken cancellationToken = default)
    {
        var normalizedTake = Clamp(take, 1, 500);
        return await dbContext.PercoIntegrationLogs
            .AsNoTracking()
            .OrderByDescending(log => log.StartedAt)
            .Take(normalizedTake)
            .Select(log => new PercoIntegrationLogDto(
                log.Id,
                log.Operation,
                log.Status,
                log.Message,
                log.Details,
                log.StartedAt,
                log.FinishedAt,
                log.CreatedByUserId))
            .ToListAsync(cancellationToken);
    }

    private async Task AddLogAsync(
        string operation,
        string status,
        string message,
        string details,
        Guid? actorUserId,
        DateTimeOffset startedAt,
        DateTimeOffset finishedAt,
        CancellationToken cancellationToken)
    {
        dbContext.PercoIntegrationLogs.Add(new PercoIntegrationLogEntity
        {
            Id = Guid.NewGuid(),
            Operation = operation,
            Status = status,
            Message = SanitizeDbText(message, 1200),
            Details = SanitizeDbText(details, 4000),
            StartedAt = startedAt,
            FinishedAt = finishedAt,
            CreatedByUserId = actorUserId
        });

        await Task.CompletedTask;
    }

    private static string SanitizeDbText(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (ch == '\0')
            {
                continue;
            }

            builder.Append(ch);
            if (builder.Length >= maxLength)
            {
                break;
            }
        }

        return builder.ToString();
    }
}
