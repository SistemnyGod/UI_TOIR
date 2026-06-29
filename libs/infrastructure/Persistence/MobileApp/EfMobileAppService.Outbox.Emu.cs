using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto ProcessCompleteWorkTask(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var taskId = ReadGuid(command.Payload, "taskId");
        var baseRevision = ReadLong(command.Payload, "baseRevision");
        var completedAtLocal = ReadDateTimeOffset(command.Payload, "completedAtLocal") ?? DateTimeOffset.UtcNow;
        var resultComment = NormalizeOptionalText(ReadString(command.Payload, "resultComment"));
        if (taskId is null || baseRevision is null || string.IsNullOrWhiteSpace(resultComment))
        {
            return Rejected(command.ClientOperationId, "completeWorkTask payload is incomplete.");
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var workSession = dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(item => item.Employees)
            .FirstOrDefault(item => item.Id == taskId.Value && item.DeletedAt == null);
        if (workSession is null || workSession.Employees.All(employee => !boundEmployeeIds.Contains(employee.EmployeeId)))
        {
            return Conflict(command.ClientOperationId, "Work task does not belong to this mobile account.");
        }

        if (baseRevision.Value > workSession.RowVersion)
        {
            return Conflict(command.ClientOperationId, "Work task was changed after mobile sync.");
        }

        var employeeIds = workSession.Employees
            .Where(employee => boundEmployeeIds.Contains(employee.EmployeeId) && employee.FinishedAt is null)
            .Select(employee => employee.EmployeeId)
            .ToArray();
        if (employeeIds.Length == 0)
        {
            return Conflict(command.ClientOperationId, "Work task has no active linked employees.");
        }

        var result = emuWorkService.CompleteWorkSession(
            taskId.Value,
            new EmuCompleteWorkSessionDto(
                employeeIds,
                completedAtLocal,
                MobileEmuDoneStatus,
                resultComment,
                null,
                workSession.RowVersion),
            null,
            $"mobile:{account.Login}");

        if (!result.Succeeded || result.Value is null)
        {
            var message = string.Join("; ", result.Errors.SelectMany(item => item.Value));
            return result.Errors.ContainsKey("rowVersion")
                ? Conflict(command.ClientOperationId, message)
                : Rejected(command.ClientOperationId, string.IsNullOrWhiteSpace(message) ? "Work task completion was rejected." : message);
        }

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            result.Value.Id.ToString(),
            result.Value.RowVersion,
            "Work task completed.",
            null,
            null);
    }

    private MobileOutboxResponseDto ProcessCreateWorkTask(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var taskId = ReadGuid(command.Payload, "taskId") ?? ReadGuid(command.Payload, "workTaskId");
        var sectionId = ReadGuid(command.Payload, "sectionId");
        var employeeId = ReadGuid(command.Payload, "employeeId");
        var taskDescription = NormalizeOptionalText(ReadString(command.Payload, "taskDescription"));
        var createdAtLocal = ReadDateTimeOffset(command.Payload, "createdAtLocal") ?? DateTimeOffset.UtcNow;
        if (taskId is null || sectionId is null || employeeId is null || string.IsNullOrWhiteSpace(taskDescription))
        {
            return Rejected(command.ClientOperationId, "createWorkTask payload is incomplete.");
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (!boundEmployeeIds.Contains(employeeId.Value))
        {
            return Conflict(command.ClientOperationId, "Employee does not belong to this mobile account.");
        }

        if (!dbContext.EmuWorkSections.AsNoTracking().Any(section => section.Id == sectionId.Value && section.IsActive))
        {
            return Rejected(command.ClientOperationId, "Work section is not active.");
        }

        var result = emuWorkService.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                DateOnly.FromDateTime(createdAtLocal.LocalDateTime),
                sectionId.Value,
                createdAtLocal,
                [employeeId.Value],
                taskDescription,
                ClientWorkSessionId: taskId.Value),
            null,
            $"mobile:{account.Login}",
            canOverridePlanApproval: true);

        return MapEmuOutboxResult(command.ClientOperationId, result, "Work task created.");
    }

    private MobileOutboxResponseDto ProcessUpdateWorkTask(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var validation = ValidateMobileWorkTask(account, command.ClientOperationId, command.Payload);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var sectionId = ReadGuid(command.Payload, "sectionId");
        var taskDescription = NormalizeOptionalText(ReadString(command.Payload, "taskDescription"));
        var baseRevision = ReadLong(command.Payload, "baseRevision");
        if (sectionId is null || string.IsNullOrWhiteSpace(taskDescription) || baseRevision is null)
        {
            return Rejected(command.ClientOperationId, "updateWorkTask payload is incomplete.");
        }

        var workSession = validation.WorkSession!;
        var result = emuWorkService.UpdateWorkSession(
            workSession.Id,
            new EmuUpdateWorkSessionDto(
                sectionId.Value,
                taskDescription,
                (int)baseRevision.Value,
                "Mobile update",
                EmployeeIds: validation.EmployeeIds),
            null,
            $"mobile:{account.Login}");

        return MapEmuOutboxResult(command.ClientOperationId, result, "Work task updated.");
    }

    private MobileOutboxResponseDto ProcessPauseWorkTask(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var validation = ValidateMobileWorkTask(account, command.ClientOperationId, command.Payload);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var waitReason = dbContext.EmuWaitReasons
            .AsNoTracking()
            .Where(reason => reason.IsActive)
            .OrderByDescending(reason => reason.Code == "prochee")
            .ThenBy(reason => reason.SortOrder)
            .ThenBy(reason => reason.Name)
            .FirstOrDefault();
        if (waitReason is null)
        {
            return Rejected(command.ClientOperationId, "Default wait reason is not configured.");
        }

        var pausedAtLocal = ReadDateTimeOffset(command.Payload, "pausedAtLocal") ?? DateTimeOffset.UtcNow;
        var comment = NormalizeOptionalText(ReadString(command.Payload, "comment"), "Mobile pause");
        var result = emuWorkService.PauseWorkSession(
            validation.WorkSession!.Id,
            new EmuPauseWorkSessionDto(
                validation.EmployeeIds,
                waitReason.Id,
                pausedAtLocal,
                comment,
                MarkAsOtherWork: false,
                validation.WorkSession.RowVersion),
            null,
            $"mobile:{account.Login}");

        return MapEmuOutboxResult(command.ClientOperationId, result, "Work task paused.");
    }

    private MobileOutboxResponseDto ProcessResumeWorkTask(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var validation = ValidateMobileWorkTask(account, command.ClientOperationId, command.Payload);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var resumedAtLocal = ReadDateTimeOffset(command.Payload, "resumedAtLocal") ?? DateTimeOffset.UtcNow;
        var comment = NormalizeOptionalText(ReadString(command.Payload, "comment"), "Mobile resume");
        var result = emuWorkService.ResumeWorkSession(
            validation.WorkSession!.Id,
            new EmuResumeWorkSessionDto(
                validation.EmployeeIds,
                resumedAtLocal,
                comment,
                validation.WorkSession.RowVersion),
            null,
            $"mobile:{account.Login}");

        return MapEmuOutboxResult(command.ClientOperationId, result, "Work task resumed.");
    }

    private MobileOutboxResponseDto ProcessCreateShiftRemark(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var title = NormalizeOptionalText(ReadString(command.Payload, "title"));
        var comment = NormalizeOptionalText(ReadString(command.Payload, "comment"));
        var remarkId = NormalizeOptionalText(ReadString(command.Payload, "remarkId"), NormalizeOptionalText(command.EntityLocalId));
        var sectionId = ReadGuid(command.Payload, "sectionId");
        var employeeId = ReadGuid(command.Payload, "employeeId");
        var createdAtLocal = ReadDateTimeOffset(command.Payload, "createdAtLocal") ?? DateTimeOffset.UtcNow;
        var mediaClientFileIds = ReadStringList(command.Payload, "mediaClientFileIds");
        if (sectionId is null || employeeId is null || string.IsNullOrWhiteSpace(comment))
        {
            return Rejected(command.ClientOperationId, "Shift remark payload is incomplete.");
        }

        if (!boundEmployeeIds.Contains(employeeId.Value))
        {
            return Conflict(command.ClientOperationId, "Employee does not belong to this mobile account.");
        }

        if (!dbContext.EmuWorkSections.AsNoTracking().Any(section => section.Id == sectionId.Value && section.IsActive))
        {
            return Rejected(command.ClientOperationId, "Work section is not active.");
        }

        foreach (var clientFileId in mediaClientFileIds)
        {
            var uploaded = dbContext.MobileUploadedFiles.Any(file =>
                file.MobileAccountId == account.Id
                && file.RemarkId == remarkId
                && file.ClientFileId == clientFileId);
            if (!uploaded)
            {
                return Rejected(command.ClientOperationId, "All attached remark media files must be uploaded before remark sync.");
            }
        }

        var parsedRemarkId = Guid.TryParse(remarkId, out var parsed) ? parsed : Guid.NewGuid();
        if (!dbContext.MobileShiftRemarks.Any(item => item.Id == parsedRemarkId))
        {
            dbContext.MobileShiftRemarks.Add(new MobileShiftRemarkEntity
            {
                Id = parsedRemarkId,
                MobileAccountId = account.Id,
                EmployeeId = employeeId.Value,
                SectionId = sectionId.Value,
                Title = string.IsNullOrWhiteSpace(title) ? "Замечание по смене" : title,
                Comment = comment,
                MediaClientFileIdsJson = JsonSerializer.Serialize(mediaClientFileIds, JsonOptions),
                CreatedAtLocal = createdAtLocal,
                CreatedAtServer = DateTimeOffset.UtcNow,
                Status = "accepted"
            });
        }

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            parsedRemarkId.ToString(),
            null,
            "Shift remark accepted.",
            null,
            null);
    }

    private MobileOutboxResponseDto ProcessAttachShiftRemarkMedia(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        if (GetBoundEmployeeIds(account).Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var remarkId = NormalizeOptionalText(ReadString(command.Payload, "remarkId"), NormalizeOptionalText(command.EntityLocalId));
        var mediaClientFileIds = ReadStringList(command.Payload, "mediaClientFileIds");
        if (string.IsNullOrWhiteSpace(remarkId) || mediaClientFileIds.Count == 0)
        {
            return Rejected(command.ClientOperationId, "Shift remark media payload is incomplete.");
        }

        foreach (var clientFileId in mediaClientFileIds)
        {
            var uploaded = dbContext.MobileUploadedFiles.Any(file =>
                file.MobileAccountId == account.Id
                && file.RemarkId == remarkId
                && file.ClientFileId == clientFileId);
            if (!uploaded)
            {
                return Rejected(command.ClientOperationId, "Attached remark media file was not uploaded.");
            }
        }

        if (!Guid.TryParse(remarkId, out var parsedRemarkId))
        {
            return Rejected(command.ClientOperationId, "Shift remark id is invalid.");
        }

        var remark = dbContext.MobileShiftRemarks.FirstOrDefault(item =>
            item.Id == parsedRemarkId
            && item.MobileAccountId == account.Id);
        if (remark is null)
        {
            return Conflict(command.ClientOperationId, "Shift remark is not available.");
        }

        var nextFileIds = ReadStringListFromJson(remark.MediaClientFileIdsJson)
            .Concat(mediaClientFileIds)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        remark.MediaClientFileIdsJson = JsonSerializer.Serialize(nextFileIds, JsonOptions);

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            parsedRemarkId.ToString(),
            null,
            "Shift remark media accepted.",
            null,
            null);
    }

    private MobileWorkTaskValidation ValidateMobileWorkTask(
        MobileAccountEntity account,
        string clientOperationId,
        Dictionary<string, object?> payload)
    {
        var taskId = ReadGuid(payload, "taskId");
        if (taskId is null)
        {
            return MobileWorkTaskValidation.Fail(Rejected(clientOperationId, "Work task payload is incomplete."));
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var workSession = dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(item => item.Employees)
            .FirstOrDefault(item => item.Id == taskId.Value && item.DeletedAt == null);
        if (workSession is null || workSession.Employees.All(employee => !boundEmployeeIds.Contains(employee.EmployeeId)))
        {
            return MobileWorkTaskValidation.Fail(Conflict(clientOperationId, "Work task does not belong to this mobile account."));
        }

        var employeeIds = workSession.Employees
            .Where(employee => boundEmployeeIds.Contains(employee.EmployeeId) && employee.FinishedAt is null)
            .Select(employee => employee.EmployeeId)
            .ToArray();
        if (employeeIds.Length == 0)
        {
            return MobileWorkTaskValidation.Fail(Conflict(clientOperationId, "Work task has no active linked employees."));
        }

        return new MobileWorkTaskValidation(true, workSession, employeeIds, null);
    }

    private static MobileOutboxResponseDto MapEmuOutboxResult(
        string clientOperationId,
        EmuCommandResult<EmuWorkSessionDto> result,
        string acceptedMessage)
    {
        if (!result.Succeeded || result.Value is null)
        {
            var message = string.Join("; ", result.Errors.SelectMany(item => item.Value));
            return result.Errors.ContainsKey("rowVersion")
                ? Conflict(clientOperationId, message)
                : Rejected(clientOperationId, string.IsNullOrWhiteSpace(message) ? "Work task command was rejected." : message);
        }

        return new MobileOutboxResponseDto(
            clientOperationId,
            "accepted",
            result.Value.Id.ToString(),
            result.Value.RowVersion,
            acceptedMessage,
            null,
            null);
    }
}
