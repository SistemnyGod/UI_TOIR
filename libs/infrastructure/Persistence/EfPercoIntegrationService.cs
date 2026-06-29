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

internal sealed partial class EfPercoIntegrationService(
    Patrol360DbContext dbContext,
    IDataProtectionProvider dataProtectionProvider) : IPercoIntegrationService
{
    private const string EmployeesSyncType = "employees";
    private const string EventsSyncType = "events";
    private const string AuthModeLoginPassword = "LoginPassword";
    private const string AuthModeToken = "Token";
    private const string DefaultEmployeesEndpoint = "/api/users/staff/fullList";
    private const string DefaultEventsEndpoint = "/api/accessReports/events";
    private const int MaxReliablePresenceMinutes = 18 * 60;
    private static readonly TimeSpan MaxReliablePresenceDuration = TimeSpan.FromMinutes(MaxReliablePresenceMinutes);
    private static readonly TimeSpan SessionTokenTtl = TimeSpan.FromHours(8);
    private static readonly Guid SingletonSettingsId = Guid.Parse("66666666-0000-0000-0000-000000000001");
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    private readonly IDataProtector secretProtector = dataProtectionProvider.CreateProtector("Patrol360.Integrations.Perco.Secrets.v1");
}
