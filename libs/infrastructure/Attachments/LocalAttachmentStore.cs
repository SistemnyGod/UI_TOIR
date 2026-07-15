using Microsoft.Extensions.Configuration;

namespace Patrol360.Infrastructure.Attachments;

internal sealed class LocalAttachmentStore : IAttachmentStore
{
    private readonly string rootPath;
    private readonly string stagingPath;

    public LocalAttachmentStore(IConfiguration configuration)
    {
        rootPath = Path.GetFullPath(configuration["Patrol:AttachmentStoragePath"]
            ?? Path.Combine(AppContext.BaseDirectory, "mobile-files"));
        stagingPath = Path.Combine(rootPath, ".staging");
        Directory.CreateDirectory(rootPath);
        Directory.CreateDirectory(stagingPath);
    }

    public StagedAttachment Stage(string storageKey, ReadOnlyMemory<byte> content)
    {
        var safeKey = ValidateStorageKey(storageKey);
        var stagingKey = $"{Guid.NewGuid():N}.tmp";
        File.WriteAllBytes(Path.Combine(stagingPath, stagingKey), content.ToArray());
        return new StagedAttachment(safeKey, stagingKey);
    }

    public void Commit(StagedAttachment attachment)
    {
        var destination = ResolvePath(attachment.StorageKey);
        var source = ResolveStagingPath(attachment.StagingKey);
        File.Move(source, destination, overwrite: false);
    }

    public void Rollback(StagedAttachment attachment)
    {
        var stagingFile = ResolveStagingPath(attachment.StagingKey);
        if (File.Exists(stagingFile))
        {
            TryDelete(stagingFile);
            return;
        }

        Delete(attachment.StorageKey);
    }

    public void Delete(string storageKey) => TryDelete(ResolvePath(storageKey));

    public string? GetLocalPath(string storageKey)
    {
        var path = ResolvePath(storageKey);
        if (File.Exists(path))
        {
            return path;
        }

        // Mobile uploads predate configurable attachment storage and remain readable
        // while that writer is migrated to this abstraction.
        var legacyPath = Path.Combine(AppContext.BaseDirectory, "mobile-files", ValidateStorageKey(storageKey));
        return File.Exists(legacyPath) ? legacyPath : null;
    }

    public int DeleteStaleStagedFiles(DateTimeOffset olderThan)
    {
        if (!Directory.Exists(stagingPath))
        {
            return 0;
        }

        var deleted = 0;
        foreach (var path in Directory.EnumerateFiles(stagingPath, "*.tmp", SearchOption.TopDirectoryOnly))
        {
            if (File.GetLastWriteTimeUtc(path) >= olderThan.UtcDateTime)
            {
                continue;
            }

            File.Delete(path);
            deleted++;
        }

        return deleted;
    }

    private string ResolvePath(string storageKey) => Path.Combine(rootPath, ValidateStorageKey(storageKey));

    private string ResolveStagingPath(string stagingKey) => Path.Combine(stagingPath, ValidateStorageKey(stagingKey));

    private static string ValidateStorageKey(string storageKey)
    {
        var safeKey = Path.GetFileName(storageKey);
        if (string.IsNullOrWhiteSpace(safeKey) || !string.Equals(safeKey, storageKey, StringComparison.Ordinal))
        {
            throw new ArgumentException("Attachment storage key must be a non-empty file name.", nameof(storageKey));
        }

        return safeKey;
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // Reconciliation can retry cleanup after transient file-system failures.
        }
        catch (UnauthorizedAccessException)
        {
            // Reconciliation can retry cleanup after transient file-system failures.
        }
    }
}
