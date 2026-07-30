namespace Patrol360.Contracts;

public sealed record EmuShiftReportEmployeeOptionDto(Guid Id, string FullName, string PersonnelNo, string Position, string Department, string? WorkerCategory, string? AssignedWorkerCategory);
public sealed record EmuSetShiftReportEmployeeCategoryDto(string? WorkerCategory);
public sealed record EmuShiftReportShiftOptionDto(string ShiftType, string Name, TimeOnly StartTime, TimeOnly EndTime, bool CrossesMidnight);
public sealed record EmuShiftReportOptionsDto(IReadOnlyList<EmuShiftReportEmployeeOptionDto> Employees, IReadOnlyList<EmuReferenceDto> Sections, IReadOnlyList<EmuShiftReportShiftOptionDto> Shifts);
public sealed record EmuCreateShiftReportLineDto(string WorkDescription, int DurationMinutes, Guid? SectionId, string? Note);
public sealed record EmuCreateShiftReportDto(DateOnly ReportDate, string ShiftType, string WorkerCategory, Guid EmployeeId, IReadOnlyList<EmuCreateShiftReportLineDto> Lines);
public sealed record EmuShiftReportLineDto(Guid Id, int SequenceNo, string WorkDescription, int DurationMinutes, Guid? SectionId, string SectionName, string Note);
public sealed record EmuShiftReportSummaryDto(Guid Id, DateOnly ReportDate, string ShiftType, string WorkerCategory, Guid EmployeeId, string EmployeeName, string PersonnelNo, string Position, string Department, string Status, int WorkCount, int TotalDurationMinutes, Guid? CreatedByUserId, string CreatedByName, DateTimeOffset SubmittedAt);
public sealed record EmuShiftReportDetailDto(Guid Id, DateOnly ReportDate, string ShiftType, string WorkerCategory, Guid EmployeeId, string EmployeeName, string PersonnelNo, string Position, string Department, string Status, int WorkCount, int TotalDurationMinutes, Guid? CreatedByUserId, string CreatedByName, DateTimeOffset SubmittedAt, IReadOnlyList<EmuShiftReportLineDto> Lines);
public sealed record EmuShiftReportQueryDto(DateOnly? Date = null, DateOnly? DateFrom = null, DateOnly? DateTo = null, string? ShiftType = null, string? WorkerCategory = null, Guid? EmployeeId = null, string? Search = null, int Page = 1, int PageSize = 50, bool FavoriteOnly = false);
