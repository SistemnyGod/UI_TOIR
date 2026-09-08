using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    // Uploads precede outbox commands, including offline create/join. Only an
    // accepted command may turn the account's staged upload into public media.
    private void ConfirmOutboxAttachments(MobileAccountEntity account, MobileOutboxCommandDto command,
        MobileOutboxResponseDto response)
    {
        if (!Guid.TryParse(response.ServerEntityId, out var entityId))
        {
            return;
        }

        var type = command.CommandType.ToLowerInvariant();
        if (type is "createshiftremark" or "attachshiftremarkmedia")
        {
            var remark = dbContext.MobileShiftRemarks.AsNoTracking()
                .SingleOrDefault(row => row.Id == entityId && row.MobileAccountId == account.Id);
            if (remark is null)
            {
                return;
            }

            var declaredIds = System.Text.Json.JsonSerializer.Deserialize<string[]>(remark.MediaClientFileIdsJson) ?? [];
            var mediaIds = ReadStringList(command.Payload, "mediaClientFileIds").Intersect(declaredIds).ToArray();
            var remarkId = NormalizeRemarkFileId(NormalizeOptionalText(ReadString(command.Payload, "remarkId"),
                NormalizeOptionalText(command.EntityLocalId)));
            foreach (var file in dbContext.MobileUploadedFiles.Where(file => file.MobileAccountId == account.Id
                && file.RemarkId == remarkId && mediaIds.Contains(file.ClientFileId) && file.LinkedAt == null))
            {
                file.LinkedAt = DateTimeOffset.UtcNow;
            }

            return;
        }

        if (type is not ("createworktask" or "updateworktask" or "pauseworktask" or "resumeworktask"
            or "completeworktask" or "startplannedwork" or "joinworktask" or "replaceworktaskparticipant"))
        {
            return;
        }

        var employeeIds = GetBoundEmployeeIds(account).ToArray();
        if (!dbContext.EmuWorkSessions.Any(work => work.Id == entityId && work.DeletedAt == null
            && work.Employees.Any(employee => employeeIds.Contains(employee.EmployeeId))))
        {
            return;
        }

        foreach (var file in dbContext.MobileUploadedFiles.Where(file => file.MobileAccountId == account.Id
            && file.WorkTaskId == entityId && file.LinkedAt == null))
        {
            file.LinkedAt = DateTimeOffset.UtcNow;
        }
    }
}
