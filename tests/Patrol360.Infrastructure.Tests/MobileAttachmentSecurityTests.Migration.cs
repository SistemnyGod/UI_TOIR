using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class MobileAttachmentSecurityTests
{
    [DbIntegrationFact]
    public async Task ExistingFilesAreBackfilledOnlyWhenOwnershipCanBeProven()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        using var scope = provider.CreateScope();
        var (token, employeeId) = Login(scope.ServiceProvider);
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var sectionId = db.EmuWorkSections.First().Id;
        var work = scope.ServiceProvider.GetRequiredService<IEmuWorkService>();
        var own = work.CreateWorkSession(new EmuCreateWorkSessionDto(
            DateOnly.FromDateTime(DateTime.UtcNow), sectionId, DateTimeOffset.UtcNow,
            [employeeId], "Migrated work"), null, "test");
        Assert.True(own.Succeeded);
        var mobile = scope.ServiceProvider.GetRequiredService<IMobileAppService>();
        var valid = mobile.UploadFile(token, File(Guid.NewGuid().ToString(), own.Value!.Id));
        var unknown = mobile.UploadFile(token, File(Guid.NewGuid().ToString(), Guid.NewGuid()));
        Assert.NotNull(valid);
        Assert.NotNull(unknown);
        db.ChangeTracker.Clear();

        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
        var attachmentMigration = Array.IndexOf(applied, "20260908090000_ConfirmMobileAttachmentLinks");
        Assert.True(attachmentMigration > 0);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(applied[attachmentMigration - 1]);
        await migrator.MigrateAsync();

        var validFile = await db.MobileUploadedFiles.SingleAsync(file => file.Id == valid!.ServerFileId);
        var unknownFile = await db.MobileUploadedFiles.SingleAsync(file => file.Id == unknown!.ServerFileId);
        Assert.NotNull(validFile.LinkedAt);
        Assert.Null(unknownFile.LinkedAt);
        Assert.True(System.IO.File.Exists(Path.Combine(AppContext.BaseDirectory, "mobile-files", unknownFile.StorageFileName)));
        var quarantined = await db.Database.SqlQueryRaw<Guid>(
            "SELECT file_id AS \"Value\" FROM mobile_attachment_migration_review").ToListAsync();
        Assert.Contains(unknownFile.Id, quarantined);
        Assert.DoesNotContain(validFile.Id, quarantined);
    }
}
