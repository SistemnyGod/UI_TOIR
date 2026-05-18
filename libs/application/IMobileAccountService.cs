using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileAccountService
{
    IReadOnlyList<MobileAccountDto> GetAccounts();

    MobileAccountDto? GetAccount(Guid id);

    CreateMobileAccountResult CreateAccount(CreateMobileAccountDto request);

    UpdateMobileAccountResult UpdateAccount(Guid id, UpdateMobileAccountDto request);

    UpdateMobileAccountResult AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request);

    UpdateMobileAccountResult DetachEmployee(Guid id, Guid employeeId);

    UpdateMobileAccountResult BlockAccount(Guid id);

    UpdateMobileAccountResult UnblockAccount(Guid id);

    ResetMobileAccountPasswordDto? ResetPassword(Guid id);

    bool DeleteAccount(Guid id);

    IReadOnlyList<MobileAccountSessionDto> GetSessions(Guid id);

    IReadOnlyList<MobileAccountSecurityEventDto> GetSecurityEvents(Guid id);
}

public sealed record CreateMobileAccountResult(
    MobileAccountDto? Account,
    string? TemporaryPassword,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Account is not null && Errors.Count == 0;
}

public sealed record UpdateMobileAccountResult(
    MobileAccountDto? Account,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Account is not null && Errors.Count == 0;
}
