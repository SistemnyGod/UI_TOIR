using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileAccountService
{
    IReadOnlyList<MobileAccountDto> GetAccounts();

    MobileAccountDto? GetAccount(Guid id);

    CreateMobileAccountResult CreateAccount(CreateMobileAccountDto request);

    UpdateMobileAccountResult AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request);

    ResetMobileAccountPasswordDto? ResetPassword(Guid id);

    bool DeleteAccount(Guid id);
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
