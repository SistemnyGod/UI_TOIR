namespace Patrol360.Infrastructure.Tests;

public sealed class DbIntegrationFactAttribute : FactAttribute
{
    public DbIntegrationFactAttribute()
    {
        if (!string.Equals(
                Environment.GetEnvironmentVariable("PATROL360_RUN_DB_INTEGRATION"),
                "true",
                StringComparison.OrdinalIgnoreCase))
        {
            Skip = "Set PATROL360_RUN_DB_INTEGRATION=true or run Test-All.ps1 -IncludeDbIntegration.";
        }
    }
}
