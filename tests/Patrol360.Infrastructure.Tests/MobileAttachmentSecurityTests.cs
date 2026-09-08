using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed partial class MobileAttachmentSecurityTests
{
    [DbIntegrationFact]
    public async Task PendingWorkFileIsPrivateAndCannotBeRetargeted()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var mobile = scope.ServiceProvider.GetRequiredService<IMobileAppService>();
        var (token, employeeId) = Login(scope.ServiceProvider);
        var section = db.EmuWorkSections.First();
        var work = scope.ServiceProvider.GetRequiredService<IEmuWorkService>();
        var foreignEmployee = db.Employees.First(row => row.Id != employeeId).Id;
        var foreign = work.CreateWorkSession(new EmuCreateWorkSessionDto(
            DateOnly.FromDateTime(DateTime.UtcNow), section.Id, DateTimeOffset.UtcNow,
            [foreignEmployee], "Foreign work"), null, "test");
        Assert.True(foreign.Succeeded);
        var clientId = Guid.NewGuid().ToString();
        var upload = mobile.UploadFile(token, File(clientId, foreign.Value!.Id));
        Assert.NotNull(upload);
        Assert.Empty(work.GetWorkSession(foreign.Value.Id).Value!.Attachments);
        Assert.Null(work.GetWorkAttachmentFile(foreign.Value.Id, upload!.ServerFileId));
        Assert.Null(mobile.UploadFile(token, File(clientId, Guid.NewGuid())));

        var localWorkId = Guid.NewGuid();
        var ownUpload = mobile.UploadFile(token, File(Guid.NewGuid().ToString(), localWorkId));
        Assert.NotNull(ownUpload);
        var command = new MobileOutboxCommandDto(Guid.NewGuid().ToString(), "createWorkTask", "workTask",
            localWorkId.ToString(), null, new()
            {
                ["taskId"] = localWorkId.ToString(),
                ["sectionId"] = section.Id.ToString(),
                ["employeeId"] = employeeId.ToString(),
                ["taskDescription"] = "Offline work",
            }, DateTimeOffset.UtcNow, 0, "pending");
        Assert.Equal("accepted", Assert.Single(mobile.SaveOutbox(token, new([command]))).Status);
        Assert.Single(work.GetWorkSession(localWorkId).Value!.Attachments);
        mobile.SaveOutbox(token, new([command]));
        Assert.Single(work.GetWorkSession(localWorkId).Value!.Attachments);
    }

    [DbIntegrationFact]
    public async Task EmptySectionScopeReturnsNoRemarks()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        using var scope = provider.CreateScope();
        var (_, employeeId) = Login(scope.ServiceProvider);
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var sectionId = db.EmuWorkSections.First().Id;
        db.MobileShiftRemarks.Add(new MobileShiftRemarkEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = db.MobileAccounts.Single().Id,
            EmployeeId = employeeId,
            SectionId = sectionId,
            Title = "Private remark",
            CreatedAtLocal = DateTimeOffset.UtcNow,
            CreatedAtServer = DateTimeOffset.UtcNow,
        });
        db.SaveChanges();
        var work = scope.ServiceProvider.GetRequiredService<IEmuWorkService>();
        Assert.Empty(work.GetShiftRemarks(allowedSectionIds: []).Rows);
        Assert.Single(work.GetShiftRemarks(allowedSectionIds: null).Rows);
        Assert.Single(work.GetShiftRemarks(allowedSectionIds: [sectionId]).Rows);
        Assert.Empty(work.GetShiftRemarks(sectionId: sectionId, allowedSectionIds: [Guid.NewGuid()]).Rows);
    }

    private static MobileFileUploadCommand File(string clientId, Guid workId) =>
        new(clientId, null, null, null, workId, null, 3, DateTimeOffset.UtcNow,
            "test.jpg", "image/jpeg", new MemoryStream([1, 2, 3]));

    private static (string Token, Guid EmployeeId) Login(IServiceProvider services)
    {
        var account = services.GetRequiredService<IMobileAccountService>().CreateAccount(new CreateMobileAccountDto(
            "Петров Иван Александрович", "selected", $"test_{Guid.NewGuid():N}"[..18], "Маршрутный обходчик",
            BindEmployee: true, RestrictToBoundDevice: false, TemporaryPassword: false,
            Password: "Patrol360!", ConfirmPassword: "Patrol360!", RequirePasswordChange: false));
        Assert.True(account.Succeeded);
        var login = services.GetRequiredService<IMobileAppService>().Login(new MobileLoginRequestDto(
            account.Account!.Login, "Patrol360!", "security-test", "Test", "Android", "test"), "127.0.0.1");
        Assert.True(login.Succeeded);
        return (login.Session!.AccessToken, account.Account.BoundEmployeeIds[0]);
    }

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Patrol360"] = connectionString,
            ["Patrol360:SeedDemoData"] = "true",
            ["Patrol360:BootstrapAdminPassword"] = "Patrol360!",
        }).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(config);
        services.AddPatrolInfrastructure(config);
        return services.BuildServiceProvider();
    }
}
