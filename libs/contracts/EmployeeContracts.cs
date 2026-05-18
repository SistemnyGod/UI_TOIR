namespace Patrol360.Contracts;

public sealed record EmployeeDto(
    Guid Id,
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string Status,
    string Shift,
    bool HasMobileAccount,
    DateTimeOffset LastSeenAt);

public sealed record CreateEmployeeDto(
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string Status,
    string Shift,
    bool HasMobileAccount);

public sealed record UpdateEmployeeDto(
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string Status,
    string Shift,
    bool HasMobileAccount);
