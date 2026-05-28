using Patrol360.Infrastructure;
using Patrol360.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

const string WebCorsPolicy = "Patrol360Web";

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
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
            .AllowAnyMethod();
    });
});
builder.Services.AddPatrolInfrastructure(builder.Configuration);

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
}

app.UseCors(WebCorsPolicy);
app.UseAuthorization();

app.MapControllers();

await app.Services.InitializePatrolDatabaseAsync();

app.Run();
