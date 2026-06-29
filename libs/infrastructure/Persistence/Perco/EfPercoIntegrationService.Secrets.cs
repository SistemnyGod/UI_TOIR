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
    public async Task<PercoSecretStatusDto> CheckSecretStatusAsync(
        string component,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var (status, error) = EvaluatePrimarySecret(settings);
        UpdateSecretCheck(settings, component, status, error, now);
        await dbContext.SaveChangesAsync(cancellationToken);
        return BuildSecretStatus(settings);
    }
}
