using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class EmployeeDirectoryDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task CreateEmployeeAllowsBlankPersonnelNoAndGeneratesUniqueTechnicalNumber()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var first = UseEmployees(provider, employees => employees.CreateEmployee(CreateRequest($"Manual Employee One {suffix}")));
        var second = UseEmployees(provider, employees => employees.CreateEmployee(CreateRequest($"Manual Employee Two {suffix}")));

        Assert.True(first.Succeeded, string.Join("; ", first.Errors.SelectMany(row => row.Value)));
        Assert.True(second.Succeeded, string.Join("; ", second.Errors.SelectMany(row => row.Value)));
        Assert.NotNull(first.Employee);
        Assert.NotNull(second.Employee);
        Assert.StartsWith("EMP-", first.Employee!.PersonnelNo, StringComparison.Ordinal);
        Assert.StartsWith("EMP-", second.Employee!.PersonnelNo, StringComparison.Ordinal);
        Assert.NotEqual(first.Employee.PersonnelNo, second.Employee.PersonnelNo);
    }

    private static CreateEmployeeDto CreateRequest(string fullName) =>
        new(
            fullName,
            "",
            "Сотрудник подрядчика",
            "ИП подрядчиков",
            "Активен",
            "Пятидневка",
            HasMobileAccount: false,
            EmployeeGroup: "Подрядчики");

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);

        return services.BuildServiceProvider();
    }

    private static T UseEmployees<T>(ServiceProvider provider, Func<IEmployeeDirectoryService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmployeeDirectoryService>());
    }
}
