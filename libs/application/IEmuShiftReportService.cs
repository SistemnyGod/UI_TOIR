using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IEmuShiftReportService
{
    EmuShiftReportOptionsDto GetOptions(IReadOnlyList<Guid>? allowedSectionIds = null);
    EmuCommandResult<EmuShiftReportEmployeeOptionDto> SetEmployeeCategory(Guid employeeId, EmuSetShiftReportEmployeeCategoryDto request);
    EmuCommandResult<EmuShiftReportDraftDto> SaveDraft(EmuSaveShiftReportDraftDto request, Guid? actorUserId, string actorName);
    EmuCommandResult<bool> ReleaseDraft(EmuReleaseShiftReportDraftDto request, Guid? actorUserId);
    EmuCommandResult<EmuShiftReportDetailDto> Create(EmuCreateShiftReportDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);
    Task<EmuListResponseDto<EmuShiftReportSummaryDto>> GetListAsync(EmuShiftReportQueryDto query, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null, CancellationToken cancellationToken = default);
    Task<EmuCommandResult<EmuShiftReportDetailDto>> GetDetailAsync(Guid id, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null, CancellationToken cancellationToken = default);
}
