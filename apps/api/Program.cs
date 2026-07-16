using Patrol360.Infrastructure;
using Patrol360.Infrastructure.Persistence;
using Microsoft.AspNetCore.HttpOverrides;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

const string WebCorsPolicy = "Patrol360Web";

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
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
    options.AddPolicy("mobile-auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
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

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
}

app.UseForwardedHeaders();
app.UseCors(WebCorsPolicy);
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();

await app.Services.InitializePatrolDatabaseAsync();

app.Run();
