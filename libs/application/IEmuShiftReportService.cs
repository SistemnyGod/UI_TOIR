using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IEmuShiftReportService
{
    EmuShiftReportOptionsDto GetOptions(IReadOnlyList<Guid>? allowedSectionIds = null);
    EmuCommandResult<EmuShiftReportDetailDto> Create(EmuCreateShiftReportDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);
    EmuListResponseDto<EmuShiftReportSummaryDto> GetList(EmuShiftReportQueryDto query, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null);
    EmuCommandResult<EmuShiftReportDetailDto> GetDetail(Guid id, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null);
}
