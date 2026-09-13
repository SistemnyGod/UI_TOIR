namespace Patrol360.Contracts;

public sealed record PpeIssueDocumentLineInput(
    Guid Id, Guid NormRowId, Guid ItemId, DateOnly IssueDate, decimal Quantity,
    long? UnitPriceMinor, string SizeText = "", string ExceptionReason = "",
    bool ManualControlConfirmed = false);

public sealed record SavePpeIssueDocumentDto(
    Guid EmployeeId, Guid NormSetId, DateOnly DocumentDate,
    string ResponsibleName, string Basis, InventoryPpeEmployeeDetailsDto? EmployeeDetails,
    IReadOnlyList<PpeIssueDocumentLineInput> Lines, long? ExpectedVersion = null,
    bool AcceptNormChange = false);

public sealed record ConfirmPpeIssueDocumentDto(long ExpectedVersion, string IdempotencyKey);
public sealed record CancelPpeIssueDocumentDto(long ExpectedVersion);

public sealed record PpeDocumentEmployeeDto(
    Guid Id, string FullName, string PersonnelNo, string Department, string Position,
    InventoryPpeEmployeeDetailsDto Details);

public sealed record PpeDocumentNormDto(
    Guid Id, Guid? ParentRowId, string RowType, int SortOrder, string NormItemName,
    string NormPoint, decimal Quantity, string UnitSymbol, string QuantityText,
    string IssuePeriodText, int? PeriodMonths, int? LifeMonths, Guid RequirementKey,
    string AlternativeGroup);

public sealed record PpeDocumentLineDto(
    Guid Id, Guid NormRowId, Guid ItemId, DateOnly IssueDate, decimal Quantity,
    long? UnitPriceMinor, string SizeText, string ExceptionReason, bool ManualControlConfirmed,
    string ItemName, string UnitSymbol, string BrandModelArticle, decimal NormUnitsPerItem,
    long? TotalMinor);

public sealed record PpeDocumentContentDto(
    PpeDocumentEmployeeDto Employee, Guid NormSetId, long NormSetVersion,
    string NormVersionName, string NormSourceName, DateOnly DocumentDate,
    string ResponsibleName, string Basis, IReadOnlyList<PpeDocumentNormDto> NormRows,
    IReadOnlyList<PpeDocumentLineDto> Lines);

public sealed record PpeDocumentProblemDto(Guid? LineId, string Code, string Message);
public sealed record PpeDocumentEntitlementDto(
    Guid LineId, decimal? AlreadyIssuedQuantity, decimal? AvailableQuantity,
    DateOnly? PeriodFromExclusive, DateOnly PeriodTo, string Status);
public sealed record PpeDocumentValidationDto(
    IReadOnlyList<PpeDocumentProblemDto> Errors, IReadOnlyList<PpeDocumentProblemDto> Warnings,
    IReadOnlyList<PpeDocumentEntitlementDto> Entitlements, long? TotalMinor);

public sealed record PpeIssueDocumentDto(
    Guid Id, long Version, string Status, DateTimeOffset CreatedAt, DateTimeOffset? ConfirmedAt,
    PpeDocumentContentDto Content, PpeDocumentValidationDto Validation);

public sealed record PpeIssueDocumentSummaryDto(
    Guid Id, long Version, string Status, Guid EmployeeId, string EmployeeName,
    DateOnly DocumentDate, int LinesCount, long? TotalMinor);

public sealed record PpeNormApprovalDto(
    long ExpectedVersion, string DepartmentName, IReadOnlyList<string> PositionAliases);
public sealed record PpeNormRowRulesDto(
    long ExpectedVersion, string UnitSymbol, int? PeriodMonths, int? LifeMonths,
    Guid? PreviousRequirementRowId, string AlternativeGroup);
public sealed record PpeMappingApprovalDto(
    long ExpectedNormVersion, Guid ItemId, decimal NormUnitsPerItem,
    string Evidence, string BrandModelArticle = "", long? DefaultUnitPriceMinor = null);

public sealed record PpeLegacyDraftMigrationDto(Guid? DocumentId, IReadOnlyList<string> Warnings);
