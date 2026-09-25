namespace Patrol360.Contracts;

public sealed record PpeKitTemplateLineDto(Guid NormRowId, Guid ItemId, string ItemName, string UnitSymbol, decimal Quantity, int? LifeMonths, long? UnitPriceMinor);

public sealed record PpeKitTemplateDto(Guid Id, string Name, Guid NormSetId, Guid OwnerUserId, string OwnerName, bool IsShared, long Version, DateTimeOffset UpdatedAt, IReadOnlyList<PpeKitTemplateLineDto> Lines);

public sealed record SavePpeKitTemplateLineDto(Guid NormRowId, Guid ItemId, string? ItemName, string? UnitSymbol, decimal Quantity, int? LifeMonths, long? UnitPriceMinor);

public sealed record CreatePpeKitTemplateDto(string Name, Guid NormSetId, bool IsShared, IReadOnlyList<SavePpeKitTemplateLineDto> Lines);

public sealed record UpdatePpeKitTemplateDto(long ExpectedVersion, string Name, bool IsShared, IReadOnlyList<SavePpeKitTemplateLineDto> Lines);

public sealed record RenamePpeKitTemplateDto(long ExpectedVersion, string Name);

public sealed record CopyPpeKitTemplateDto(string? Name, bool IsShared = false);

public sealed record ArchivePpeKitTemplateDto(long ExpectedVersion);
