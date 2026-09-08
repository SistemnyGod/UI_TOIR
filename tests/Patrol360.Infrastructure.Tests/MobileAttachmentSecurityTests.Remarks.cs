using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class MobileAttachmentSecurityTests
{
    [DbIntegrationFact]
    public async Task RemarkIdCollisionIsRejectedAndOfflineRemarkMediaIsLinked()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        using var scope = provider.CreateScope();
        var (token, employeeId) = Login(scope.ServiceProvider);
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var mobile = scope.ServiceProvider.GetRequiredService<IMobileAppService>();
        var work = scope.ServiceProvider.GetRequiredService<IEmuWorkService>();
        var other = new MobileAccountEntity { Id = Guid.NewGuid(), Login = "other", CreatedAt = DateTimeOffset.UtcNow };
        db.MobileAccounts.Add(other);
        var sectionId = db.EmuWorkSections.First().Id;
        var foreignRemark = new MobileShiftRemarkEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = other.Id,
            EmployeeId = employeeId,
            SectionId = sectionId,
            CreatedAtLocal = DateTimeOffset.UtcNow,
            CreatedAtServer = DateTimeOffset.UtcNow,
        };
        db.MobileShiftRemarks.Add(foreignRemark);
        db.SaveChanges();
        MobileOutboxCommandDto Command(Guid id, string[] media) => new(
            Guid.NewGuid().ToString(), "createShiftRemark", "shiftRemark", id.ToString(), null,
            new()
            {
                ["remarkId"] = id.ToString(),
                ["employeeId"] = employeeId.ToString(),
                ["sectionId"] = sectionId.ToString(),
                ["title"] = "Offline remark",
                ["comment"] = "Observed defect",
                ["mediaClientFileIds"] = media
            },
            DateTimeOffset.UtcNow, 0, "pending");

        Assert.Equal("conflict", Assert.Single(mobile.SaveOutbox(token, new([Command(foreignRemark.Id, [])]))).Status);
        var remarkId = Guid.NewGuid();
        var clientId = Guid.NewGuid().ToString();
        var upload = mobile.UploadFile(token, new(clientId, null, null, remarkId.ToString(), null, null,
            3, DateTimeOffset.UtcNow, "remark.jpg", "image/jpeg", new MemoryStream([1, 2, 3])));
        Assert.NotNull(upload);
        var command = Command(remarkId, [clientId]);
        Assert.Equal("accepted", Assert.Single(mobile.SaveOutbox(token, new([command]))).Status);
        Assert.Single(work.GetShiftRemark(remarkId).Value!.Attachments);
        Assert.NotNull(work.GetShiftRemarkAttachmentFile(remarkId, upload!.ServerFileId));
        mobile.SaveOutbox(token, new([command]));
        Assert.Single(work.GetShiftRemark(remarkId).Value!.Attachments);
    }
}
