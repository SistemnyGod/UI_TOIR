using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext(DbContextOptions<Patrol360DbContext> options) : DbContext(options)
{
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        SynchronizePatrolStatusCodes();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        SynchronizePatrolStatusCodes();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    internal DbSet<RouteEntity> Routes => Set<RouteEntity>();

    internal DbSet<RoutePointEntity> RoutePoints => Set<RoutePointEntity>();

    internal DbSet<RouteRevisionEntity> RouteRevisions => Set<RouteRevisionEntity>();

    internal DbSet<RouteRevisionPointEntity> RouteRevisionPoints => Set<RouteRevisionPointEntity>();

    internal DbSet<EmployeeEntity> Employees => Set<EmployeeEntity>();

    internal DbSet<AccountingEmployeeReferenceEntity> AccountingEmployeeReferences => Set<AccountingEmployeeReferenceEntity>();

    internal DbSet<PatrolRequestEntity> PatrolRequests => Set<PatrolRequestEntity>();

    internal DbSet<PatrolRequestHistoryEventEntity> PatrolRequestHistoryEvents => Set<PatrolRequestHistoryEventEntity>();

    internal DbSet<PatrolResultEntity> PatrolResults => Set<PatrolResultEntity>();

    internal DbSet<PatrolResultIssueEntity> PatrolResultIssues => Set<PatrolResultIssueEntity>();

    internal DbSet<PatrolResultAttachmentEntity> PatrolResultAttachments => Set<PatrolResultAttachmentEntity>();

    internal DbSet<AssignmentEntity> Assignments => Set<AssignmentEntity>();

    internal DbSet<AssignmentSettingsEntity> AssignmentSettings => Set<AssignmentSettingsEntity>();

    internal DbSet<AssignmentFavoriteEmployeeEntity> AssignmentFavoriteEmployees => Set<AssignmentFavoriteEmployeeEntity>();

    internal DbSet<MobileAccountEntity> MobileAccounts => Set<MobileAccountEntity>();

    internal DbSet<MobileAccountEmployeeBindingEntity> MobileAccountEmployeeBindings => Set<MobileAccountEmployeeBindingEntity>();

    internal DbSet<MobileAccountSessionEntity> MobileAccountSessions => Set<MobileAccountSessionEntity>();

    internal DbSet<MobileDeviceEntity> MobileDevices => Set<MobileDeviceEntity>();

    internal DbSet<MobileRefreshTokenHistoryEntity> MobileRefreshTokenHistories => Set<MobileRefreshTokenHistoryEntity>();

    internal DbSet<MobileAccountAuditEventEntity> MobileAccountAuditEvents => Set<MobileAccountAuditEventEntity>();

    internal DbSet<MobileNotificationEntity> MobileNotifications => Set<MobileNotificationEntity>();

    internal DbSet<MobileOutboxOperationEntity> MobileOutboxOperations => Set<MobileOutboxOperationEntity>();

    internal DbSet<MobileSyncConflictResolutionEntity> MobileSyncConflictResolutions => Set<MobileSyncConflictResolutionEntity>();

    internal DbSet<MobileUploadedFileEntity> MobileUploadedFiles => Set<MobileUploadedFileEntity>();

    internal DbSet<MobileShiftRemarkEntity> MobileShiftRemarks => Set<MobileShiftRemarkEntity>();

    internal DbSet<SiteUserEntity> SiteUsers => Set<SiteUserEntity>();

    internal DbSet<RoleEntity> Roles => Set<RoleEntity>();

    internal DbSet<PermissionEntity> Permissions => Set<PermissionEntity>();

    internal DbSet<SiteUserRoleEntity> SiteUserRoles => Set<SiteUserRoleEntity>();

    internal DbSet<RolePermissionEntity> RolePermissions => Set<RolePermissionEntity>();

    internal DbSet<SiteUserPermissionEntity> SiteUserPermissions => Set<SiteUserPermissionEntity>();

    internal DbSet<SiteUserAccessScopeEntity> SiteUserAccessScopes => Set<SiteUserAccessScopeEntity>();

    internal DbSet<SiteUserAuditEventEntity> SiteUserAuditEvents => Set<SiteUserAuditEventEntity>();

    internal DbSet<SiteUserSessionEntity> SiteUserSessions => Set<SiteUserSessionEntity>();

    internal DbSet<InventoryCategoryEntity> InventoryCategories => Set<InventoryCategoryEntity>();

    internal DbSet<InventoryUnitEntity> InventoryUnits => Set<InventoryUnitEntity>();

    internal DbSet<InventoryItemEntity> InventoryItems => Set<InventoryItemEntity>();

    internal DbSet<InventoryWarehouseEntity> InventoryWarehouses => Set<InventoryWarehouseEntity>();

    internal DbSet<InventoryStockMoveEntity> InventoryStockMoves => Set<InventoryStockMoveEntity>();
    internal DbSet<InventoryOperationReceiptEntity> InventoryOperationReceipts => Set<InventoryOperationReceiptEntity>();

    internal DbSet<InventoryCustodyCategoryEntity> InventoryCustodyCategories => Set<InventoryCustodyCategoryEntity>();

    internal DbSet<InventoryCustodyDocumentEntity> InventoryCustodyDocuments => Set<InventoryCustodyDocumentEntity>();

    internal DbSet<InventoryCustodyRecordEntity> InventoryCustodyRecords => Set<InventoryCustodyRecordEntity>();

    internal DbSet<InventoryCustodyRecordEventEntity> InventoryCustodyRecordEvents => Set<InventoryCustodyRecordEventEntity>();

    internal DbSet<InventoryPpeCardEntity> InventoryPpeCards => Set<InventoryPpeCardEntity>();

    internal DbSet<InventoryPpeCardLineEntity> InventoryPpeCardLines => Set<InventoryPpeCardLineEntity>();

    internal DbSet<InventoryPpeCardLineEventEntity> InventoryPpeCardLineEvents => Set<InventoryPpeCardLineEventEntity>();

    internal DbSet<InventoryPpeNormSetEntity> InventoryPpeNormSets => Set<InventoryPpeNormSetEntity>();

    internal DbSet<InventoryPpeNormRowEntity> InventoryPpeNormRows => Set<InventoryPpeNormRowEntity>();

    internal DbSet<InventoryPpeNormCatalogMappingEntity> InventoryPpeNormCatalogMappings => Set<InventoryPpeNormCatalogMappingEntity>();

    internal DbSet<InventoryPpeCardNormRowEntity> InventoryPpeCardNormRows => Set<InventoryPpeCardNormRowEntity>();

    internal DbSet<InventoryPpeIssueTemplateEntity> InventoryPpeIssueTemplates => Set<InventoryPpeIssueTemplateEntity>();

    internal DbSet<InventoryPpeIssueTemplateLineEntity> InventoryPpeIssueTemplateLines => Set<InventoryPpeIssueTemplateLineEntity>();

    internal DbSet<InventoryItemSetEntity> InventoryItemSets => Set<InventoryItemSetEntity>();

    internal DbSet<InventoryItemSetItemEntity> InventoryItemSetItems => Set<InventoryItemSetItemEntity>();

    internal DbSet<InventoryPositionNormEntity> InventoryPositionNorms => Set<InventoryPositionNormEntity>();

    internal DbSet<InventoryPositionItemSetMapEntity> InventoryPositionItemSetMaps => Set<InventoryPositionItemSetMapEntity>();

    internal DbSet<InventoryReturnReasonEntity> InventoryReturnReasons => Set<InventoryReturnReasonEntity>();

    internal DbSet<InventoryWriteOffReasonEntity> InventoryWriteOffReasons => Set<InventoryWriteOffReasonEntity>();

    internal DbSet<InventorySystemLogEntity> InventorySystemLogs => Set<InventorySystemLogEntity>();

    internal DbSet<InventoryExportJobEntity> InventoryExportJobs => Set<InventoryExportJobEntity>();

    internal DbSet<InventoryLegacyImportRunEntity> InventoryLegacyImportRuns => Set<InventoryLegacyImportRunEntity>();

    internal DbSet<InventoryEmployeeLegacyLinkEntity> InventoryEmployeeLegacyLinks => Set<InventoryEmployeeLegacyLinkEntity>();

    internal DbSet<InventoryUserLegacyLinkEntity> InventoryUserLegacyLinks => Set<InventoryUserLegacyLinkEntity>();

    internal DbSet<EmuWorkSectionEntity> EmuWorkSections => Set<EmuWorkSectionEntity>();

    internal DbSet<EmuWaitReasonEntity> EmuWaitReasons => Set<EmuWaitReasonEntity>();

    internal DbSet<EmuNotCompletedReasonEntity> EmuNotCompletedReasons => Set<EmuNotCompletedReasonEntity>();

    internal DbSet<EmuWorkTemplateEntity> EmuWorkTemplates => Set<EmuWorkTemplateEntity>();

    internal DbSet<EmuFavoriteEmployeeEntity> EmuFavoriteEmployees => Set<EmuFavoriteEmployeeEntity>();

    internal DbSet<EmuShiftTemplateEntity> EmuShiftTemplates => Set<EmuShiftTemplateEntity>();

    internal DbSet<EmuEmployeeShiftEntity> EmuEmployeeShifts => Set<EmuEmployeeShiftEntity>();

    internal DbSet<EmuWorkPlanTaskEntity> EmuWorkPlanTasks => Set<EmuWorkPlanTaskEntity>();

    internal DbSet<EmuWorkPlanTaskEmployeeEntity> EmuWorkPlanTaskEmployees => Set<EmuWorkPlanTaskEmployeeEntity>();

    internal DbSet<EmuWorkSessionEntity> EmuWorkSessions => Set<EmuWorkSessionEntity>();

    internal DbSet<EmuWorkSessionEmployeeEntity> EmuWorkSessionEmployees => Set<EmuWorkSessionEmployeeEntity>();

    internal DbSet<EmuWorkParticipationIntervalEntity> EmuWorkParticipationIntervals => Set<EmuWorkParticipationIntervalEntity>();

    internal DbSet<EmuWorkPauseEntity> EmuWorkPauses => Set<EmuWorkPauseEntity>();

    internal DbSet<EmuWorkPauseEmployeeEntity> EmuWorkPauseEmployees => Set<EmuWorkPauseEmployeeEntity>();

    internal DbSet<EmuWorkSessionCarryOverEntity> EmuWorkSessionCarryOvers => Set<EmuWorkSessionCarryOverEntity>();

    internal DbSet<EmuWorkAuditEventEntity> EmuWorkAuditEvents => Set<EmuWorkAuditEventEntity>();

    internal DbSet<EmuDecisionEntity> EmuDecisions => Set<EmuDecisionEntity>();

    internal DbSet<EmuNotificationEntity> EmuNotifications => Set<EmuNotificationEntity>();

    internal DbSet<EmuShiftReportEntity> EmuShiftReports => Set<EmuShiftReportEntity>();

    internal DbSet<EmuShiftReportLineEntity> EmuShiftReportLines => Set<EmuShiftReportLineEntity>();

    internal DbSet<EmuShiftReportDraftEntity> EmuShiftReportDrafts => Set<EmuShiftReportDraftEntity>();

    internal DbSet<PercoIntegrationSettingsEntity> PercoIntegrationSettings => Set<PercoIntegrationSettingsEntity>();

    internal DbSet<PercoIntegrationLogEntity> PercoIntegrationLogs => Set<PercoIntegrationLogEntity>();

    internal DbSet<PercoSyncStateEntity> PercoSyncStates => Set<PercoSyncStateEntity>();

    internal DbSet<PercoEmployeeLinkEntity> PercoEmployeeLinks => Set<PercoEmployeeLinkEntity>();

    internal DbSet<PercoAccessEventEntity> PercoAccessEvents => Set<PercoAccessEventEntity>();

    internal DbSet<PercoPresenceRebuildQueueEntity> PercoPresenceRebuildQueue => Set<PercoPresenceRebuildQueueEntity>();

    internal DbSet<EmployeePresenceIntervalEntity> EmployeePresenceIntervals => Set<EmployeePresenceIntervalEntity>();

    private void SynchronizePatrolStatusCodes()
    {
        foreach (var entry in ChangeTracker.Entries<AssignmentEntity>()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            entry.Entity.StatusCode = PatrolStatusCodeMapper.ToAssignmentCode(entry.Entity.Status);
        }

        foreach (var entry in ChangeTracker.Entries<PatrolRequestEntity>()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            entry.Entity.StatusCode = PatrolStatusCodeMapper.ToRequestCode(entry.Entity.Status);
        }

        foreach (var entry in ChangeTracker.Entries<PatrolResultEntity>()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            entry.Entity.StatusCode = PatrolStatusCodeMapper.ToResultCode(entry.Entity.Status);
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new PpeIssueDocumentConfiguration());
        modelBuilder.ApplyConfiguration(new PpeIssueFactConfiguration());
        ConfigureRoutes(modelBuilder);
        ConfigureRoutePoints(modelBuilder);
        ConfigureRouteRevisions(modelBuilder);
        ConfigureEmployees(modelBuilder);
        ConfigureAccountingEmployeeReferences(modelBuilder);
        ConfigurePatrolRequests(modelBuilder);
        ConfigurePatrolResults(modelBuilder);
        ConfigurePatrolResultIssues(modelBuilder);
        ConfigurePatrolResultAttachments(modelBuilder);
        ConfigureAssignments(modelBuilder);
        ConfigureAssignmentSettings(modelBuilder);
        ConfigureMobileAccounts(modelBuilder);
        ConfigureMobileAccountEmployeeBindings(modelBuilder);
        ConfigureMobileAccountSessions(modelBuilder);
        ConfigureMobileDevices(modelBuilder);
        ConfigureMobileRefreshTokenHistories(modelBuilder);
        ConfigureMobileAccountAuditEvents(modelBuilder);
        ConfigureMobileNotifications(modelBuilder);
        ConfigureMobileOutboxOperations(modelBuilder);
        ConfigureMobileSyncConflictResolutions(modelBuilder);
        ConfigureMobileUploadedFiles(modelBuilder);
        ConfigureMobileShiftRemarks(modelBuilder);
        ConfigureMobilePatrolAppeals(modelBuilder);
        ConfigurePatrolLateReports(modelBuilder);
        ConfigureSiteUsers(modelBuilder);
        ConfigureRoles(modelBuilder);
        ConfigurePermissions(modelBuilder);
        ConfigureSiteUserRoles(modelBuilder);
        ConfigureRolePermissions(modelBuilder);
        ConfigureSiteUserPermissions(modelBuilder);
        ConfigureSiteUserAccessScopes(modelBuilder);
        ConfigureSiteUserSessions(modelBuilder);
        ConfigureSiteUserAuditEvents(modelBuilder);
        ConfigureInventoryCategories(modelBuilder);
        ConfigureInventoryUnits(modelBuilder);
        ConfigureInventoryItems(modelBuilder);
        ConfigureInventoryWarehouses(modelBuilder);
        ConfigureInventoryStockMoves(modelBuilder);
        ConfigureInventoryOperationReceipts(modelBuilder);
        ConfigureInventoryWorkflow(modelBuilder);
        ConfigureEmu(modelBuilder);
        ConfigureEmuShiftReports(modelBuilder);
        ConfigurePerco(modelBuilder);
    }

}
