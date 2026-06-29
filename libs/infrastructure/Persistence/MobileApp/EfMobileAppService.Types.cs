using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
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
