using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Infrastructure;
using Patrol360.Infrastructure.Attachments;

namespace Patrol360.Infrastructure.Tests;

public sealed class AttachmentStoreTests : IDisposable
{
    private readonly string rootPath = Path.Combine(Path.GetTempPath(), $"patrol360-attachments-{Guid.NewGuid():N}");

    [Fact]
    public void StageCommitOpenAndDeleteFollowExpectedLifecycle()
    {
        using var provider = BuildProvider();
        var store = provider.GetRequiredService<IAttachmentStore>();
        var content = new byte[] { 1, 2, 3, 4 };

        var staged = store.Stage("result-photo.jpg", content);
        Assert.Null(store.GetLocalPath(staged.StorageKey));

        store.Commit(staged);
        var path = store.GetLocalPath(staged.StorageKey);
        Assert.NotNull(path);
        Assert.Equal(content, File.ReadAllBytes(path!));

        store.Delete(staged.StorageKey);
        Assert.Null(store.GetLocalPath(staged.StorageKey));
    }

    [Fact]
    public void RollbackRemovesStagedAndCommittedFiles()
    {
        using var provider = BuildProvider();
        var store = provider.GetRequiredService<IAttachmentStore>();

        var stagedOnly = store.Stage("staged.jpg", new byte[] { 1 });
        store.Rollback(stagedOnly);
        Assert.Null(store.GetLocalPath(stagedOnly.StorageKey));

        var committed = store.Stage("committed.jpg", new byte[] { 2 });
        store.Commit(committed);
        store.Rollback(committed);
        Assert.Null(store.GetLocalPath(committed.StorageKey));
    }

    [Fact]
    public void ReconciliationDeletesOnlyStaleStagedFiles()
    {
        using var provider = BuildProvider();
        var store = provider.GetRequiredService<IAttachmentStore>();
        var stale = store.Stage("stale.jpg", new byte[] { 1 });
        var fresh = store.Stage("fresh.jpg", new byte[] { 2 });
        var stagingDirectory = Path.Combine(rootPath, ".staging");
        File.SetLastWriteTimeUtc(Path.Combine(stagingDirectory, stale.StagingKey), DateTime.UtcNow.AddHours(-2));

        var deleted = store.DeleteStaleStagedFiles(DateTimeOffset.UtcNow.AddHours(-1));

        Assert.Equal(1, deleted);
        Assert.Throws<FileNotFoundException>(() => store.Commit(stale));
        store.Commit(fresh);
        Assert.NotNull(store.GetLocalPath(fresh.StorageKey));
    }

    [Fact]
    public void StorageKeysCannotEscapeConfiguredRoot()
    {
        using var provider = BuildProvider();
        var store = provider.GetRequiredService<IAttachmentStore>();

        Assert.Throws<ArgumentException>(() => store.Stage("../escape.jpg", new byte[] { 1 }));
        Assert.Throws<ArgumentException>(() => store.GetLocalPath("nested/escape.jpg"));
    }

    public void Dispose()
    {
        if (Directory.Exists(rootPath))
        {
            Directory.Delete(rootPath, recursive: true);
        }
    }

    private ServiceProvider BuildProvider()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Patrol:AttachmentStoragePath"] = rootPath,
            })
            .Build();
        var services = new ServiceCollection();
        services.AddPatrolInfrastructure(configuration);
        return services.BuildServiceProvider();
    }
}
