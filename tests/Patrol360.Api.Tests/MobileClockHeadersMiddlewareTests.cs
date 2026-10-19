using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;
using Patrol360.Api.Services;

namespace Patrol360.Api.Tests;

public class MobileClockHeadersMiddlewareTests
{
    private static readonly DateTimeOffset ServerNow = new(2026, 10, 19, 9, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task MobileResponseCarriesServerTime()
    {
        var (middleware, _, nextCalls) = CreateMiddleware();
        var (context, response) = CreateContext("/api/v1/mobile/bootstrap");

        await middleware.InvokeAsync(context);
        await response.StartAsync();

        Assert.Equal(1, nextCalls());
        var header = context.Response.Headers[MobileClockHeadersMiddleware.ServerNowHeader].ToString();
        Assert.Equal(ServerNow, DateTimeOffset.Parse(header, CultureInfo.InvariantCulture));
    }

    [Fact]
    public async Task NonMobileResponseIsUnchanged()
    {
        var (middleware, _, nextCalls) = CreateMiddleware();
        var (context, response) = CreateContext("/api/v1/patrol-results");

        await middleware.InvokeAsync(context);
        await response.StartAsync();

        Assert.Equal(1, nextCalls());
        Assert.False(context.Response.Headers.ContainsKey(MobileClockHeadersMiddleware.ServerNowHeader));
    }

    [Fact]
    public async Task LargeClientSkewIsLoggedOncePerInterval()
    {
        var (middleware, logger, _) = CreateMiddleware();
        var behind = ServerNow.AddMinutes(-7).ToString("O", CultureInfo.InvariantCulture);

        for (var request = 0; request < 3; request += 1)
        {
            var (context, _) = CreateContext("/api/v1/mobile/outbox", behind);
            await middleware.InvokeAsync(context);
        }

        var warning = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, warning.Level);
        Assert.Contains("420", warning.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-date")]
    public async Task MissingOrInvalidClientTimeIsAccepted(string? clientNow)
    {
        var (middleware, logger, nextCalls) = CreateMiddleware();
        var (context, _) = CreateContext("/api/v1/mobile/bootstrap", clientNow);

        await middleware.InvokeAsync(context);

        Assert.Equal(1, nextCalls());
        Assert.Empty(logger.Entries);
    }

    [Fact]
    public async Task SmallClientSkewIsNotLogged()
    {
        var (middleware, logger, _) = CreateMiddleware();
        var (context, _) = CreateContext("/api/v1/mobile/bootstrap", ServerNow.AddSeconds(40).ToString("O", CultureInfo.InvariantCulture));

        await middleware.InvokeAsync(context);

        Assert.Empty(logger.Entries);
    }

    private static (MobileClockHeadersMiddleware Middleware, CapturingLogger Logger, Func<int> NextCalls) CreateMiddleware()
    {
        var calls = 0;
        var logger = new CapturingLogger();
        var middleware = new MobileClockHeadersMiddleware(
            _ =>
            {
                calls += 1;
                return Task.CompletedTask;
            },
            logger,
            new FixedTimeProvider(ServerNow));
        return (middleware, logger, () => calls);
    }

    private static (DefaultHttpContext Context, StartableResponseFeature Response) CreateContext(string path, string? clientNow = null)
    {
        var context = new DefaultHttpContext();
        var response = new StartableResponseFeature();
        context.Features.Set<IHttpResponseFeature>(response);
        context.Request.Path = path;
        context.Connection.RemoteIpAddress = IPAddress.Parse("10.0.0.15");
        if (clientNow is not null)
        {
            context.Request.Headers[MobileClockHeadersMiddleware.ClientNowHeader] = clientNow;
        }

        return (context, response);
    }

    private sealed class StartableResponseFeature : HttpResponseFeature
    {
        private readonly List<(Func<object, Task> Callback, object State)> onStarting = [];

        public override void OnStarting(Func<object, Task> callback, object state) => onStarting.Add((callback, state));

        public async Task StartAsync()
        {
            foreach (var (callback, state) in onStarting)
            {
                await callback(state);
            }
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class CapturingLogger : ILogger<MobileClockHeadersMiddleware>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => Entries.Add((logLevel, formatter(state, exception)));
    }
}
