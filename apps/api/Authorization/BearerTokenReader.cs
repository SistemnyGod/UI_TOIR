using Microsoft.Net.Http.Headers;

namespace Patrol360.Api.Authorization;

internal static class BearerTokenReader
{
    private const string BearerPrefix = "Bearer ";

    public static string? Read(HttpRequest request)
    {
        if (!request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        var authorization = values.ToString();
        if (!authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var accessToken = authorization[BearerPrefix.Length..].Trim();
        return accessToken.Length == 0 ? null : accessToken;
    }
}
