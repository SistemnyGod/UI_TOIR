using Patrol360.Infrastructure;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Api.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using System.Threading.RateLimiting;

var migrateOnly = args.Any(argument => argument.Equals("--migrate", StringComparison.OrdinalIgnoreCase));
var applicationArgs = args.Where(argument => !argument.Equals("--migrate", StringComparison.OrdinalIgnoreCase)).ToArray();
var builder = WebApplication.CreateBuilder(applicationArgs);

const string WebCorsPolicy = "Patrol360Web";

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = SiteBearerAuthenticationHandler.SchemeName;
        options.DefaultChallengeScheme = SiteBearerAuthenticationHandler.SchemeName;
    })
    .AddScheme<AuthenticationSchemeOptions, SiteBearerAuthenticationHandler>(
        SiteBearerAuthenticationHandler.SchemeName,
        _ => { });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder(SiteBearerAuthenticationHandler.SchemeName)
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    // The API is only exposed behind the Caddy container in the supported
    // deployment. Trust its forwarded client address for rate limiting.
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    Func<HttpContext, RateLimitPartition<string>> authRateLimitPartition = context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });

    options.AddPolicy("web-auth", authRateLimitPartition);
    options.AddPolicy("mobile-auth", authRateLimitPartition);
});
builder.Services.AddCors(options =>
{
    options.AddPolicy(WebCorsPolicy, policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175",
                "http://localhost:5176",
                "https://localhost",
                "https://localhost:5173",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174",
                "http://127.0.0.1:5175",
                "http://127.0.0.1:5176",
                "https://127.0.0.1",
                "https://127.0.0.1:5173",
                "https://192.168.2.194",
                "http://192.168.2.194:5173",
                "http://192.168.2.194:5174",
                "https://192.168.2.194:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .WithExposedHeaders(
                "X-Patrol360-Export-Truncated",
                "X-Patrol360-Export-Row-Count",
                "X-Patrol360-Export-Max-Rows");
    });
});
builder.Services.AddPatrolInfrastructure(builder.Configuration);

var app = builder.Build();

if (migrateOnly)
{
    app.Logger.LogInformation("Applying Patrol360 database migrations and seed data.");
    await app.Services.InitializePatrolDatabaseAsync();
    app.Logger.LogInformation("Patrol360 database initialization completed.");
    return;
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
}

app.UseForwardedHeaders();
app.UseCors(WebCorsPolicy);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
