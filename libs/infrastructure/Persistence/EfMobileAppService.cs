using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfMobileAppService(Patrol360DbContext dbContext, IEmuWorkService emuWorkService) : IMobileAppService
{
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromHours(8);
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(14);
    private const long MaxMobilePhotoBytes = 6 * 1024 * 1024;
    private const long MaxMobileVideoBytes = 30 * 1024 * 1024;
    private const string MobileEmuDoneStatus = "Завершил";
    private static readonly PasswordHasher<MobileAccountEntity> PasswordHasher = new();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string[] PilotRouteNames = ["Обход печей", "Помол"];

    public MobileAuthResult Login(MobileLoginRequestDto request, string ipAddress)
    {
        var errors = ValidateLoginRequest(request);
        if (errors.Count > 0)
        {
            return new MobileAuthResult(null, false, errors);
        }

        var login = NormalizeLogin(request.Login);
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Login == login);

        if (account is null)
        {
            return UnauthorizedResult();
        }

        var verification = PasswordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return UnauthorizedResult();
        }

        if (!IsActiveStatus(account.Status))
        {
            return UnauthorizedResult();
        }

        if (GetBoundEmployeeIds(account).Count == 0)
        {
            return new MobileAuthResult(null, false, new Dictionary<string, string[]>
            {
                ["account"] = ["Мобильный аккаунт не привязан к сотруднику. Привяжите сотрудника в web-панели и повторите вход."],
            });
        }

        var sessionBundle = CreateSession(account, request.DeviceId, request.DeviceName, request.Platform, request.AppVersion, ipAddress);
        var session = sessionBundle.Session;
        account.Session = "Онлайн";
        account.LastSeenAt = session.CreatedAt;
        account.Device = request.DeviceName;
        account.Version = request.AppVersion;

        dbContext.SaveChanges();

        return new MobileAuthResult(MapAuthSession(account, session, sessionBundle.AccessToken, sessionBundle.RefreshToken), false, EmptyErrors());
    }

    public MobileAuthResult Refresh(MobileRefreshRequestDto request, string ipAddress)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken) || string.IsNullOrWhiteSpace(request.DeviceId))
        {
            return new MobileAuthResult(null, false, new Dictionary<string, string[]>
            {
                ["refreshToken"] = ["Refresh token is required."],
            });
        }

        var tokenHash = EfAuthSessionService.HashToken(request.RefreshToken);
        var now = DateTimeOffset.UtcNow;
        var oldSession = dbContext.MobileAccountSessions
            .Include(item => item.MobileAccount)
                .ThenInclude(account => account!.EmployeeBindings)
            .FirstOrDefault(item => item.RefreshTokenHash == tokenHash);

        if (oldSession is null
            || oldSession.RevokedAt is not null
            || oldSession.RefreshExpiresAt <= now
            || !string.Equals(oldSession.DeviceId, request.DeviceId, StringComparison.Ordinal)
            || oldSession.MobileAccount is null
            || !CanUseMobileApp(oldSession.MobileAccount))
        {
            return UnauthorizedResult();
        }

        oldSession.RevokedAt = now;
        oldSession.Status = "Завершена";

        var sessionBundle = CreateSession(
            oldSession.MobileAccount,
            oldSession.DeviceId,
            oldSession.Device,
            oldSession.Platform,
            oldSession.AppVersion,
            ipAddress);
        var session = sessionBundle.Session;
        oldSession.MobileAccount.Session = "Онлайн";
        oldSession.MobileAccount.LastSeenAt = now;

        dbContext.SaveChanges();

        return new MobileAuthResult(MapAuthSession(oldSession.MobileAccount, session, sessionBundle.AccessToken, sessionBundle.RefreshToken), false, EmptyErrors());
    }

    public bool Logout(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session is null)
        {
            return false;
        }

        session.RevokedAt = DateTimeOffset.UtcNow;
        session.PushTokenRevokedAt = DateTimeOffset.UtcNow;
        session.Status = "Завершена";
        dbContext.SaveChanges();
        return true;
    }

    public MobileBootstrapDto? GetBootstrap(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        TouchSession(session);
        var account = session.MobileAccount;
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return null;
        }

        var requestBoard = BuildRequestBoard(boundEmployeeIds);
        var assignments = BuildAssignments(boundEmployeeIds);
        var routeIds = requestBoard.Select(item => item.RouteId)
            .Concat(assignments.Select(item => item.RouteId))
            .ToHashSet();

        var routes = dbContext.Routes
            .AsNoTracking()
            .Include(route => route.Points)
            .Where(route => !route.IsArchived)
            .AsEnumerable()
            .Where(route => routeIds.Contains(route.Id) || PilotRouteNames.Contains(route.Name, StringComparer.OrdinalIgnoreCase))
            .OrderBy(route => route.Name)
            .ToList();

        var routeDtos = routes
            .Select(route => new MobilePatrolRouteDto(
                route.Id,
                route.Name,
                route.VersionNo,
                AllowFreeOrder: true,
                NfcEnabled: true,
                QrFallbackEnabled: true))
            .ToArray();

        var pointDtos = routes
            .SelectMany(route => route.Points
                .OrderBy(point => point.SequenceNo)
                .Select(point => new MobilePatrolPointDto(
                    point.Id,
                    route.Id,
                    point.Name,
                    point.SequenceNo,
                    point.NfcCode,
                    string.IsNullOrWhiteSpace(point.Tag) ? null : point.Tag,
                    point.IsRequired,
                    route.VersionNo)))
            .ToArray();

        dbContext.SaveChanges();

        return new MobileBootstrapDto(
            MapUser(account),
            MapDevice(account, session),
            requestBoard,
            assignments,
            routeDtos,
            pointDtos,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
    }

    public MobileDeviceRegistrationDto? RegisterPushToken(string accessToken, MobilePushTokenRegistrationDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(request.DeviceId)
            || string.IsNullOrWhiteSpace(request.PushToken)
            || !string.Equals(session.DeviceId, request.DeviceId, StringComparison.Ordinal))
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        session.PushToken = NormalizeOptionalText(request.PushToken);
        session.PushTokenRegisteredAt = now;
        session.PushTokenRevokedAt = null;
        var normalizedPushToken = session.PushToken;
        foreach (var notification in dbContext.MobileNotifications
            .Where(notification => notification.MobileAccountId == session.MobileAccountId)
            .Where(notification => notification.PushStatus == "waitingSync"))
        {
            notification.PushStatus = "queued";
            notification.PushTokenSnapshot = normalizedPushToken;
            notification.PushLastError = string.Empty;
        }

        TouchSession(session);
        dbContext.SaveChanges();

        return new MobileDeviceRegistrationDto(session.DeviceId, PushEnabled: true, now);
    }

    public IReadOnlyList<MobileNotificationDto> GetNotifications(string accessToken, bool unreadOnly)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var query = dbContext.MobileNotifications
            .AsNoTracking()
            .Where(notification => notification.MobileAccountId == session.MobileAccountId);
        if (unreadOnly)
        {
            query = query.Where(notification => notification.ReadAt == null);
        }

        var notifications = query
            .OrderByDescending(notification => notification.CreatedAt)
            .Take(50)
            .AsEnumerable()
            .Select(MapNotification)
            .ToList();

        dbContext.SaveChanges();
        return notifications;
    }

    public MobileNotificationDto? MarkNotificationRead(string accessToken, Guid notificationId)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        var notification = dbContext.MobileNotifications
            .FirstOrDefault(item => item.Id == notificationId && item.MobileAccountId == session.MobileAccountId);
        if (notification is null)
        {
            return null;
        }

        notification.ReadAt ??= DateTimeOffset.UtcNow;
        TouchSession(session);
        dbContext.SaveChanges();

        return MapNotification(notification);
    }

    public IReadOnlyList<MobileWorkTaskDto> GetWorkTasks(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount).ToArray();
        var tasks = BuildWorkTasks(boundEmployeeIds)
            .OrderByDescending(task => task.PlannedAt ?? DateTimeOffset.MinValue)
            .Take(100)
            .ToArray();

        dbContext.SaveChanges();
        return tasks;
    }

    public MobileWorkTaskDto? GetWorkTask(string accessToken, Guid taskId)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount).ToArray();
        var task = BuildWorkTasks(boundEmployeeIds)
            .FirstOrDefault(item => item.TaskId == taskId);

        dbContext.SaveChanges();
        return task;
    }

    public IReadOnlyList<MobileOutboxResponseDto> SaveOutbox(string accessToken, MobileOutboxBatchDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var responses = new List<MobileOutboxResponseDto>();
        foreach (var command in request.Commands)
        {
            if (string.IsNullOrWhiteSpace(command.ClientOperationId))
            {
                responses.Add(new MobileOutboxResponseDto(
                    string.Empty,
                    "rejected",
                    null,
                    null,
                    "clientOperationId is required.",
                    null,
                    null));
                continue;
            }

            var existing = dbContext.MobileOutboxOperations
                .AsNoTracking()
                .FirstOrDefault(item => item.ClientOperationId == command.ClientOperationId);
            if (existing is not null)
            {
                responses.Add(new MobileOutboxResponseDto(
                    command.ClientOperationId,
                    "duplicate",
                    existing.EntityServerId,
                    null,
                    "Command was already accepted.",
                    null,
                    null));
                continue;
            }

            var response = command.CommandType switch
            {
                var type when type.Equals("takePatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessTakePatrolRequest(session.MobileAccount, command),
                var type when type.Equals("scanPatrolPointNfc", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointNfc(session.MobileAccount, command),
                var type when type.Equals("scanPatrolPointQr", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointQr(session.MobileAccount, command),
                var type when type.Equals("markPatrolPointOk", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(session.MobileAccount, command, isIssue: false),
                var type when type.Equals("markPatrolPointIssue", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(session.MobileAccount, command, isIssue: true),
                var type when type.Equals("completePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompletePatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("pauseWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessPauseWorkTask(session.MobileAccount, command),
                var type when type.Equals("resumeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessResumeWorkTask(session.MobileAccount, command),
                var type when type.Equals("completeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompleteWorkTask(session.MobileAccount, command),
                var type when type.Equals("createShiftRemark", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCreateShiftRemark(session.MobileAccount, command),
                var type when type.Equals("attachShiftRemarkMedia", StringComparison.OrdinalIgnoreCase) =>
                    ProcessAttachShiftRemarkMedia(session.MobileAccount, command),
                _ => new MobileOutboxResponseDto(
                    command.ClientOperationId,
                    "rejected",
                    command.EntityServerId,
                    null,
                    $"Unsupported mobile outbox command type: {command.CommandType}.",
                    null,
                    null)
            };

            dbContext.MobileOutboxOperations.Add(new MobileOutboxOperationEntity
            {
                ClientOperationId = command.ClientOperationId,
                MobileAccountId = session.MobileAccountId,
                CommandType = NormalizeOptionalText(command.CommandType),
                EntityType = NormalizeOptionalText(command.EntityType),
                EntityLocalId = NormalizeNullableText(command.EntityLocalId),
                EntityServerId = NormalizeNullableText(response.ServerEntityId ?? command.EntityServerId),
                PayloadJson = JsonSerializer.Serialize(command.Payload, JsonOptions),
                CreatedAtLocal = command.CreatedAtLocal,
                CreatedAtServer = DateTimeOffset.UtcNow,
                AttemptCount = Math.Max(0, command.AttemptCount),
                Status = response.Status,
                ResponseJson = JsonSerializer.Serialize(response, JsonOptions),
            });
            responses.Add(response);
        }

        dbContext.SaveChanges();
        return responses;
    }

    private MobileOutboxResponseDto ProcessTakePatrolRequest(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var requestId = ReadGuid(command.Payload, "requestId");
        var routeId = ReadGuid(command.Payload, "routeId");
        var requestRevision = ReadLong(command.Payload, "requestRevision");
        if (requestId is null || routeId is null || requestRevision is null)
        {
            return Rejected(command.ClientOperationId, "takePatrolRequest payload is incomplete.");
        }

        if (!Guid.TryParse(command.EntityLocalId, out var clientAssignmentId))
        {
            return Rejected(command.ClientOperationId, "takePatrolRequest entityLocalId must contain client assignment id.");
        }

        var patrolRequest = dbContext.PatrolRequests
            .Include(item => item.Assignment)
            .FirstOrDefault(item => item.Id == requestId.Value);
        if (patrolRequest is null || patrolRequest.RouteId != routeId.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request is not available on the server.");
        }

        var serverRevision = patrolRequest.CreatedAt.ToUnixTimeMilliseconds();
        if (serverRevision != requestRevision.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request was changed after mobile bootstrap.");
        }

        if (patrolRequest.EmployeeId is not null && !boundEmployeeIds.Contains(patrolRequest.EmployeeId.Value))
        {
            return Conflict(command.ClientOperationId, "Patrol request belongs to another employee.");
        }

        if (patrolRequest.Assignment is not null)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already assigned.");
        }

        if (dbContext.Assignments.Any(item => item.Id == clientAssignmentId))
        {
            return Conflict(command.ClientOperationId, "Client assignment id is already used.");
        }

        var employeeId = patrolRequest.EmployeeId ?? boundEmployeeIds.First();
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == employeeId);
        var route = dbContext.Routes.FirstOrDefault(item => item.Id == routeId.Value && !item.IsArchived);
        if (employee is null || route is null)
        {
            return Conflict(command.ClientOperationId, "Employee or route is no longer available.");
        }

        var startedAt = ReadDateTimeOffset(command.Payload, "takenAtLocal") ?? DateTimeOffset.UtcNow;
        var assignment = new AssignmentEntity
        {
            Id = clientAssignmentId,
            PatrolRequestId = patrolRequest.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            Shift = string.IsNullOrWhiteSpace(employee.Shift) ? "-" : employee.Shift,
            Status = AssignmentStatusValues.InProgress,
            PlannedAt = BuildPlannedStartAt(patrolRequest.ScheduledDate, patrolRequest.ScheduledTime),
            StartedAt = startedAt.ToUniversalTime(),
            ProgressPercent = 1,
            LockVersion = 1,
        };

        patrolRequest.EmployeeId ??= employee.Id;
        patrolRequest.EmployeeName = employee.FullName;
        patrolRequest.RouteId = route.Id;
        patrolRequest.RouteName = route.Name;
        patrolRequest.Status = AssignmentStatusValues.InProgress;
        dbContext.Assignments.Add(assignment);

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Request assigned",
            null,
            null);
    }

    private MobileOutboxResponseDto ProcessScanPatrolPointNfc(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var pointId = ReadGuid(command.Payload, "pointId");
        var nfcUidHash = ReadString(command.Payload, "nfcUidHash");
        if (assignmentId is null || pointId is null || string.IsNullOrWhiteSpace(nfcUidHash))
        {
            return Rejected(command.ClientOperationId, "scanPatrolPointNfc payload is incomplete.");
        }

        var validation = ValidateAssignmentPoint(account, command.ClientOperationId, assignmentId.Value, pointId.Value);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var expectedNfc = NormalizeOptionalText(validation.Point!.NfcCode);
        if (string.IsNullOrWhiteSpace(expectedNfc)
            || !expectedNfc.Equals(nfcUidHash.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return Rejected(command.ClientOperationId, "NFC tag does not match this patrol point.");
        }

        return AcceptedPoint(command.ClientOperationId, pointId.Value, validation.Assignment!.LockVersion, "NFC tag accepted.");
    }

    private MobileOutboxResponseDto ProcessScanPatrolPointQr(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var pointId = ReadGuid(command.Payload, "pointId");
        var qrCodeHash = ReadString(command.Payload, "qrCodeHash");
        if (assignmentId is null || pointId is null || string.IsNullOrWhiteSpace(qrCodeHash))
        {
            return Rejected(command.ClientOperationId, "scanPatrolPointQr payload is incomplete.");
        }

        var validation = ValidateAssignmentPoint(account, command.ClientOperationId, assignmentId.Value, pointId.Value);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var expectedQr = NormalizeOptionalText(validation.Point!.Tag);
        if (string.IsNullOrWhiteSpace(expectedQr)
            || !expectedQr.Equals(qrCodeHash.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return Rejected(command.ClientOperationId, "QR tag does not match this patrol point.");
        }

        return AcceptedPoint(command.ClientOperationId, pointId.Value, validation.Assignment!.LockVersion, "QR tag accepted.");
    }

    private MobileOutboxResponseDto ProcessMarkPatrolPoint(MobileAccountEntity account, MobileOutboxCommandDto command, bool isIssue)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var pointId = ReadGuid(command.Payload, "pointId");
        if (assignmentId is null || pointId is null)
        {
            return Rejected(command.ClientOperationId, "Point result payload is incomplete.");
        }

        var validation = ValidateAssignmentPoint(account, command.ClientOperationId, assignmentId.Value, pointId.Value);
        if (!validation.Succeeded)
        {
            return validation.Response!;
        }

        var comment = NormalizeOptionalText(ReadString(command.Payload, "comment"));
        if (isIssue && string.IsNullOrWhiteSpace(comment))
        {
            return Rejected(command.ClientOperationId, "Issue point result requires a comment.");
        }

        if (isIssue && string.IsNullOrWhiteSpace(ReadString(command.Payload, "issueTypeId")))
        {
            return Rejected(command.ClientOperationId, "Issue point result requires an issue type.");
        }

        return AcceptedPoint(
            command.ClientOperationId,
            pointId.Value,
            validation.Assignment!.LockVersion,
            isIssue ? "Issue point result accepted." : "Ok point result accepted.");
    }

    private MobileOutboxResponseDto ProcessCompletePatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var requestId = ReadGuid(command.Payload, "requestId");
        var completedAtLocal = ReadDateTimeOffset(command.Payload, "completedAtLocal") ?? DateTimeOffset.UtcNow;
        var pointResults = ReadPointResults(command.Payload);
        if (assignmentId is null || requestId is null || pointResults.Count == 0)
        {
            return Rejected(command.ClientOperationId, "completePatrolAssignment payload is incomplete.");
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var assignment = dbContext.Assignments
            .Include(item => item.PatrolRequest)
            .Include(item => item.Employee)
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .FirstOrDefault(item => item.Id == assignmentId.Value);
        if (assignment is null || assignment.Route is null || assignment.PatrolRequest is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.PatrolRequestId != requestId.Value || !boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return Conflict(command.ClientOperationId, "Assignment does not belong to this mobile account.");
        }

        var resultsByPoint = pointResults
            .GroupBy(result => result.PointId)
            .ToDictionary(group => group.Key, group => group.Last());
        foreach (var point in assignment.Route.Points.Where(point => point.IsRequired))
        {
            if (!resultsByPoint.TryGetValue(point.Id, out var result)
                || result.Status.Equals("deferred", StringComparison.OrdinalIgnoreCase)
                || result.Status.Equals("pending", StringComparison.OrdinalIgnoreCase))
            {
                return Rejected(command.ClientOperationId, "Required patrol points must be completed before report submit.");
            }
        }

        foreach (var result in pointResults)
        {
            if (assignment.Route.Points.All(point => point.Id != result.PointId))
            {
                return Conflict(command.ClientOperationId, "Point result does not belong to assignment route.");
            }

            if (result.Status.Equals("issue", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(result.Comment))
            {
                return Rejected(command.ClientOperationId, "Issue point result requires a comment.");
            }

            foreach (var clientFileId in result.PhotoClientFileIds)
            {
                var uploaded = dbContext.MobileUploadedFiles.Any(file =>
                    file.MobileAccountId == account.Id
                    && file.AssignmentId == assignment.Id
                    && file.PointId == result.PointId
                    && file.ClientFileId == clientFileId);
                if (!uploaded)
                {
                    return Rejected(command.ClientOperationId, "All attached photos must be uploaded before report submit.");
                }
            }
        }

        var now = DateTimeOffset.UtcNow;
        var issueResults = pointResults
            .Where(result => result.Status.Equals("issue", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        var totalPhotos = pointResults.Sum(result => result.PhotoClientFileIds.Count);
        var resultEntity = dbContext.PatrolResults
            .Include(item => item.Issues)
            .Include(item => item.Attachments)
            .FirstOrDefault(item => item.AssignmentId == assignment.Id);
        if (resultEntity is null)
        {
            resultEntity = new PatrolResultEntity
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                CreatedAt = now,
            };
            dbContext.PatrolResults.Add(resultEntity);
        }
        else
        {
            dbContext.PatrolResultIssues.RemoveRange(resultEntity.Issues);
            dbContext.PatrolResultAttachments.RemoveRange(resultEntity.Attachments);
        }

        var firstPoint = assignment.Route.Points.OrderBy(point => point.SequenceNo).FirstOrDefault();
        resultEntity.AssignmentId = assignment.Id;
        resultEntity.EmployeeId = assignment.EmployeeId;
        resultEntity.RouteId = assignment.RouteId;
        resultEntity.RoutePointId = firstPoint?.Id;
        resultEntity.Status = issueResults.Length > 0 ? "issue" : "ok";
        resultEntity.PointName = assignment.Route.Name;
        resultEntity.EmployeeName = assignment.Employee?.FullName ?? assignment.PatrolRequest.EmployeeName;
        resultEntity.RouteName = assignment.Route.Name;
        resultEntity.Territory = assignment.Route.Territory;
        resultEntity.Shift = assignment.Shift;
        resultEntity.PlannedAt = assignment.PlannedAt;
        resultEntity.ActualAt = completedAtLocal.ToUniversalTime();
        resultEntity.Deviation = FormatDeviation(assignment.PlannedAt, completedAtLocal.ToUniversalTime());
        resultEntity.Comment = BuildResultComment(pointResults, assignment.Route.Points);
        resultEntity.IssueType = issueResults.Length > 0 ? NormalizeOptionalText(issueResults[0].IssueTypeId, "issue") : "-";
        resultEntity.Severity = issueResults.Length > 0 ? "medium" : "-";
        resultEntity.Photos = totalPhotos;

        foreach (var issue in issueResults)
        {
            resultEntity.Issues.Add(new PatrolResultIssueEntity
            {
                Id = Guid.NewGuid(),
                Type = NormalizeOptionalText(issue.IssueTypeId, "issue"),
                Severity = "medium",
                Message = NormalizeOptionalText(issue.Comment),
                CreatedAt = now,
            });
        }

        var uploadedFiles = dbContext.MobileUploadedFiles
            .Where(file => file.MobileAccountId == account.Id && file.AssignmentId == assignment.Id)
            .ToArray();
        foreach (var file in uploadedFiles)
        {
            resultEntity.Attachments.Add(new PatrolResultAttachmentEntity
            {
                Id = Guid.NewGuid(),
                FileName = file.StorageFileName,
                ContentType = file.ContentType,
                SizeBytes = file.SizeBytes,
                CreatedAt = file.UploadedAt,
            });
        }

        assignment.Status = AssignmentStatusValues.Completed;
        assignment.FinishedAt = completedAtLocal.ToUniversalTime();
        assignment.ProgressPercent = 100;
        assignment.LockVersion += 1;
        assignment.PatrolRequest.Status = AssignmentStatusValues.Completed;

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Patrol assignment completed.",
            null,
            null);
    }

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
        if (GetBoundEmployeeIds(account).Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var title = NormalizeOptionalText(ReadString(command.Payload, "title"));
        var comment = NormalizeOptionalText(ReadString(command.Payload, "comment"));
        var remarkId = NormalizeOptionalText(ReadString(command.Payload, "remarkId"), NormalizeOptionalText(command.EntityLocalId));
        var mediaClientFileIds = ReadStringList(command.Payload, "mediaClientFileIds");
        if (string.IsNullOrWhiteSpace(title) && string.IsNullOrWhiteSpace(comment))
        {
            return Rejected(command.ClientOperationId, "Shift remark requires title or comment.");
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

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            Guid.TryParse(remarkId, out var parsedRemarkId) ? parsedRemarkId.ToString() : Guid.NewGuid().ToString(),
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

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            Guid.TryParse(remarkId, out var parsedRemarkId) ? parsedRemarkId.ToString() : remarkId,
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

    private AssignmentPointValidation ValidateAssignmentPoint(MobileAccountEntity account, string clientOperationId, Guid assignmentId, Guid pointId)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var assignment = dbContext.Assignments
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .FirstOrDefault(item => item.Id == assignmentId);

        if (assignment is null || assignment.Route is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment is not available."));
        }

        if (!boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment belongs to another employee."));
        }

        var point = assignment.Route.Points.FirstOrDefault(item => item.Id == pointId);
        if (point is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Patrol point is not part of assignment route."));
        }

        return new AssignmentPointValidation(true, assignment, point, null);
    }

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

        var existing = dbContext.MobileUploadedFiles
            .AsNoTracking()
            .FirstOrDefault(file => file.MobileAccountId == session.MobileAccountId
                && file.ClientFileId == clientFileId);
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
        Directory.CreateDirectory(storageDirectory);
        using (var output = File.Create(storagePath))
        {
            command.Content.CopyTo(output);
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
            Sha256 = NormalizeOptionalText(command.Sha256),
            SizeBytes = command.SizeBytes,
            CapturedAtLocal = command.CapturedAtLocal.ToUniversalTime(),
            UploadedAt = uploadedAt,
        };
        try
        {
            dbContext.MobileUploadedFiles.Add(entity);
            dbContext.SaveChanges();
        }
        catch
        {
            TryDeleteFile(storagePath);
            throw;
        }

        return new MobileFileUploadResponseDto(clientFileId, serverFileId, "uploaded", uploadedAt);
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

    private MobileSessionBundle CreateSession(
        MobileAccountEntity account,
        string deviceId,
        string deviceName,
        string platform,
        string appVersion,
        string ipAddress)
    {
        var now = DateTimeOffset.UtcNow;
        var accessToken = EfAuthSessionService.GenerateAccessToken();
        var refreshToken = EfAuthSessionService.GenerateAccessToken();
        var session = new MobileAccountSessionEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = account.Id,
            Status = "Онлайн",
            DeviceId = NormalizeOptionalText(deviceId),
            Device = NormalizeOptionalText(deviceName, "Kenshi Armor C1s"),
            Platform = NormalizeOptionalText(platform, "Android"),
            AppVersion = NormalizeOptionalText(appVersion, "0.1.0"),
            IpAddress = NormalizeOptionalText(ipAddress, "-"),
            PushToken = string.Empty,
            TokenHash = EfAuthSessionService.HashToken(accessToken),
            RefreshTokenHash = EfAuthSessionService.HashToken(refreshToken),
            CreatedAt = now,
            ExpiresAt = now.Add(AccessTokenLifetime),
            RefreshExpiresAt = now.Add(RefreshTokenLifetime),
            LastSeenAt = now,
        };

        dbContext.MobileAccountSessions.Add(session);
        return new MobileSessionBundle(session, accessToken, refreshToken);
    }

    private static MobileAuthSessionDto MapAuthSession(
        MobileAccountEntity account,
        MobileAccountSessionEntity session,
        string accessToken,
        string refreshToken) =>
        new(
            MapUser(account),
            MapDevice(account, session),
            accessToken,
            refreshToken,
            session.ExpiresAt,
            session.RefreshExpiresAt);

    private MobileAccountSessionEntity? FindActiveSession(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return null;
        }

        var tokenHash = EfAuthSessionService.HashToken(accessToken);
        var now = DateTimeOffset.UtcNow;
        var session = dbContext.MobileAccountSessions
            .Include(item => item.MobileAccount)
                .ThenInclude(account => account!.EmployeeBindings)
            .FirstOrDefault(item => item.TokenHash == tokenHash);

        if (session is null
            || session.RevokedAt is not null
            || session.ExpiresAt <= now
            || session.MobileAccount is null
            || !CanUseMobileApp(session.MobileAccount))
        {
            return null;
        }

        return session;
    }

    private IReadOnlyList<MobilePatrolRequestBoardItemDto> BuildRequestBoard(IReadOnlySet<Guid> boundEmployeeIds)
    {
        return dbContext.PatrolRequests
            .AsNoTracking()
            .Include(request => request.Assignment)
            .Where(request => request.RouteId != null)
            .Where(request => request.EmployeeId == null || boundEmployeeIds.Contains(request.EmployeeId.Value))
            .Where(request => request.Assignment == null || request.Assignment.EmployeeId == request.EmployeeId)
            .AsEnumerable()
            .Where(request => !IsClosedRequestStatus(request.Status))
            .OrderBy(request => request.ScheduledDate)
            .ThenBy(request => request.ScheduledTime)
            .Select(request => new MobilePatrolRequestBoardItemDto(
                request.Id,
                request.RouteId!.Value,
                request.RouteName,
                BuildPlannedStartAt(request.ScheduledDate, request.ScheduledTime),
                string.IsNullOrWhiteSpace(request.EmployeeName) ? null : request.EmployeeName,
                MapRequestStatus(request),
                request.CreatedAt.ToUnixTimeMilliseconds()))
            .ToArray();
    }

    private IReadOnlyList<MobilePatrolAssignmentDto> BuildAssignments(IReadOnlySet<Guid> boundEmployeeIds)
    {
        return dbContext.Assignments
            .AsNoTracking()
            .Where(assignment => boundEmployeeIds.Contains(assignment.EmployeeId))
            .Where(assignment => assignment.Status != AssignmentStatusValues.Completed
                && assignment.Status != AssignmentStatusValues.Cancelled)
            .OrderBy(assignment => assignment.PlannedAt)
            .Select(assignment => new MobilePatrolAssignmentDto(
                assignment.Id,
                assignment.PatrolRequestId,
                assignment.RouteId,
                MapAssignmentStatus(assignment.Status),
                assignment.StartedAt,
                assignment.FinishedAt,
                assignment.LockVersion))
            .ToArray();
    }

    private IReadOnlyList<MobileWorkTaskDto> BuildWorkTasks(IReadOnlyCollection<Guid> boundEmployeeIds)
    {
        if (boundEmployeeIds.Count == 0)
        {
            return [];
        }

        return dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(workSession => workSession.Employees)
            .Include(workSession => workSession.Pauses)
            .Where(workSession => workSession.DeletedAt == null)
            .Where(workSession => workSession.Employees.Any(employee => boundEmployeeIds.Contains(employee.EmployeeId)))
            .OrderByDescending(workSession => workSession.ArrivedAt)
            .Take(100)
            .AsEnumerable()
            .Select(workSession => new MobileWorkTaskDto(
                workSession.Id,
                BuildWorkTaskTitle(workSession),
                MapWorkTaskStatus(workSession, boundEmployeeIds),
                workSession.ArrivedAt,
                workSession.RowVersion,
                workSession.CompletedAt))
            .ToArray();
    }

    private static MobileUserDto MapUser(MobileAccountEntity account)
    {
        var names = GetBoundEmployeeNames(account);
        return new MobileUserDto(
            account.Id,
            names.Count == 0 ? account.Login : string.Join(", ", names),
            [NormalizeOptionalText(account.Role, "mobile")],
            ["mobile.bootstrap", "mobile.outbox"],
            account.LastSeenAt ?? account.CreatedAt);
    }

    private static MobileDeviceDto MapDevice(MobileAccountEntity account, MobileAccountSessionEntity session) =>
        new(session.DeviceId, account.Id, Trusted: true, BlockedAt: null);

    private static MobileNotificationDto MapNotification(MobileNotificationEntity notification) =>
        new(
            notification.Id,
            notification.Type,
            notification.Title,
            notification.Message,
            notification.EntityType,
            notification.EntityId,
            notification.CreatedAt,
            notification.ReadAt);

    private static bool CanUseMobileApp(MobileAccountEntity account) =>
        IsActiveStatus(account.Status) && GetBoundEmployeeIds(account).Count > 0;

    private static bool IsActiveStatus(string status) =>
        status.Equals("Активен", StringComparison.OrdinalIgnoreCase)
        || status.Equals("Active", StringComparison.OrdinalIgnoreCase);

    private static bool IsClosedRequestStatus(string status) =>
        status.Equals("Завершена", StringComparison.OrdinalIgnoreCase)
        || status.Equals("Отменена", StringComparison.OrdinalIgnoreCase)
        || status.Equals("completed", StringComparison.OrdinalIgnoreCase)
        || status.Equals("cancelled", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlySet<Guid> GetBoundEmployeeIds(MobileAccountEntity account) =>
        account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .Select(binding => binding.EmployeeId)
            .ToHashSet();

    private static IReadOnlyList<string> GetBoundEmployeeNames(MobileAccountEntity account)
    {
        var activeBindingNames = account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .Select(binding => binding.DisplayName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return activeBindingNames.Length > 0 ? activeBindingNames : account.BoundEmployees;
    }

    private static DateTimeOffset BuildPlannedStartAt(DateOnly date, TimeOnly? time)
    {
        var dateTime = date.ToDateTime(time ?? TimeOnly.MinValue);
        return new DateTimeOffset(DateTime.SpecifyKind(dateTime, DateTimeKind.Utc));
    }

    private static string BuildWorkTaskTitle(EmuWorkSessionEntity workSession)
    {
        if (!string.IsNullOrWhiteSpace(workSession.TaskDescription))
        {
            return workSession.TaskDescription.Trim();
        }

        return string.IsNullOrWhiteSpace(workSession.WorkNumber)
            ? "Задача учета работ"
            : $"Задача {workSession.WorkNumber}";
    }

    private static string MapWorkTaskStatus(EmuWorkSessionEntity workSession, IReadOnlyCollection<Guid> boundEmployeeIds)
    {
        if (workSession.CompletedAt is not null)
        {
            return "completedServer";
        }

        var employeeRows = workSession.Employees
            .Where(employee => boundEmployeeIds.Contains(employee.EmployeeId))
            .ToArray();

        if (employeeRows.Length > 0 && employeeRows.All(employee => employee.FinishedAt is not null))
        {
            return "completedServer";
        }

        if (workSession.Pauses.Any(pause => pause.EndedAt is null))
        {
            return "paused";
        }

        return workSession.ArrivedAt <= DateTimeOffset.UtcNow ? "inProgress" : "accepted";
    }

    private static string MapRequestStatus(PatrolRequestEntity request)
    {
        if (request.Assignment?.Status == AssignmentStatusValues.InProgress)
        {
            return "inProgress";
        }

        if (request.Assignment is not null)
        {
            return "assigned";
        }

        return request.EmployeeId is null ? "available" : "assigned";
    }

    private static string MapAssignmentStatus(string status)
    {
        if (status == AssignmentStatusValues.InProgress)
        {
            return "inProgress";
        }

        return "accepted";
    }

    private static Dictionary<string, string[]> ValidateLoginRequest(MobileLoginRequestDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(request.Login))
        {
            errors["login"] = ["Login is required."];
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors["password"] = ["Password is required."];
        }

        if (string.IsNullOrWhiteSpace(request.DeviceId))
        {
            errors["deviceId"] = ["Device id is required."];
        }

        return errors;
    }

    private static MobileOutboxResponseDto Rejected(string clientOperationId, string message) =>
        new(clientOperationId, "rejected", null, null, message, null, null);

    private static MobileOutboxResponseDto Conflict(string clientOperationId, string message) =>
        new(clientOperationId, "conflict", null, null, message, Guid.NewGuid().ToString(), null);

    private static MobileOutboxResponseDto AcceptedPoint(string clientOperationId, Guid pointId, long revision, string message) =>
        new(clientOperationId, "accepted", pointId.ToString(), revision, message, null, null);

    private static Guid? ReadGuid(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is Guid guid)
        {
            return guid;
        }

        if (value is JsonElement element && element.ValueKind == JsonValueKind.String)
        {
            return Guid.TryParse(element.GetString(), out var parsed) ? parsed : null;
        }

        return Guid.TryParse(value.ToString(), out var fallback) ? fallback : null;
    }

    private static long? ReadLong(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            long number => number,
            int number => number,
            JsonElement element when element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out var number) => number,
            JsonElement element when element.ValueKind == JsonValueKind.String && long.TryParse(element.GetString(), out var number) => number,
            _ => long.TryParse(value.ToString(), out var parsed) ? parsed : null,
        };
    }

    private static string? ReadString(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is JsonElement element)
        {
            return element.ValueKind == JsonValueKind.String ? element.GetString() : element.ToString();
        }

        return value.ToString();
    }

    private static IReadOnlyList<string> ReadStringList(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return [];
        }

        if (value is JsonElement element)
        {
            if (element.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return element.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => NormalizeOptionalText(item.GetString()))
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        var json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<List<string>>(json, JsonOptions)?
            .Select(item => NormalizeOptionalText(item))
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToArray() ?? [];
    }

    private static DateTimeOffset? ReadDateTimeOffset(Dictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is DateTimeOffset offset)
        {
            return offset;
        }

        if (value is JsonElement element && element.ValueKind == JsonValueKind.String)
        {
            return DateTimeOffset.TryParse(element.GetString(), out var parsed) ? parsed : null;
        }

        return DateTimeOffset.TryParse(value.ToString(), out var fallback) ? fallback : null;
    }

    private static IReadOnlyList<MobilePointResultPayload> ReadPointResults(Dictionary<string, object?> payload)
    {
        if (!payload.TryGetValue("pointResults", out var value) || value is null)
        {
            return [];
        }

        if (value is JsonElement element)
        {
            return element.Deserialize<List<MobilePointResultPayload>>(JsonOptions) ?? [];
        }

        var json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<List<MobilePointResultPayload>>(json, JsonOptions) ?? [];
    }

    private static string BuildResultComment(
        IReadOnlyList<MobilePointResultPayload> pointResults,
        IEnumerable<RoutePointEntity> routePoints)
    {
        var names = routePoints.ToDictionary(point => point.Id, point => point.Name);
        var lines = pointResults
            .OrderBy(result => names.TryGetValue(result.PointId, out var name) ? name : result.PointId.ToString())
            .Select(result =>
            {
                var pointName = names.TryGetValue(result.PointId, out var name) ? name : result.PointId.ToString();
                var comment = string.IsNullOrWhiteSpace(result.Comment) ? "-" : result.Comment.Trim();
                return $"{pointName}: {result.Status}; {comment}";
            });

        return string.Join(Environment.NewLine, lines).Trim();
    }

    private static string FormatDeviation(DateTimeOffset plannedAt, DateTimeOffset actualAt)
    {
        var minutes = (int)Math.Round((actualAt - plannedAt).TotalMinutes);
        if (minutes == 0)
        {
            return "0m";
        }

        return minutes > 0 ? $"+{minutes}m" : $"{minutes}m";
    }

    private static void TouchSession(MobileAccountSessionEntity session)
    {
        var now = DateTimeOffset.UtcNow;
        session.LastSeenAt = now;
        if (session.MobileAccount is not null)
        {
            session.MobileAccount.LastSeenAt = now;
            session.MobileAccount.Session = "Онлайн";
        }
    }

    private static MobileAuthResult UnauthorizedResult() =>
        new(null, true, EmptyErrors());

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

    private static string NormalizeLogin(string? value) =>
        new(NormalizeOptionalText(value)
            .ToLowerInvariant()
            .Replace(' ', '.')
            .Where(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-')
            .ToArray());

    private static string NormalizeOptionalText(string? value, string fallback = "") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string? NormalizeNullableText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeMobileContentType(string? contentType)
    {
        var normalized = NormalizeOptionalText(contentType).ToLowerInvariant();
        return normalized switch
        {
            "image/jpeg" or "image/jpg" => "image/jpeg",
            "video/mp4" => "video/mp4",
            _ => string.Empty
        };
    }

    private sealed record MobileSessionBundle(
        MobileAccountSessionEntity Session,
        string AccessToken,
        string RefreshToken);

    private sealed record AssignmentPointValidation(
        bool Succeeded,
        AssignmentEntity? Assignment,
        RoutePointEntity? Point,
        MobileOutboxResponseDto? Response)
    {
        public static AssignmentPointValidation Fail(MobileOutboxResponseDto response) =>
            new(false, null, null, response);
    }

    private sealed record MobileWorkTaskValidation(
        bool Succeeded,
        EmuWorkSessionEntity? WorkSession,
        IReadOnlyList<Guid> EmployeeIds,
        MobileOutboxResponseDto? Response)
    {
        public static MobileWorkTaskValidation Fail(MobileOutboxResponseDto response) =>
            new(false, null, [], response);
    }

    private sealed class MobilePointResultPayload
    {
        public Guid PointId { get; init; }

        public string Status { get; init; } = string.Empty;

        public string? Comment { get; init; }

        public string? IssueTypeId { get; init; }

        public IReadOnlyList<string> PhotoClientFileIds { get; init; } = [];

        public string? ConfirmationType { get; init; }

        public string? NfcUidHash { get; init; }

        public DateTimeOffset? CompletedAtLocal { get; init; }
    }
}
