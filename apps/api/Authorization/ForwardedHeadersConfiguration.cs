using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace Patrol360.Api.Authorization;

public static class ForwardedHeadersConfiguration
{
    public static void Configure(ForwardedHeadersOptions options, IEnumerable<string?> knownProxyAddresses)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();

        foreach (var configuredAddress in knownProxyAddresses)
        {
            var value = configuredAddress?.Trim();
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (!IPAddress.TryParse(value, out var address))
            {
                throw new InvalidOperationException(
                    $"ForwardedHeaders:KnownProxies contains invalid IP address '{value}'.");
            }

            options.KnownProxies.Add(address);
        }
    }
}

public static class ClientAddressRateLimitPartition
{
    public static string GetPartitionKey(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
