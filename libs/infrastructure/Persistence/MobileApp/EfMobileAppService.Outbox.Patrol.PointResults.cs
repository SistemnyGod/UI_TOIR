using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
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
}
