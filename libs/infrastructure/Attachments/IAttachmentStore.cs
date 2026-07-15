namespace Patrol360.Infrastructure.Attachments;

public interface IAttachmentStore
{
    StagedAttachment Stage(string storageKey, ReadOnlyMemory<byte> content);

    void Commit(StagedAttachment attachment);

    void Rollback(StagedAttachment attachment);

    void Delete(string storageKey);

    string? GetLocalPath(string storageKey);

    int DeleteStaleStagedFiles(DateTimeOffset olderThan);
}

public sealed record StagedAttachment(string StorageKey, string StagingKey);
