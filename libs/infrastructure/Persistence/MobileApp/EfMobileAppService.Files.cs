using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobileOutboxResponseDto? GetOutboxResult(string accessToken, string clientOperationId)
    {
        var session = FindActiveSession(accessToken);
        if (session is null || string.IsNullOrWhiteSpace(clientOperationId))
        {
            return null;
        }

        TouchSession(session);
        var operation = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .FirstOrDefault(item => item.MobileAccountId == session.MobileAccountId
                && item.ClientOperationId == clientOperationId);

        return operation is null
            ? null
            : JsonSerializer.Deserialize<MobileOutboxResponseDto>(operation.ResponseJson, JsonOptions);
    }

    public MobileFileUploadResponseDto? UploadFile(string accessToken, MobileFileUploadCommand command)
        => UploadFileAsync(accessToken, command).GetAwaiter().GetResult();

    public async Task<MobileFileUploadResponseDto?> UploadFileAsync(
        string accessToken,
        MobileFileUploadCommand command,
        CancellationToken cancellationToken = default)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        TouchSession(session);
        var clientFileId = NormalizeOptionalText(command.ClientFileId);
        var normalizedContentType = NormalizeMobileContentType(command.ContentType);
        var maxBytes = normalizedContentType == "video/mp4" ? MaxMobileVideoBytes : MaxMobilePhotoBytes;
        if (string.IsNullOrWhiteSpace(clientFileId)
            || command.SizeBytes <= 0
            || command.SizeBytes > maxBytes
            || string.IsNullOrWhiteSpace(normalizedContentType))
        {
            return null;
        }

        var existing = await dbContext.MobileUploadedFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(file => file.MobileAccountId == session.MobileAccountId
                && file.ClientFileId == clientFileId, cancellationToken);
        if (existing is not null)
        {
            return new MobileFileUploadResponseDto(existing.ClientFileId, existing.Id, "duplicate", existing.UploadedAt);
        }

        var remarkId = NormalizeOptionalText(command.RemarkId);
        var isPatrolPointFile = command.AssignmentId is not null && command.PointId is not null;
        var isRemarkFile = !string.IsNullOrWhiteSpace(remarkId);
        if (!isPatrolPointFile && !isRemarkFile)
        {
            return null;
        }

        if (isPatrolPointFile)
        {
            var validation = ValidateAssignmentPoint(
                session.MobileAccount,
                clientFileId,
                command.AssignmentId!.Value,
                command.PointId!.Value);
            if (!validation.Succeeded)
            {
                return null;
            }
        }

        var uploadedAt = DateTimeOffset.UtcNow;
        var serverFileId = Guid.NewGuid();
        var extension = normalizedContentType == "video/mp4" ? "mp4" : "jpg";
        var storageFileName = $"{serverFileId:N}.{extension}";
        var storageDirectory = Path.Combine(AppContext.BaseDirectory, "mobile-files");
        var storagePath = Path.Combine(storageDirectory, storageFileName);
        var temporaryStoragePath = Path.Combine(storageDirectory, $".{serverFileId:N}.uploading");
        Directory.CreateDirectory(storageDirectory);
        var uploadResult = await TryWriteUploadedFileAsync(command.Content, temporaryStoragePath, maxBytes, cancellationToken);
        if (uploadResult is null)
        {
            TryDeleteFile(temporaryStoragePath);
            return null;
        }

        var expectedSha256 = NormalizeOptionalText(command.Sha256);
        if (uploadResult.SizeBytes != command.SizeBytes
            || (!string.IsNullOrWhiteSpace(expectedSha256)
                && !uploadResult.Sha256.Equals(expectedSha256, StringComparison.OrdinalIgnoreCase)))
        {
            TryDeleteFile(temporaryStoragePath);
            return null;
        }

        try
        {
            File.Move(temporaryStoragePath, storagePath);
        }
        catch
        {
            TryDeleteFile(temporaryStoragePath);
            throw;
        }

        var entity = new MobileUploadedFileEntity
        {
            Id = serverFileId,
            MobileAccountId = session.MobileAccountId,
            ClientFileId = clientFileId,
            AssignmentId = command.AssignmentId,
            PointId = command.PointId,
            RemarkId = isRemarkFile ? remarkId : null,
            StorageFileName = storageFileName,
            OriginalFileName = NormalizeOptionalText(command.FileName, $"{clientFileId}.{extension}"),
            ContentType = normalizedContentType,
            Sha256 = uploadResult.Sha256,
            SizeBytes = uploadResult.SizeBytes,
            CapturedAtLocal = command.CapturedAtLocal.ToUniversalTime(),
            UploadedAt = uploadedAt,
        };
        try
        {
            dbContext.MobileUploadedFiles.Add(entity);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueFileConstraintViolation(exception))
        {
            TryDeleteFile(storagePath);
            dbContext.ChangeTracker.Clear();
            var racedUpload = await dbContext.MobileUploadedFiles
                .AsNoTracking()
                .FirstOrDefaultAsync(file => file.MobileAccountId == session.MobileAccountId
                    && file.ClientFileId == clientFileId, cancellationToken);
            if (racedUpload is not null)
            {
                return new MobileFileUploadResponseDto(
                    racedUpload.ClientFileId,
                    racedUpload.Id,
                    "duplicate",
                    racedUpload.UploadedAt);
            }

            throw;
        }
        catch
        {
            TryDeleteFile(storagePath);
            throw;
        }

        return new MobileFileUploadResponseDto(clientFileId, serverFileId, "uploaded", uploadedAt);
    }

    private static async Task<MobileUploadedFileWriteResult?> TryWriteUploadedFileAsync(
        Stream content,
        string storagePath,
        long maxBytes,
        CancellationToken cancellationToken)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        await using var output = File.Create(storagePath);
        var buffer = new byte[81920];
        long totalBytes = 0;
        int read;
        while ((read = await content.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
        {
            totalBytes += read;
            if (totalBytes > maxBytes)
            {
                return null;
            }

            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            hash.AppendData(buffer, 0, read);
        }

        var sha256 = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        return new MobileUploadedFileWriteResult(totalBytes, sha256);
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // The original database error is more important than cleanup failure here.
        }
    }

    private static bool IsUniqueFileConstraintViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private sealed record MobileUploadedFileWriteResult(long SizeBytes, string Sha256);
}
