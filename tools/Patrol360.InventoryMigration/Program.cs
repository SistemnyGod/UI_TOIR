using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure;

var target = Environment.GetEnvironmentVariable("INVENTORY_MIGRATION_TARGET");
var source = Environment.GetEnvironmentVariable("INVENTORY_LEGACY_CONNECTION_STRING");
if (string.IsNullOrWhiteSpace(target) || string.IsNullOrWhiteSpace(source))
{
    Console.Error.WriteLine("Set INVENTORY_MIGRATION_TARGET and INVENTORY_LEGACY_CONNECTION_STRING. Connection strings are never written to the console.");
    return 2;
}
NpgsqlConnectionStringBuilder targetBuilder;
NpgsqlConnectionStringBuilder sourceBuilder;
try
{
    targetBuilder = new NpgsqlConnectionStringBuilder(target);
    sourceBuilder = new NpgsqlConnectionStringBuilder(source);
}
catch (ArgumentException)
{
    Console.Error.WriteLine("Invalid connection-string format.");
    return 2;
}
var database = targetBuilder.Database ?? "";
if (!database.StartsWith("patrol360_migration_", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("Target must be an isolated restored database named patrol360_migration_*. Production import is disabled.");
    return 2;
}
if (string.Equals(targetBuilder.Host, sourceBuilder.Host, StringComparison.OrdinalIgnoreCase)
    && targetBuilder.Port == sourceBuilder.Port
    && string.Equals(targetBuilder.Database, sourceBuilder.Database, StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("Source and target must be different databases.");
    return 2;
}
if (args.Length != 1 || args[0] is not ("--dry-run" or "--import"))
{
    Console.Error.WriteLine("Choose --dry-run or --import explicitly.");
    return 2;
}
var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["ConnectionStrings:Patrol360"] = target,
    ["InventoryLegacy:ConnectionString"] = source,
    ["InventoryLegacy:MigrationMode"] = "true",
}).Build();
var services = new ServiceCollection();
services.AddPatrolInfrastructure(configuration);
using var provider = services.BuildServiceProvider();
using var scope = provider.CreateScope();
var result = await scope.ServiceProvider.GetRequiredService<IInventoryLegacyImportService>()
    .ImportAsync(new InventoryLegacyImportRequestDto(args[0] == "--dry-run"));
Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
return result.Succeeded && result.Value?.Status == "completed" ? 0 : 1;
