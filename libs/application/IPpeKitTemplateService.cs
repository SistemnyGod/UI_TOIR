using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPpeKitTemplateService
{
    IReadOnlyList<PpeKitTemplateDto> Get(Guid userId);
    InventoryCommandResult<PpeKitTemplateDto> Create(CreatePpeKitTemplateDto request, Guid userId, string userName, bool canManageShared);
    InventoryCommandResult<PpeKitTemplateDto> Update(Guid id, UpdatePpeKitTemplateDto request, Guid userId, bool canManageShared);
    InventoryCommandResult<PpeKitTemplateDto> Rename(Guid id, RenamePpeKitTemplateDto request, Guid userId, bool canManageShared);
    InventoryCommandResult<PpeKitTemplateDto> Copy(Guid id, CopyPpeKitTemplateDto request, Guid userId, string userName, bool canManageShared);
    InventoryCommandResult<PpeKitTemplateDto> Apply(Guid id, Guid normSetId, Guid userId);
    InventoryCommandResult<PpeKitTemplateDto> Archive(Guid id, ArchivePpeKitTemplateDto request, Guid userId, bool canManageShared);
}
