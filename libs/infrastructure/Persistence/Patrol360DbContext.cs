using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class Patrol360DbContext(DbContextOptions<Patrol360DbContext> options) : DbContext(options)
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

    public DbSet<RouteEntity> Routes => Set<RouteEntity>();

    public DbSet<RoutePointEntity> RoutePoints => Set<RoutePointEntity>();

    public DbSet<RouteRevisionEntity> RouteRevisions => Set<RouteRevisionEntity>();

    public DbSet<RouteRevisionPointEntity> RouteRevisionPoints => Set<RouteRevisionPointEntity>();

    public DbSet<EmployeeEntity> Employees => Set<EmployeeEntity>();

    public DbSet<AccountingEmployeeReferenceEntity> AccountingEmployeeReferences => Set<AccountingEmployeeReferenceEntity>();

    public DbSet<PatrolRequestEntity> PatrolRequests => Set<PatrolRequestEntity>();

    public DbSet<PatrolResultEntity> PatrolResults => Set<PatrolResultEntity>();

    public DbSet<PatrolResultIssueEntity> PatrolResultIssues => Set<PatrolResultIssueEntity>();

    public DbSet<PatrolResultAttachmentEntity> PatrolResultAttachments => Set<PatrolResultAttachmentEntity>();

    public DbSet<AssignmentEntity> Assignments => Set<AssignmentEntity>();

    public DbSet<AssignmentSettingsEntity> AssignmentSettings => Set<AssignmentSettingsEntity>();

    public DbSet<AssignmentFavoriteEmployeeEntity> AssignmentFavoriteEmployees => Set<AssignmentFavoriteEmployeeEntity>();

    public DbSet<MobileAccountEntity> MobileAccounts => Set<MobileAccountEntity>();

    public DbSet<MobileAccountEmployeeBindingEntity> MobileAccountEmployeeBindings => Set<MobileAccountEmployeeBindingEntity>();

    public DbSet<MobileAccountSessionEntity> MobileAccountSessions => Set<MobileAccountSessionEntity>();

    public DbSet<MobileAccountAuditEventEntity> MobileAccountAuditEvents => Set<MobileAccountAuditEventEntity>();

    public DbSet<MobileNotificationEntity> MobileNotifications => Set<MobileNotificationEntity>();

    public DbSet<MobileOutboxOperationEntity> MobileOutboxOperations => Set<MobileOutboxOperationEntity>();

    public DbSet<MobileSyncConflictResolutionEntity> MobileSyncConflictResolutions => Set<MobileSyncConflictResolutionEntity>();

    public DbSet<MobileUploadedFileEntity> MobileUploadedFiles => Set<MobileUploadedFileEntity>();

    public DbSet<MobileShiftRemarkEntity> MobileShiftRemarks => Set<MobileShiftRemarkEntity>();

    public DbSet<SiteUserEntity> SiteUsers => Set<SiteUserEntity>();

    public DbSet<RoleEntity> Roles => Set<RoleEntity>();

    public DbSet<PermissionEntity> Permissions => Set<PermissionEntity>();

    public DbSet<SiteUserRoleEntity> SiteUserRoles => Set<SiteUserRoleEntity>();

    public DbSet<RolePermissionEntity> RolePermissions => Set<RolePermissionEntity>();

    public DbSet<SiteUserPermissionEntity> SiteUserPermissions => Set<SiteUserPermissionEntity>();

    public DbSet<SiteUserAccessScopeEntity> SiteUserAccessScopes => Set<SiteUserAccessScopeEntity>();

    public DbSet<SiteUserSessionEntity> SiteUserSessions => Set<SiteUserSessionEntity>();

    public DbSet<InventoryCategoryEntity> InventoryCategories => Set<InventoryCategoryEntity>();

    public DbSet<InventoryUnitEntity> InventoryUnits => Set<InventoryUnitEntity>();

    public DbSet<InventoryItemEntity> InventoryItems => Set<InventoryItemEntity>();

    public DbSet<InventoryWarehouseEntity> InventoryWarehouses => Set<InventoryWarehouseEntity>();

    public DbSet<InventoryStockMoveEntity> InventoryStockMoves => Set<InventoryStockMoveEntity>();

    public DbSet<InventoryCustodyCategoryEntity> InventoryCustodyCategories => Set<InventoryCustodyCategoryEntity>();

    public DbSet<InventoryCustodyDocumentEntity> InventoryCustodyDocuments => Set<InventoryCustodyDocumentEntity>();

    public DbSet<InventoryCustodyRecordEntity> InventoryCustodyRecords => Set<InventoryCustodyRecordEntity>();

    public DbSet<InventoryCustodyRecordEventEntity> InventoryCustodyRecordEvents => Set<InventoryCustodyRecordEventEntity>();

    public DbSet<InventoryPpeCardEntity> InventoryPpeCards => Set<InventoryPpeCardEntity>();

    public DbSet<InventoryPpeCardLineEntity> InventoryPpeCardLines => Set<InventoryPpeCardLineEntity>();

    public DbSet<InventoryPpeCardLineEventEntity> InventoryPpeCardLineEvents => Set<InventoryPpeCardLineEventEntity>();

    public DbSet<InventoryPpeNormSetEntity> InventoryPpeNormSets => Set<InventoryPpeNormSetEntity>();

    public DbSet<InventoryPpeNormRowEntity> InventoryPpeNormRows => Set<InventoryPpeNormRowEntity>();

    public DbSet<InventoryPpeNormCatalogMappingEntity> InventoryPpeNormCatalogMappings => Set<InventoryPpeNormCatalogMappingEntity>();

    public DbSet<InventoryPpeCardNormRowEntity> InventoryPpeCardNormRows => Set<InventoryPpeCardNormRowEntity>();

    public DbSet<InventoryPpeIssueTemplateEntity> InventoryPpeIssueTemplates => Set<InventoryPpeIssueTemplateEntity>();

    public DbSet<InventoryItemSetEntity> InventoryItemSets => Set<InventoryItemSetEntity>();

    public DbSet<InventoryItemSetItemEntity> InventoryItemSetItems => Set<InventoryItemSetItemEntity>();

    public DbSet<InventoryPositionNormEntity> InventoryPositionNorms => Set<InventoryPositionNormEntity>();

    public DbSet<InventoryPositionItemSetMapEntity> InventoryPositionItemSetMaps => Set<InventoryPositionItemSetMapEntity>();

    public DbSet<InventoryReturnReasonEntity> InventoryReturnReasons => Set<InventoryReturnReasonEntity>();

    public DbSet<InventoryWriteOffReasonEntity> InventoryWriteOffReasons => Set<InventoryWriteOffReasonEntity>();

    public DbSet<InventorySystemLogEntity> InventorySystemLogs => Set<InventorySystemLogEntity>();

    public DbSet<InventoryExportJobEntity> InventoryExportJobs => Set<InventoryExportJobEntity>();

    public DbSet<InventoryLegacyImportRunEntity> InventoryLegacyImportRuns => Set<InventoryLegacyImportRunEntity>();

    public DbSet<InventoryEmployeeLegacyLinkEntity> InventoryEmployeeLegacyLinks => Set<InventoryEmployeeLegacyLinkEntity>();

    public DbSet<InventoryUserLegacyLinkEntity> InventoryUserLegacyLinks => Set<InventoryUserLegacyLinkEntity>();

    public DbSet<EmuWorkSectionEntity> EmuWorkSections => Set<EmuWorkSectionEntity>();

    public DbSet<EmuWaitReasonEntity> EmuWaitReasons => Set<EmuWaitReasonEntity>();

    public DbSet<EmuNotCompletedReasonEntity> EmuNotCompletedReasons => Set<EmuNotCompletedReasonEntity>();

    public DbSet<EmuWorkTemplateEntity> EmuWorkTemplates => Set<EmuWorkTemplateEntity>();

    public DbSet<EmuFavoriteEmployeeEntity> EmuFavoriteEmployees => Set<EmuFavoriteEmployeeEntity>();

    public DbSet<EmuShiftTemplateEntity> EmuShiftTemplates => Set<EmuShiftTemplateEntity>();

    public DbSet<EmuEmployeeShiftEntity> EmuEmployeeShifts => Set<EmuEmployeeShiftEntity>();

    public DbSet<EmuWorkPlanTaskEntity> EmuWorkPlanTasks => Set<EmuWorkPlanTaskEntity>();

    public DbSet<EmuWorkPlanTaskEmployeeEntity> EmuWorkPlanTaskEmployees => Set<EmuWorkPlanTaskEmployeeEntity>();

    public DbSet<EmuWorkSessionEntity> EmuWorkSessions => Set<EmuWorkSessionEntity>();

    public DbSet<EmuWorkSessionEmployeeEntity> EmuWorkSessionEmployees => Set<EmuWorkSessionEmployeeEntity>();

    public DbSet<EmuWorkParticipationIntervalEntity> EmuWorkParticipationIntervals => Set<EmuWorkParticipationIntervalEntity>();

    public DbSet<EmuWorkPauseEntity> EmuWorkPauses => Set<EmuWorkPauseEntity>();

    public DbSet<EmuWorkPauseEmployeeEntity> EmuWorkPauseEmployees => Set<EmuWorkPauseEmployeeEntity>();

    public DbSet<EmuWorkSessionCarryOverEntity> EmuWorkSessionCarryOvers => Set<EmuWorkSessionCarryOverEntity>();

    public DbSet<EmuWorkAuditEventEntity> EmuWorkAuditEvents => Set<EmuWorkAuditEventEntity>();

    public DbSet<EmuDecisionEntity> EmuDecisions => Set<EmuDecisionEntity>();

    public DbSet<EmuNotificationEntity> EmuNotifications => Set<EmuNotificationEntity>();

    public DbSet<PercoIntegrationSettingsEntity> PercoIntegrationSettings => Set<PercoIntegrationSettingsEntity>();

    public DbSet<PercoIntegrationLogEntity> PercoIntegrationLogs => Set<PercoIntegrationLogEntity>();

    public DbSet<PercoSyncStateEntity> PercoSyncStates => Set<PercoSyncStateEntity>();

    public DbSet<PercoEmployeeLinkEntity> PercoEmployeeLinks => Set<PercoEmployeeLinkEntity>();

    public DbSet<PercoAccessEventEntity> PercoAccessEvents => Set<PercoAccessEventEntity>();

    public DbSet<EmployeePresenceIntervalEntity> EmployeePresenceIntervals => Set<EmployeePresenceIntervalEntity>();

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
        ConfigureMobileAccountAuditEvents(modelBuilder);
        ConfigureMobileNotifications(modelBuilder);
        ConfigureMobileOutboxOperations(modelBuilder);
        ConfigureMobileSyncConflictResolutions(modelBuilder);
        ConfigureMobileUploadedFiles(modelBuilder);
        ConfigureMobileShiftRemarks(modelBuilder);
        ConfigureSiteUsers(modelBuilder);
        ConfigureRoles(modelBuilder);
        ConfigurePermissions(modelBuilder);
        ConfigureSiteUserRoles(modelBuilder);
        ConfigureRolePermissions(modelBuilder);
        ConfigureSiteUserPermissions(modelBuilder);
        ConfigureSiteUserAccessScopes(modelBuilder);
        ConfigureSiteUserSessions(modelBuilder);
        ConfigureInventoryCategories(modelBuilder);
        ConfigureInventoryUnits(modelBuilder);
        ConfigureInventoryItems(modelBuilder);
        ConfigureInventoryWarehouses(modelBuilder);
        ConfigureInventoryStockMoves(modelBuilder);
        ConfigureInventoryWorkflow(modelBuilder);
        ConfigureEmu(modelBuilder);
        ConfigurePerco(modelBuilder);
    }

    private static void ConfigureRoutes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RouteEntity>(entity =>
        {
            entity.ToTable("routes");
            entity.HasKey(route => route.Id);

            entity.Property(route => route.Id).HasColumnName("id");
            entity.Property(route => route.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(route => route.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(route => route.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(route => route.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(route => route.Duration).HasColumnName("duration").HasMaxLength(40).IsRequired();
            entity.Property(route => route.Distance).HasColumnName("distance").HasMaxLength(40).IsRequired();
            entity.Property(route => route.Periodicity).HasColumnName("periodicity").HasMaxLength(120).IsRequired();
            entity.Property(route => route.VersionNo).HasColumnName("version_no").IsConcurrencyToken();
            entity.Property(route => route.IsArchived).HasColumnName("is_archived");
            entity.Property(route => route.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(route => route.Name).HasDatabaseName("ix_routes_name");
            entity.HasIndex(route => route.IsArchived).HasDatabaseName("ix_routes_archived");
        });
    }

    private static void ConfigureRoutePoints(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoutePointEntity>(entity =>
        {
            entity.ToTable("route_points");
            entity.HasKey(point => point.Id);

            entity.Property(point => point.Id).HasColumnName("id");
            entity.Property(point => point.RouteId).HasColumnName("route_id");
            entity.Property(point => point.SequenceNo).HasColumnName("seq_no");
            entity.Property(point => point.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Zone).HasColumnName("zone").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Type).HasColumnName("point_type").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Tag).HasColumnName("tag").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(point => point.Instruction).HasColumnName("instruction").HasMaxLength(2000).IsRequired();
            entity.Property(point => point.Interval).HasColumnName("interval").HasMaxLength(40).IsRequired();
            entity.Property(point => point.ExpectedTime).HasColumnName("expected_time").HasMaxLength(40).IsRequired();
            entity.Property(point => point.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(point => point.NfcCode).HasColumnName("nfc_code").HasMaxLength(80);
            entity.Property(point => point.IsRequired).HasColumnName("is_required");
            entity.Property(point => point.RequiresPhoto).HasColumnName("requires_photo");

            entity.HasOne(point => point.Route)
                .WithMany(route => route.Points)
                .HasForeignKey(point => point.RouteId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(point => new { point.RouteId, point.SequenceNo })
                .IsUnique()
                .HasDatabaseName("ux_route_points_route_seq");

            entity.HasIndex(point => new { point.RouteId, point.NfcCode })
                .IsUnique()
                .HasFilter("nfc_code IS NOT NULL AND nfc_code <> ''")
                .HasDatabaseName("ux_route_points_route_nfc_code");
        });
    }

    private static void ConfigureRouteRevisions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RouteRevisionEntity>(entity =>
        {
            entity.ToTable("route_revisions");
            entity.HasKey(revision => revision.Id);
            entity.Property(revision => revision.Id).HasColumnName("id");
            entity.Property(revision => revision.RouteId).HasColumnName("route_id");
            entity.Property(revision => revision.VersionNo).HasColumnName("version_no");
            entity.Property(revision => revision.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(revision => revision.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(revision => revision.CreatedAt).HasColumnName("created_at");
            entity.HasOne(revision => revision.Route)
                .WithMany(route => route.Revisions)
                .HasForeignKey(revision => revision.RouteId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(revision => new { revision.RouteId, revision.VersionNo })
                .IsUnique()
                .HasDatabaseName("ux_route_revisions_route_version");
        });

        modelBuilder.Entity<RouteRevisionPointEntity>(entity =>
        {
            entity.ToTable("route_revision_points");
            entity.HasKey(point => point.Id);
            entity.Property(point => point.Id).HasColumnName("id");
            entity.Property(point => point.RouteRevisionId).HasColumnName("route_revision_id");
            entity.Property(point => point.SourceRoutePointId).HasColumnName("source_route_point_id");
            entity.Property(point => point.SequenceNo).HasColumnName("seq_no");
            entity.Property(point => point.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Zone).HasColumnName("zone").HasMaxLength(160).IsRequired();
            entity.Property(point => point.Type).HasColumnName("point_type").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Tag).HasColumnName("tag").HasMaxLength(80).IsRequired();
            entity.Property(point => point.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(point => point.Instruction).HasColumnName("instruction").HasMaxLength(2000).IsRequired();
            entity.Property(point => point.NfcCode).HasColumnName("nfc_code").HasMaxLength(80);
            entity.Property(point => point.IsRequired).HasColumnName("is_required");
            entity.Property(point => point.RequiresPhoto).HasColumnName("requires_photo");
            entity.Property(point => point.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.HasOne(point => point.RouteRevision)
                .WithMany(revision => revision.Points)
                .HasForeignKey(point => point.RouteRevisionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(point => new { point.RouteRevisionId, point.SequenceNo })
                .IsUnique()
                .HasDatabaseName("ux_route_revision_points_revision_seq");
            entity.HasIndex(point => new { point.RouteRevisionId, point.SourceRoutePointId })
                .IsUnique()
                .HasDatabaseName("ux_route_revision_points_revision_source");
        });
    }

    private static void ConfigureEmployees(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmployeeEntity>(entity =>
        {
            entity.ToTable("employees");
            entity.HasKey(employee => employee.Id);

            entity.Property(employee => employee.Id).HasColumnName("id");
            entity.Property(employee => employee.FullName).HasColumnName("full_name").HasMaxLength(220).IsRequired();
            entity.Property(employee => employee.PersonnelNo).HasColumnName("personnel_no").HasMaxLength(60).IsRequired();
            entity.Property(employee => employee.Position).HasColumnName("position").HasMaxLength(160).IsRequired();
            entity.Property(employee => employee.Department).HasColumnName("department").HasMaxLength(160).IsRequired();
            entity.Property(employee => employee.EmployeeGroup).HasColumnName("employee_group").HasMaxLength(120).IsRequired();
            entity.Property(employee => employee.HiredAt).HasColumnName("hired_at");
            entity.Property(employee => employee.BirthDate).HasColumnName("birth_date");
            entity.Property(employee => employee.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(employee => employee.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(employee => employee.HasMobileAccount).HasColumnName("has_mobile_account");
            entity.Property(employee => employee.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasIndex(employee => employee.PersonnelNo)
                .IsUnique()
                .HasDatabaseName("ux_employees_personnel_no");

            entity.HasIndex(employee => employee.Status).HasDatabaseName("ix_employees_status");
            entity.HasIndex(employee => employee.Department).HasDatabaseName("ix_employees_department");
            entity.HasIndex(employee => employee.EmployeeGroup).HasDatabaseName("ix_employees_employee_group");
        });
    }

    private static void ConfigureAccountingEmployeeReferences(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AccountingEmployeeReferenceEntity>(entity =>
        {
            entity.ToTable("accounting_employee_references");
            entity.HasKey(reference => reference.Id);

            entity.Property(reference => reference.Id).HasColumnName("id");
            entity.Property(reference => reference.Kind).HasColumnName("kind").HasMaxLength(40).IsRequired();
            entity.Property(reference => reference.Name).HasColumnName("name").HasMaxLength(180).IsRequired();
            entity.Property(reference => reference.IsArchived).HasColumnName("is_archived");
            entity.Property(reference => reference.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(reference => new { reference.Kind, reference.Name })
                .IsUnique()
                .HasDatabaseName("ux_accounting_employee_references_kind_name");
            entity.HasIndex(reference => new { reference.Kind, reference.IsArchived })
                .HasDatabaseName("ix_accounting_employee_references_kind_active");
        });
    }

    private static void ConfigurePatrolRequests(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolRequestEntity>(entity =>
        {
            entity.ToTable("patrol_requests");
            entity.HasKey(request => request.Id);

            entity.Property(request => request.Id).HasColumnName("id");
            entity.Property(request => request.Number).HasColumnName("number").HasMaxLength(40).IsRequired();
            entity.Property(request => request.EmployeeId).HasColumnName("employee_id");
            entity.Property(request => request.EmployeeName).HasColumnName("employee_name").HasMaxLength(220).IsRequired();
            entity.Property(request => request.RouteId).HasColumnName("route_id");
            entity.Property(request => request.RouteName).HasColumnName("route_name").HasMaxLength(160).IsRequired();
            entity.Property(request => request.SourceResultId).HasColumnName("source_result_id");
            entity.Property(request => request.ScheduledDate).HasColumnName("scheduled_date");
            entity.Property(request => request.ScheduledTime).HasColumnName("scheduled_time");
            entity.Property(request => request.NotifyEmployee).HasColumnName("notify_employee");
            entity.Property(request => request.NotificationText).HasColumnName("notification_text").HasMaxLength(1000).IsRequired();
            entity.Property(request => request.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(request => request.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(request => request.CreatedAt).HasColumnName("created_at");
            entity.Property(request => request.Description).HasColumnName("description").HasMaxLength(1200).IsRequired();

            entity.HasOne(request => request.Employee)
                .WithMany(employee => employee.PatrolRequests)
                .HasForeignKey(request => request.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(request => request.Route)
                .WithMany()
                .HasForeignKey(request => request.RouteId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(request => request.SourceResult)
                .WithMany()
                .HasForeignKey(request => request.SourceResultId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(request => request.Number)
                .IsUnique()
                .HasDatabaseName("ux_patrol_requests_number");

            entity.HasIndex(request => request.Status).HasDatabaseName("ix_patrol_requests_status");
            entity.HasIndex(request => request.StatusCode).HasDatabaseName("ix_patrol_requests_status_code");
            entity.HasIndex(request => new { request.ScheduledDate, request.StatusCode })
                .HasDatabaseName("ix_patrol_requests_scheduled_date_status_code");
            entity.HasIndex(request => request.ScheduledDate).HasDatabaseName("ix_patrol_requests_scheduled_date");
            entity.HasIndex(request => request.SourceResultId).HasDatabaseName("ix_patrol_requests_source_result_id");
        });
    }

    private static void ConfigurePatrolResults(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultEntity>(entity =>
        {
            entity.ToTable("patrol_results");
            entity.HasKey(result => result.Id);

            entity.Property(result => result.Id).HasColumnName("id");
            entity.Property(result => result.AssignmentId).HasColumnName("assignment_id");
            entity.Property(result => result.RouteId).HasColumnName("route_id");
            entity.Property(result => result.EmployeeId).HasColumnName("employee_id");
            entity.Property(result => result.RoutePointId).HasColumnName("route_point_id");
            entity.Property(result => result.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(result => result.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(result => result.PointName).HasColumnName("point_name").HasMaxLength(160).IsRequired();
            entity.Property(result => result.EmployeeName).HasColumnName("employee_name").HasMaxLength(220).IsRequired();
            entity.Property(result => result.RouteName).HasColumnName("route_name").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Territory).HasColumnName("territory").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(result => result.PlannedAt).HasColumnName("planned_at");
            entity.Property(result => result.ActualAt).HasColumnName("actual_at");
            entity.Property(result => result.Deviation).HasColumnName("deviation").HasMaxLength(40).IsRequired();
            entity.Property(result => result.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(result => result.IssueType).HasColumnName("issue_type").HasMaxLength(160).IsRequired();
            entity.Property(result => result.Severity).HasColumnName("severity").HasMaxLength(60).IsRequired();
            entity.Property(result => result.Photos).HasColumnName("photos");
            entity.Property(result => result.CreatedAt).HasColumnName("created_at");

            entity.HasOne(result => result.Assignment)
                .WithMany()
                .HasForeignKey(result => result.AssignmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(result => result.AssignmentId)
                .HasDatabaseName("ix_patrol_results_assignment_id");

            entity.HasOne(result => result.Route)
                .WithMany()
                .HasForeignKey(result => result.RouteId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(result => result.Employee)
                .WithMany()
                .HasForeignKey(result => result.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(result => result.RoutePoint)
                .WithMany()
                .HasForeignKey(result => result.RoutePointId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(result => result.Status).HasDatabaseName("ix_patrol_results_status");
            entity.HasIndex(result => result.StatusCode).HasDatabaseName("ix_patrol_results_status_code");
            entity.HasIndex(result => result.RouteId).HasDatabaseName("ix_patrol_results_route_id");
            entity.HasIndex(result => result.EmployeeId).HasDatabaseName("ix_patrol_results_employee_id");
            entity.HasIndex(result => result.ActualAt).HasDatabaseName("ix_patrol_results_actual_at");
            entity.HasIndex(result => new { result.ActualAt, result.AssignmentId })
                .HasDatabaseName("ix_patrol_results_actual_at_assignment_id");
        });
    }

    private static void ConfigurePatrolResultIssues(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultIssueEntity>(entity =>
        {
            entity.ToTable("patrol_result_issues");
            entity.HasKey(issue => issue.Id);

            entity.Property(issue => issue.Id).HasColumnName("id");
            entity.Property(issue => issue.PatrolResultId).HasColumnName("patrol_result_id");
            entity.Property(issue => issue.Type).HasColumnName("issue_type").HasMaxLength(160).IsRequired();
            entity.Property(issue => issue.Severity).HasColumnName("severity").HasMaxLength(60).IsRequired();
            entity.Property(issue => issue.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(issue => issue.CreatedAt).HasColumnName("created_at");

            entity.HasOne(issue => issue.PatrolResult)
                .WithMany(result => result.Issues)
                .HasForeignKey(issue => issue.PatrolResultId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(issue => new { issue.PatrolResultId, issue.CreatedAt })
                .HasDatabaseName("ix_patrol_result_issues_result_created");
        });
    }

    private static void ConfigurePatrolResultAttachments(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatrolResultAttachmentEntity>(entity =>
        {
            entity.ToTable("patrol_result_attachments");
            entity.HasKey(attachment => attachment.Id);

            entity.Property(attachment => attachment.Id).HasColumnName("id");
            entity.Property(attachment => attachment.PatrolResultId).HasColumnName("patrol_result_id");
            entity.Property(attachment => attachment.FileName).HasColumnName("file_name").HasMaxLength(260).IsRequired();
            entity.Property(attachment => attachment.ContentType).HasColumnName("content_type").HasMaxLength(120).IsRequired();
            entity.Property(attachment => attachment.SizeBytes).HasColumnName("size_bytes");
            entity.Property(attachment => attachment.CreatedAt).HasColumnName("created_at");

            entity.HasOne(attachment => attachment.PatrolResult)
                .WithMany(result => result.Attachments)
                .HasForeignKey(attachment => attachment.PatrolResultId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(attachment => new { attachment.PatrolResultId, attachment.CreatedAt })
                .HasDatabaseName("ix_patrol_result_attachments_result_created");
        });
    }

    private static void ConfigureAssignments(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssignmentEntity>(entity =>
        {
            entity.ToTable("assignments");
            entity.HasKey(assignment => assignment.Id);

            entity.Property(assignment => assignment.Id).HasColumnName("id");
            entity.Property(assignment => assignment.PatrolRequestId).HasColumnName("patrol_request_id");
            entity.Property(assignment => assignment.RouteId).HasColumnName("route_id");
            entity.Property(assignment => assignment.RouteVersionNo).HasColumnName("route_version_no");
            entity.Property(assignment => assignment.RouteRevisionId).HasColumnName("route_revision_id");
            entity.Property(assignment => assignment.EmployeeId).HasColumnName("employee_id");
            entity.Property(assignment => assignment.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(assignment => assignment.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(assignment => assignment.StatusCode).HasColumnName("status_code").HasMaxLength(40);
            entity.Property(assignment => assignment.PlannedAt).HasColumnName("planned_at");
            entity.Property(assignment => assignment.StartedAt).HasColumnName("started_at");
            entity.Property(assignment => assignment.FinishedAt).HasColumnName("finished_at");
            entity.Property(assignment => assignment.ProgressPercent).HasColumnName("progress_percent");
            entity.Property(assignment => assignment.LockVersion).HasColumnName("lock_version").IsConcurrencyToken();

            entity.HasOne(assignment => assignment.PatrolRequest)
                .WithOne(request => request.Assignment)
                .HasForeignKey<AssignmentEntity>(assignment => assignment.PatrolRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(assignment => assignment.Route)
                .WithMany()
                .HasForeignKey(assignment => assignment.RouteId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(assignment => assignment.RouteRevision)
                .WithMany()
                .HasForeignKey(assignment => assignment.RouteRevisionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(assignment => assignment.Employee)
                .WithMany(employee => employee.Assignments)
                .HasForeignKey(assignment => assignment.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(assignment => new { assignment.EmployeeId, assignment.Status })
                .HasDatabaseName("ix_assignments_employee_status");
            entity.HasIndex(assignment => assignment.EmployeeId)
                .IsUnique()
                .HasFilter("status IN ('В пути', 'Приостановлена')")
                .HasDatabaseName("ux_assignments_employee_started");
            entity.HasIndex(assignment => new { assignment.EmployeeId, assignment.StatusCode })
                .HasDatabaseName("ix_assignments_employee_status_code");
            entity.HasIndex(assignment => new { assignment.PlannedAt, assignment.StatusCode })
                .HasDatabaseName("ix_assignments_planned_at_status_code");

            entity.HasIndex(assignment => assignment.RouteId).HasDatabaseName("ix_assignments_route_id");
            entity.HasIndex(assignment => assignment.RouteRevisionId).HasDatabaseName("ix_assignments_route_revision_id");
            entity.HasIndex(assignment => assignment.PlannedAt).HasDatabaseName("ix_assignments_planned_at");
        });
    }

    private static void ConfigureAssignmentSettings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssignmentSettingsEntity>(entity =>
        {
            entity.ToTable("assignment_settings");
            entity.HasKey(settings => settings.Id);
            entity.Property(settings => settings.Id).HasColumnName("id");
            entity.Property(settings => settings.DayStart).HasColumnName("day_start").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.DayEnd).HasColumnName("day_end").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.NightStart).HasColumnName("night_start").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.NightEnd).HasColumnName("night_end").HasMaxLength(5).IsRequired();
            entity.Property(settings => settings.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<AssignmentFavoriteEmployeeEntity>(entity =>
        {
            entity.ToTable("assignment_favorite_employees");
            entity.HasKey(favorite => favorite.Id);
            entity.Property(favorite => favorite.Id).HasColumnName("id");
            entity.Property(favorite => favorite.EmployeeId).HasColumnName("employee_id");
            entity.Property(favorite => favorite.SortOrder).HasColumnName("sort_order");
            entity.Property(favorite => favorite.CreatedAt).HasColumnName("created_at");
            entity.HasOne(favorite => favorite.Employee)
                .WithMany()
                .HasForeignKey(favorite => favorite.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(favorite => favorite.EmployeeId)
                .IsUnique()
                .HasDatabaseName("ux_assignment_favorite_employees_employee");
            entity.HasIndex(favorite => favorite.SortOrder)
                .HasDatabaseName("ix_assignment_favorite_employees_sort");
        });
    }

    private static void ConfigureMobileAccounts(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountEntity>(entity =>
        {
            entity.ToTable("mobile_accounts");
            entity.HasKey(account => account.Id);

            entity.Property(account => account.Id).HasColumnName("id");
            entity.Property(account => account.Login).HasColumnName("login").HasMaxLength(120).IsRequired();
            entity.Property(account => account.PasswordHash).HasColumnName("password_hash").HasMaxLength(512).IsRequired();
            entity.Property(account => account.PasswordResetRequired).HasColumnName("password_reset_required");
            entity.Property(account => account.LastPasswordResetAt).HasColumnName("last_password_reset_at");
            entity.Property(account => account.EmployeeScope).HasColumnName("employee_scope").HasMaxLength(40).IsRequired();
            entity.Property(account => account.BoundEmployees).HasColumnName("bound_employees");
            entity.Property(account => account.Role).HasColumnName("role").HasMaxLength(160).IsRequired();
            entity.Property(account => account.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(account => account.Session).HasColumnName("session").HasMaxLength(60).IsRequired();
            entity.Property(account => account.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(account => account.Device).HasColumnName("device").HasMaxLength(160).IsRequired();
            entity.Property(account => account.Version).HasColumnName("version").HasMaxLength(40).IsRequired();
            entity.Property(account => account.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(account => account.Login)
                .IsUnique()
                .HasDatabaseName("ux_mobile_accounts_login");

            entity.HasIndex(account => account.Status).HasDatabaseName("ix_mobile_accounts_status");
        });
    }

    private static void ConfigureMobileAccountEmployeeBindings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountEmployeeBindingEntity>(entity =>
        {
            entity.ToTable("mobile_account_employee_bindings");
            entity.HasKey(binding => binding.Id);

            entity.Property(binding => binding.Id).HasColumnName("id");
            entity.Property(binding => binding.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(binding => binding.EmployeeId).HasColumnName("employee_id");
            entity.Property(binding => binding.DisplayName).HasColumnName("display_name").HasMaxLength(240).IsRequired();
            entity.Property(binding => binding.CreatedAt).HasColumnName("created_at");
            entity.Property(binding => binding.DetachedAt).HasColumnName("detached_at");

            entity.HasOne(binding => binding.MobileAccount)
                .WithMany(account => account.EmployeeBindings)
                .HasForeignKey(binding => binding.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(binding => binding.Employee)
                .WithMany()
                .HasForeignKey(binding => binding.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(binding => new { binding.MobileAccountId, binding.EmployeeId, binding.DetachedAt })
                .HasDatabaseName("ix_mobile_account_employee_bindings_account_employee");
            entity.HasIndex(binding => binding.EmployeeId)
                .HasDatabaseName("ix_mobile_account_employee_bindings_employee");
        });
    }

    private static void ConfigureMobileAccountSessions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountSessionEntity>(entity =>
        {
            entity.ToTable("mobile_account_sessions");
            entity.HasKey(session => session.Id);

            entity.Property(session => session.Id).HasColumnName("id");
            entity.Property(session => session.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(session => session.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(session => session.DeviceId).HasColumnName("device_id").HasMaxLength(120).IsRequired();
            entity.Property(session => session.Device).HasColumnName("device").HasMaxLength(160).IsRequired();
            entity.Property(session => session.Platform).HasColumnName("platform").HasMaxLength(80).IsRequired();
            entity.Property(session => session.AppVersion).HasColumnName("app_version").HasMaxLength(40).IsRequired();
            entity.Property(session => session.IpAddress).HasColumnName("ip_address").HasMaxLength(80).IsRequired();
            entity.Property(session => session.PushToken).HasColumnName("push_token").HasMaxLength(512).IsRequired();
            entity.Property(session => session.PushTokenRegisteredAt).HasColumnName("push_token_registered_at");
            entity.Property(session => session.PushTokenRevokedAt).HasColumnName("push_token_revoked_at");
            entity.Property(session => session.TokenHash).HasColumnName("token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.RefreshTokenHash).HasColumnName("refresh_token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenHash).HasColumnName("previous_refresh_token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.PreviousAccessTokenProtected).HasColumnName("previous_access_token_protected").HasMaxLength(4096).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenProtected).HasColumnName("previous_refresh_token_protected").HasMaxLength(4096).IsRequired();
            entity.Property(session => session.PreviousRefreshTokenValidUntil).HasColumnName("previous_refresh_token_valid_until");
            entity.Property(session => session.RefreshGeneration).HasColumnName("refresh_generation").IsRequired().IsConcurrencyToken();
            entity.Property(session => session.CreatedAt).HasColumnName("created_at");
            entity.Property(session => session.ExpiresAt).HasColumnName("expires_at");
            entity.Property(session => session.RefreshExpiresAt).HasColumnName("refresh_expires_at");
            entity.Property(session => session.RevokedAt).HasColumnName("revoked_at");
            entity.Property(session => session.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasOne(session => session.MobileAccount)
                .WithMany(account => account.Sessions)
                .HasForeignKey(session => session.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(session => new { session.MobileAccountId, session.LastSeenAt })
                .HasDatabaseName("ix_mobile_account_sessions_account_seen");
            entity.HasIndex(session => session.TokenHash)
                .IsUnique()
                .HasFilter("token_hash <> ''")
                .HasDatabaseName("ux_mobile_account_sessions_token_hash");
            entity.HasIndex(session => session.PreviousRefreshTokenHash)
                .HasDatabaseName("ix_mobile_account_sessions_previous_refresh_token_hash")
                .HasFilter("previous_refresh_token_hash <> ''");
            entity.HasIndex(session => session.RefreshTokenHash)
                .IsUnique()
                .HasFilter("refresh_token_hash <> ''")
                .HasDatabaseName("ux_mobile_account_sessions_refresh_token_hash");
        });
    }

    private static void ConfigureMobileAccountAuditEvents(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileAccountAuditEventEntity>(entity =>
        {
            entity.ToTable("mobile_account_audit_events");
            entity.HasKey(auditEvent => auditEvent.Id);

            entity.Property(auditEvent => auditEvent.Id).HasColumnName("id");
            entity.Property(auditEvent => auditEvent.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(auditEvent => auditEvent.Action).HasColumnName("action").HasMaxLength(120).IsRequired();
            entity.Property(auditEvent => auditEvent.Details).HasColumnName("details").HasMaxLength(500).IsRequired();
            entity.Property(auditEvent => auditEvent.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(auditEvent => auditEvent.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(auditEvent => new { auditEvent.MobileAccountId, auditEvent.CreatedAt })
                .HasDatabaseName("ix_mobile_account_audit_account_created");
            entity.HasIndex(auditEvent => auditEvent.Action)
                .HasDatabaseName("ix_mobile_account_audit_action");
        });
    }

    private static void ConfigureMobileNotifications(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileNotificationEntity>(entity =>
        {
            entity.ToTable("mobile_notifications");
            entity.HasKey(notification => notification.Id);

            entity.Property(notification => notification.Id).HasColumnName("id");
            entity.Property(notification => notification.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(notification => notification.EmployeeId).HasColumnName("employee_id");
            entity.Property(notification => notification.Type).HasColumnName("notification_type").HasMaxLength(80).IsRequired();
            entity.Property(notification => notification.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(notification => notification.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(notification => notification.EntityType).HasColumnName("entity_type").HasMaxLength(80);
            entity.Property(notification => notification.EntityId).HasColumnName("entity_id").HasMaxLength(120);
            entity.Property(notification => notification.IdempotencyKey).HasColumnName("idempotency_key").HasMaxLength(160).IsRequired();
            entity.Property(notification => notification.PushStatus).HasColumnName("push_status").HasMaxLength(40).IsRequired();
            entity.Property(notification => notification.PushTokenSnapshot).HasColumnName("push_token_snapshot").HasMaxLength(512).IsRequired();
            entity.Property(notification => notification.PushAttemptCount).HasColumnName("push_attempt_count");
            entity.Property(notification => notification.PushLastError).HasColumnName("push_last_error").HasMaxLength(1200).IsRequired();
            entity.Property(notification => notification.PushSentAt).HasColumnName("push_sent_at");
            entity.Property(notification => notification.PushClaimedAt).HasColumnName("push_claimed_at");
            entity.Property(notification => notification.CreatedAt).HasColumnName("created_at");
            entity.Property(notification => notification.ReadAt).HasColumnName("read_at");

            entity.HasOne(notification => notification.MobileAccount)
                .WithMany()
                .HasForeignKey(notification => notification.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(notification => new { notification.MobileAccountId, notification.CreatedAt })
                .HasDatabaseName("ix_mobile_notifications_account_created");
            entity.HasIndex(notification => new { notification.MobileAccountId, notification.IdempotencyKey })
                .IsUnique()
                .HasDatabaseName("ux_mobile_notifications_account_idempotency");
            entity.HasIndex(notification => notification.ReadAt)
                .HasDatabaseName("ix_mobile_notifications_read_at");
            entity.HasIndex(notification => new { notification.PushStatus, notification.CreatedAt })
                .HasDatabaseName("ix_mobile_notifications_push_status_created");
        });
    }

    private static void ConfigureMobileOutboxOperations(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileOutboxOperationEntity>(entity =>
        {
            entity.ToTable("mobile_outbox_operations");
            entity.HasKey(operation => new { operation.MobileAccountId, operation.ClientOperationId });

            entity.Property(operation => operation.ClientOperationId).HasColumnName("client_operation_id").HasMaxLength(80);
            entity.Property(operation => operation.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(operation => operation.CommandType).HasColumnName("command_type").HasMaxLength(80).IsRequired();
            entity.Property(operation => operation.EntityType).HasColumnName("entity_type").HasMaxLength(80).IsRequired();
            entity.Property(operation => operation.EntityLocalId).HasColumnName("entity_local_id").HasMaxLength(120);
            entity.Property(operation => operation.EntityServerId).HasColumnName("entity_server_id").HasMaxLength(120);
            entity.Property(operation => operation.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(operation => operation.PayloadFingerprint).HasColumnName("payload_fingerprint").HasMaxLength(64);
            entity.Property(operation => operation.CreatedAtLocal).HasColumnName("created_at_local");
            entity.Property(operation => operation.CreatedAtServer).HasColumnName("created_at_server");
            entity.Property(operation => operation.AttemptCount).HasColumnName("attempt_count");
            entity.Property(operation => operation.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(operation => operation.ResponseJson).HasColumnName("response_json").HasColumnType("jsonb").IsRequired();

            entity.HasOne(operation => operation.MobileAccount)
                .WithMany()
                .HasForeignKey(operation => operation.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(operation => new { operation.MobileAccountId, operation.CreatedAtServer })
                .HasDatabaseName("ix_mobile_outbox_operations_account_created");
            entity.HasIndex(operation => operation.ClientOperationId)
                .HasDatabaseName("ix_mobile_outbox_operations_client_operation_id");
            entity.HasIndex(operation => operation.Status)
                .HasDatabaseName("ix_mobile_outbox_operations_status");
            entity.HasIndex(operation => new
                {
                    operation.MobileAccountId,
                    operation.CommandType,
                    operation.EntityServerId,
                    operation.Status,
                    operation.PayloadFingerprint,
                })
                .HasFilter("payload_fingerprint IS NOT NULL")
                .HasDatabaseName("ix_mobile_outbox_operations_complete_fingerprint");
        });
    }

    private static void ConfigureMobileUploadedFiles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileUploadedFileEntity>(entity =>
        {
            entity.ToTable("mobile_uploaded_files");
            entity.HasKey(file => file.Id);

            entity.Property(file => file.Id).HasColumnName("id");
            entity.Property(file => file.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(file => file.ClientFileId).HasColumnName("client_file_id").HasMaxLength(80).IsRequired();
            entity.Property(file => file.AssignmentId).HasColumnName("assignment_id");
            entity.Property(file => file.PointId).HasColumnName("point_id");
            entity.Property(file => file.RemarkId).HasColumnName("remark_id").HasMaxLength(80);
            entity.Property(file => file.WorkTaskId).HasColumnName("work_task_id");
            entity.Property(file => file.StorageFileName).HasColumnName("storage_file_name").HasMaxLength(260).IsRequired();
            entity.Property(file => file.OriginalFileName).HasColumnName("original_file_name").HasMaxLength(260).IsRequired();
            entity.Property(file => file.ContentType).HasColumnName("content_type").HasMaxLength(120).IsRequired();
            entity.Property(file => file.Sha256).HasColumnName("sha256").HasMaxLength(128).IsRequired();
            entity.Property(file => file.SizeBytes).HasColumnName("size_bytes");
            entity.Property(file => file.CapturedAtLocal).HasColumnName("captured_at_local");
            entity.Property(file => file.UploadedAt).HasColumnName("uploaded_at");

            entity.HasOne(file => file.MobileAccount)
                .WithMany()
                .HasForeignKey(file => file.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(file => file.Assignment)
                .WithMany()
                .HasForeignKey(file => file.AssignmentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(file => file.Point)
                .WithMany()
                .HasForeignKey(file => file.PointId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(file => new { file.MobileAccountId, file.ClientFileId })
                .IsUnique()
                .HasDatabaseName("ux_mobile_uploaded_files_account_client_file");
            entity.HasIndex(file => new { file.AssignmentId, file.PointId })
                .HasDatabaseName("ix_mobile_uploaded_files_assignment_point");
            entity.HasIndex(file => new { file.MobileAccountId, file.RemarkId })
                .HasDatabaseName("ix_mobile_uploaded_files_account_remark");
            entity.HasIndex(file => new { file.MobileAccountId, file.WorkTaskId })
                .HasDatabaseName("ix_mobile_uploaded_files_account_work_task");
        });
    }

    private static void ConfigureMobileShiftRemarks(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileShiftRemarkEntity>(entity =>
        {
            entity.ToTable("mobile_shift_remarks");
            entity.HasKey(remark => remark.Id);

            entity.Property(remark => remark.Id).HasColumnName("id");
            entity.Property(remark => remark.MobileAccountId).HasColumnName("mobile_account_id");
            entity.Property(remark => remark.EmployeeId).HasColumnName("employee_id");
            entity.Property(remark => remark.SectionId).HasColumnName("section_id");
            entity.Property(remark => remark.Title).HasColumnName("title").HasMaxLength(240).IsRequired();
            entity.Property(remark => remark.Comment).HasColumnName("comment").HasMaxLength(4000).IsRequired();
            entity.Property(remark => remark.MediaClientFileIdsJson).HasColumnName("media_client_file_ids_json").HasColumnType("jsonb").IsRequired();
            entity.Property(remark => remark.CreatedAtLocal).HasColumnName("created_at_local");
            entity.Property(remark => remark.CreatedAtServer).HasColumnName("created_at_server");
            entity.Property(remark => remark.Status).HasColumnName("status").HasMaxLength(40).IsRequired();

            entity.HasOne(remark => remark.MobileAccount)
                .WithMany()
                .HasForeignKey(remark => remark.MobileAccountId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(remark => remark.Employee)
                .WithMany()
                .HasForeignKey(remark => remark.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(remark => remark.Section)
                .WithMany()
                .HasForeignKey(remark => remark.SectionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(remark => new { remark.MobileAccountId, remark.CreatedAtServer })
                .HasDatabaseName("ix_mobile_shift_remarks_account_created");
            entity.HasIndex(remark => remark.EmployeeId)
                .HasDatabaseName("ix_mobile_shift_remarks_employee");
        });
    }

    private static void ConfigureMobileSyncConflictResolutions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MobileSyncConflictResolutionEntity>(entity =>
        {
            entity.ToTable("mobile_sync_conflict_resolutions");
            entity.HasKey(resolution => new { resolution.MobileAccountId, resolution.ClientOperationId });

            entity.Property(resolution => resolution.MobileAccountId)
                .HasColumnName("mobile_account_id");
            entity.Property(resolution => resolution.ClientOperationId)
                .HasColumnName("client_operation_id")
                .HasMaxLength(80);
            entity.Property(resolution => resolution.Status)
                .HasColumnName("status")
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(resolution => resolution.Comment)
                .HasColumnName("comment")
                .HasMaxLength(1200)
                .IsRequired();
            entity.Property(resolution => resolution.ResolvedBy)
                .HasColumnName("resolved_by")
                .HasMaxLength(220)
                .IsRequired();
            entity.Property(resolution => resolution.ResolvedAt).HasColumnName("resolved_at");

            entity.HasOne(resolution => resolution.Operation)
                .WithOne()
                .HasForeignKey<MobileSyncConflictResolutionEntity>(resolution => new { resolution.MobileAccountId, resolution.ClientOperationId })
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(resolution => resolution.Status)
                .HasDatabaseName("ix_mobile_sync_conflict_resolutions_status");
        });
    }

    private static void ConfigureSiteUsers(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserEntity>(entity =>
        {
            entity.ToTable("site_users");
            entity.HasKey(user => user.Id);

            entity.Property(user => user.Id).HasColumnName("id");
            entity.Property(user => user.Login).HasColumnName("login").HasMaxLength(120).IsRequired();
            entity.Property(user => user.NormalizedLogin).HasColumnName("normalized_login").HasMaxLength(120).IsRequired();
            entity.Property(user => user.DisplayName).HasColumnName("display_name").HasMaxLength(220).IsRequired();
            entity.Property(user => user.PasswordHash).HasColumnName("password_hash").HasMaxLength(512).IsRequired();
            entity.Property(user => user.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(user => user.CreatedAt).HasColumnName("created_at");
            entity.Property(user => user.LastLoginAt).HasColumnName("last_login_at");

            entity.HasIndex(user => user.NormalizedLogin)
                .IsUnique()
                .HasDatabaseName("ux_site_users_normalized_login");
            entity.HasIndex(user => user.Status).HasDatabaseName("ix_site_users_status");
            entity.HasIndex(user => user.DisplayName).HasDatabaseName("ix_site_users_display_name");
        });
    }

    private static void ConfigureRoles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoleEntity>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(role => role.Id);

            entity.Property(role => role.Id).HasColumnName("id");
            entity.Property(role => role.Code).HasColumnName("code").HasMaxLength(120).IsRequired();
            entity.Property(role => role.Name).HasColumnName("name").HasMaxLength(220).IsRequired();

            entity.HasIndex(role => role.Code)
                .IsUnique()
                .HasDatabaseName("ux_roles_code");
        });
    }

    private static void ConfigurePermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PermissionEntity>(entity =>
        {
            entity.ToTable("permissions");
            entity.HasKey(permission => permission.Id);

            entity.Property(permission => permission.Id).HasColumnName("id");
            entity.Property(permission => permission.Code).HasColumnName("code").HasMaxLength(160).IsRequired();
            entity.Property(permission => permission.Name).HasColumnName("name").HasMaxLength(220).IsRequired();

            entity.HasIndex(permission => permission.Code)
                .IsUnique()
                .HasDatabaseName("ux_permissions_code");
        });
    }

    private static void ConfigureSiteUserRoles(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserRoleEntity>(entity =>
        {
            entity.ToTable("site_user_roles");
            entity.HasKey(userRole => new { userRole.SiteUserId, userRole.RoleId });

            entity.Property(userRole => userRole.SiteUserId).HasColumnName("site_user_id");
            entity.Property(userRole => userRole.RoleId).HasColumnName("role_id");

            entity.HasOne(userRole => userRole.SiteUser)
                .WithMany(user => user.Roles)
                .HasForeignKey(userRole => userRole.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(userRole => userRole.Role)
                .WithMany(role => role.Users)
                .HasForeignKey(userRole => userRole.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureRolePermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RolePermissionEntity>(entity =>
        {
            entity.ToTable("role_permissions");
            entity.HasKey(rolePermission => new { rolePermission.RoleId, rolePermission.PermissionId });

            entity.Property(rolePermission => rolePermission.RoleId).HasColumnName("role_id");
            entity.Property(rolePermission => rolePermission.PermissionId).HasColumnName("permission_id");

            entity.HasOne(rolePermission => rolePermission.Role)
                .WithMany(role => role.Permissions)
                .HasForeignKey(rolePermission => rolePermission.RoleId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(rolePermission => rolePermission.Permission)
                .WithMany(permission => permission.Roles)
                .HasForeignKey(rolePermission => rolePermission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureSiteUserPermissions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserPermissionEntity>(entity =>
        {
            entity.ToTable("site_user_permissions");
            entity.HasKey(userPermission => new { userPermission.SiteUserId, userPermission.PermissionId });

            entity.Property(userPermission => userPermission.SiteUserId).HasColumnName("site_user_id");
            entity.Property(userPermission => userPermission.PermissionId).HasColumnName("permission_id");

            entity.HasOne(userPermission => userPermission.SiteUser)
                .WithMany(user => user.Permissions)
                .HasForeignKey(userPermission => userPermission.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(userPermission => userPermission.Permission)
                .WithMany(permission => permission.Users)
                .HasForeignKey(userPermission => userPermission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(userPermission => userPermission.PermissionId)
                .HasDatabaseName("ix_site_user_permissions_permission_id");
        });
    }

    private static void ConfigureSiteUserAccessScopes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserAccessScopeEntity>(entity =>
        {
            entity.ToTable("site_user_access_scopes");
            entity.HasKey(scope => scope.Id);

            entity.Property(scope => scope.Id).HasColumnName("id");
            entity.Property(scope => scope.SiteUserId).HasColumnName("site_user_id");
            entity.Property(scope => scope.ModuleKey).HasColumnName("module_key").HasMaxLength(80).IsRequired();
            entity.Property(scope => scope.ScopeType).HasColumnName("scope_type").HasMaxLength(80).IsRequired();
            entity.Property(scope => scope.ScopeId).HasColumnName("scope_id");
            entity.Property(scope => scope.CreatedAt).HasColumnName("created_at");
            entity.Property(scope => scope.CreatedByUserId).HasColumnName("created_by_user_id");

            entity.HasOne(scope => scope.SiteUser)
                .WithMany(user => user.AccessScopes)
                .HasForeignKey(scope => scope.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(scope => new { scope.SiteUserId, scope.ModuleKey, scope.ScopeType, scope.ScopeId })
                .IsUnique()
                .HasDatabaseName("ux_site_user_access_scopes_user_scope");
            entity.HasIndex(scope => new { scope.ModuleKey, scope.ScopeType, scope.ScopeId })
                .HasDatabaseName("ix_site_user_access_scopes_scope");
        });
    }

    private static void ConfigureSiteUserSessions(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SiteUserSessionEntity>(entity =>
        {
            entity.ToTable("site_user_sessions");
            entity.HasKey(session => session.Id);

            entity.Property(session => session.Id).HasColumnName("id");
            entity.Property(session => session.SiteUserId).HasColumnName("site_user_id");
            entity.Property(session => session.TokenHash).HasColumnName("token_hash").HasMaxLength(128).IsRequired();
            entity.Property(session => session.CreatedAt).HasColumnName("created_at");
            entity.Property(session => session.ExpiresAt).HasColumnName("expires_at");
            entity.Property(session => session.RevokedAt).HasColumnName("revoked_at");

            entity.HasOne(session => session.SiteUser)
                .WithMany(user => user.Sessions)
                .HasForeignKey(session => session.SiteUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(session => session.TokenHash)
                .IsUnique()
                .HasDatabaseName("ux_site_user_sessions_token_hash");
            entity.HasIndex(session => new { session.SiteUserId, session.ExpiresAt })
                .HasDatabaseName("ix_site_user_sessions_user_expires");
        });
    }

    private static void ConfigureInventoryCategories(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryCategoryEntity>(entity =>
        {
            entity.ToTable("categories", "inventory");
            entity.HasKey(category => category.Id);

            entity.Property(category => category.Id).HasColumnName("id");
            entity.Property(category => category.ParentId).HasColumnName("parent_id");
            entity.Property(category => category.LegacyId).HasColumnName("legacy_id");
            entity.Property(category => category.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(category => category.IsArchived).HasColumnName("is_archived");
            entity.Property(category => category.CreatedAt).HasColumnName("created_at");

            entity.HasOne(category => category.Parent)
                .WithMany(category => category.Children)
                .HasForeignKey(category => category.ParentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(category => new { category.ParentId, category.Name })
                .IsUnique()
                .HasDatabaseName("ux_inventory_categories_parent_name");

            entity.HasIndex(category => category.LegacyId)
                .HasDatabaseName("ix_inventory_categories_legacy_id");
        });
    }

    private static void ConfigureInventoryUnits(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryUnitEntity>(entity =>
        {
            entity.ToTable("units", "inventory");
            entity.HasKey(unit => unit.Id);

            entity.Property(unit => unit.Id).HasColumnName("id");
            entity.Property(unit => unit.LegacyId).HasColumnName("legacy_id");
            entity.Property(unit => unit.Name).HasColumnName("name").HasMaxLength(80).IsRequired();
            entity.Property(unit => unit.Symbol).HasColumnName("symbol").HasMaxLength(24).IsRequired();

            entity.HasIndex(unit => unit.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_units_name");

            entity.HasIndex(unit => unit.Symbol)
                .IsUnique()
                .HasDatabaseName("ux_inventory_units_symbol");

            entity.HasIndex(unit => unit.LegacyId)
                .HasDatabaseName("ix_inventory_units_legacy_id");
        });
    }

    private static void ConfigureInventoryItems(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryItemEntity>(entity =>
        {
            entity.ToTable("items", "inventory");
            entity.HasKey(item => item.Id);

            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.LegacyId).HasColumnName("legacy_id");
            entity.Property(item => item.Name).HasColumnName("name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.Sku).HasColumnName("sku").HasMaxLength(140).IsRequired();
            entity.Property(item => item.CategoryId).HasColumnName("category_id");
            entity.Property(item => item.UnitId).HasColumnName("unit_id");
            entity.Property(item => item.ItemKind).HasColumnName("item_kind").HasMaxLength(140).IsRequired();
            entity.Property(item => item.NormItemName).HasColumnName("norm_item_name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.ActualItemName).HasColumnName("actual_item_name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.BrandName).HasColumnName("brand_name").HasMaxLength(140).IsRequired();
            entity.Property(item => item.ModelName).HasColumnName("model_name").HasMaxLength(140).IsRequired();
            entity.Property(item => item.Article).HasColumnName("article").HasMaxLength(140).IsRequired();
            entity.Property(item => item.ProtectionClass).HasColumnName("protection_class").HasMaxLength(140).IsRequired();
            entity.Property(item => item.ClothingSize).HasColumnName("clothing_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.HeightSize).HasColumnName("height_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.ShoeSize).HasColumnName("shoe_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.HeadSize).HasColumnName("head_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.GloveSize).HasColumnName("glove_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.RespiratorSize).HasColumnName("respirator_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.DefaultLifeMonths).HasColumnName("default_life_months");
            entity.Property(item => item.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.Property(item => item.MinStockQty).HasColumnName("min_stock_qty").HasPrecision(12, 3);
            entity.Property(item => item.IsConsumable).HasColumnName("is_consumable");
            entity.Property(item => item.TrackLife).HasColumnName("track_life");
            entity.Property(item => item.TrackingType).HasColumnName("tracking_type").HasMaxLength(40).IsRequired();
            entity.Property(item => item.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(item => item.IsActive).HasColumnName("is_active");
            entity.Property(item => item.CreatedAt).HasColumnName("created_at");

            entity.HasOne(item => item.Category)
                .WithMany(category => category.Items)
                .HasForeignKey(item => item.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(item => item.Unit)
                .WithMany(unit => unit.Items)
                .HasForeignKey(item => item.UnitId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(item => item.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_items_name");

            entity.HasIndex(item => item.Sku).HasDatabaseName("ix_inventory_items_sku");
            entity.HasIndex(item => item.CategoryId).HasDatabaseName("ix_inventory_items_category_id");
            entity.HasIndex(item => item.LegacyId).HasDatabaseName("ix_inventory_items_legacy_id");
            entity.HasIndex(item => item.IsActive).HasDatabaseName("ix_inventory_items_is_active");
        });
    }

    private static void ConfigureInventoryWarehouses(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryWarehouseEntity>(entity =>
        {
            entity.ToTable("warehouses", "inventory");
            entity.HasKey(warehouse => warehouse.Id);

            entity.Property(warehouse => warehouse.Id).HasColumnName("id");
            entity.Property(warehouse => warehouse.LegacyId).HasColumnName("legacy_id");
            entity.Property(warehouse => warehouse.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(warehouse => warehouse.IsDefault).HasColumnName("is_default");
            entity.Property(warehouse => warehouse.IsArchived).HasColumnName("is_archived");

            entity.HasIndex(warehouse => warehouse.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_warehouses_name");

            entity.HasIndex(warehouse => warehouse.LegacyId)
                .HasDatabaseName("ix_inventory_warehouses_legacy_id");
        });
    }

    private static void ConfigureInventoryStockMoves(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryStockMoveEntity>(entity =>
        {
            entity.ToTable("stock_moves", "inventory");
            entity.HasKey(move => move.Id);

            entity.Property(move => move.Id).HasColumnName("id");
            entity.Property(move => move.LegacyId).HasColumnName("legacy_id");
            entity.Property(move => move.ItemId).HasColumnName("item_id");
            entity.Property(move => move.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(move => move.QuantityDelta).HasColumnName("qty_delta").HasPrecision(12, 3);
            entity.Property(move => move.MovedAt).HasColumnName("moved_at");
            entity.Property(move => move.EmployeeId).HasColumnName("employee_id");
            entity.Property(move => move.MoveType).HasColumnName("move_type").HasMaxLength(60).IsRequired();
            entity.Property(move => move.ReferenceType).HasColumnName("reference_type").HasMaxLength(80).IsRequired();
            entity.Property(move => move.ReferenceId).HasColumnName("reference_id");
            entity.Property(move => move.CustodyRecordId).HasColumnName("custody_record_id");
            entity.Property(move => move.PpeCardLineId).HasColumnName("ppe_card_line_id");

            entity.HasOne(move => move.Item)
                .WithMany(item => item.StockMoves)
                .HasForeignKey(move => move.ItemId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(move => move.Warehouse)
                .WithMany(warehouse => warehouse.StockMoves)
                .HasForeignKey(move => move.WarehouseId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(move => move.Employee)
                .WithMany()
                .HasForeignKey(move => move.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(move => move.CustodyRecord)
                .WithMany(record => record.StockMoves)
                .HasForeignKey(move => move.CustodyRecordId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(move => move.PpeCardLine)
                .WithMany(line => line.StockMoves)
                .HasForeignKey(move => move.PpeCardLineId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(move => new { move.ItemId, move.MovedAt })
                .HasDatabaseName("ix_inventory_stock_moves_item_moved");

            entity.HasIndex(move => new { move.WarehouseId, move.MovedAt })
                .HasDatabaseName("ix_inventory_stock_moves_warehouse_moved");

            entity.HasIndex(move => new { move.ItemId, move.WarehouseId, move.MoveType })
                .HasDatabaseName("ix_inventory_stock_moves_item_warehouse_type");

            entity.HasIndex(move => move.LegacyId)
                .HasDatabaseName("ix_inventory_stock_moves_legacy_id");

            entity.HasIndex(move => move.CustodyRecordId)
                .HasDatabaseName("ix_inventory_stock_moves_custody_record_id");

            entity.HasIndex(move => move.PpeCardLineId)
                .HasDatabaseName("ix_inventory_stock_moves_ppe_card_line_id");
        });
    }

    private static void ConfigureInventoryWorkflow(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryCustodyCategoryEntity>(entity =>
        {
            entity.ToTable("custody_categories", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsArchived).HasColumnName("is_archived");
            entity.HasIndex(row => row.Name).IsUnique().HasDatabaseName("ux_inventory_custody_categories_name");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_categories_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyDocumentEntity>(entity =>
        {
            entity.ToTable("custody_documents", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Number).HasColumnName("number").HasMaxLength(80).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ClosedAt).HasColumnName("closed_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => row.Number).IsUnique().HasDatabaseName("ux_inventory_custody_documents_number");
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_inventory_custody_documents_employee_status");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_documents_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyRecordEntity>(entity =>
        {
            entity.ToTable("custody_records", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.DocumentId).HasColumnName("document_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.IssuedAt).HasColumnName("issued_at");
            entity.Property(row => row.ClosedAt).HasColumnName("closed_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Document).WithMany(document => document.Records).HasForeignKey(row => row.DocumentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Warehouse).WithMany().HasForeignKey(row => row.WarehouseId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_inventory_custody_records_employee_status");
            entity.HasIndex(row => row.DocumentId).HasDatabaseName("ix_inventory_custody_records_document_id");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_records_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyRecordEventEntity>(entity =>
        {
            entity.ToTable("custody_record_events", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.RecordId).HasColumnName("record_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Record).WithMany(record => record.Events).HasForeignKey(row => row.RecordId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.RecordId, row.CreatedAt }).HasDatabaseName("ix_inventory_custody_events_record_created");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_events_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeCardEntity>(entity =>
        {
            entity.ToTable("ppe_cards", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.Position).HasColumnName("position").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Gender).HasColumnName("gender").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Height).HasColumnName("height").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ClothingSize).HasColumnName("clothing_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ShoeSize).HasColumnName("shoe_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.HeadSize).HasColumnName("head_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.RespiratorSize).HasColumnName("respirator_size").HasMaxLength(120).IsRequired();
            entity.Property(row => row.HandProtectionSize).HasColumnName("hand_protection_size").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.NormSetId).HasColumnName("norm_set_id");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.NormSet).WithMany().HasForeignKey(row => row.NormSetId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ArchivedAt }).HasDatabaseName("ix_inventory_ppe_cards_employee_archived");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_cards_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeCardLineEntity>(entity =>
        {
            entity.ToTable("ppe_card_lines", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.CardId).HasColumnName("card_id");
            entity.Property(row => row.CardNormRowId).HasColumnName("card_norm_row_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.UnitPriceMinor).HasColumnName("unit_price_minor");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.IssuedAt).HasColumnName("issued_at");
            entity.Property(row => row.DueAt).HasColumnName("due_at");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.PrintItemName).HasColumnName("print_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text");
            entity.Property(row => row.IsSectionTitle).HasColumnName("is_section_title").HasDefaultValue(false);
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.IssueMethod).HasColumnName("issue_method").HasMaxLength(40).IsRequired();
            entity.Property(row => row.SizeText).HasColumnName("size_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.ReturnedAt).HasColumnName("returned_at");
            entity.Property(row => row.ReturnedQuantity).HasColumnName("returned_quantity").HasPrecision(12, 3);
            entity.Property(row => row.WriteOffActDate).HasColumnName("write_off_act_date");
            entity.Property(row => row.WriteOffActNumber).HasColumnName("write_off_act_number").HasMaxLength(120).IsRequired();
            entity.HasOne(row => row.Card).WithMany(card => card.Lines).HasForeignKey(row => row.CardId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.CardNormRow).WithMany(row => row.Issues).HasForeignKey(row => row.CardNormRowId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Warehouse).WithMany().HasForeignKey(row => row.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.CardId, row.Status }).HasDatabaseName("ix_inventory_ppe_lines_card_status");
            entity.HasIndex(row => row.CardNormRowId).HasDatabaseName("ix_inventory_ppe_lines_card_norm_row");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_lines_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeNormSetEntity>(entity =>
        {
            entity.ToTable("ppe_norm_sets", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(200).IsRequired();
            entity.Property(row => row.VersionName).HasColumnName("version_name").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EffectiveFrom).HasColumnName("effective_from");
            entity.Property(row => row.EffectiveTo).HasColumnName("effective_to");
            entity.Property(row => row.SourceName).HasColumnName("source_name").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.RequiresReview).HasColumnName("requires_review");
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasIndex(row => new { row.PositionName, row.Status }).HasDatabaseName("ix_inventory_ppe_norm_sets_position_status");
            entity.HasIndex(row => new { row.PositionName, row.VersionName }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_sets_position_version");
        });

        modelBuilder.Entity<InventoryPpeNormRowEntity>(entity =>
        {
            entity.ToTable("ppe_norm_rows", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.NormSetId).HasColumnName("norm_set_id");
            entity.Property(row => row.ParentRowId).HasColumnName("parent_row_id");
            entity.Property(row => row.RowType).HasColumnName("row_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.HasOne(row => row.NormSet).WithMany(set => set.Rows).HasForeignKey(row => row.NormSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.ParentRow).WithMany(row => row.Children).HasForeignKey(row => row.ParentRowId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.NormSetId, row.SortOrder }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_rows_set_order");
            entity.HasIndex(row => row.ParentRowId).HasDatabaseName("ix_inventory_ppe_norm_rows_parent");
        });

        modelBuilder.Entity<InventoryPpeNormCatalogMappingEntity>(entity =>
        {
            entity.ToTable("ppe_norm_catalog_mappings", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.NormRowId).HasColumnName("norm_row_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.Property(row => row.IsDefault).HasColumnName("is_default");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.NormRow).WithMany(row => row.Mappings).HasForeignKey(row => row.NormRowId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.NormRowId, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_mapping_row_item");
            entity.HasIndex(row => row.ItemId).HasDatabaseName("ix_inventory_ppe_norm_mapping_item");
            entity.HasIndex(row => row.ArchivedAt).HasDatabaseName("ix_inventory_ppe_norm_mapping_archived");
        });

        modelBuilder.Entity<InventoryPpeCardNormRowEntity>(entity =>
        {
            entity.ToTable("ppe_card_norm_rows", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.CardId).HasColumnName("card_id");
            entity.Property(row => row.SourceNormRowId).HasColumnName("source_norm_row_id");
            entity.Property(row => row.ParentRowId).HasColumnName("parent_row_id");
            entity.Property(row => row.MappedItemId).HasColumnName("mapped_item_id");
            entity.Property(row => row.RowType).HasColumnName("row_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.HasOne(row => row.Card).WithMany(card => card.NormRows).HasForeignKey(row => row.CardId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.SourceNormRow).WithMany().HasForeignKey(row => row.SourceNormRowId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ParentRow).WithMany(row => row.Children).HasForeignKey(row => row.ParentRowId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.MappedItem).WithMany().HasForeignKey(row => row.MappedItemId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.CardId, row.SortOrder }).IsUnique().HasDatabaseName("ux_inventory_ppe_card_norm_rows_card_order");
            entity.HasIndex(row => row.ParentRowId).HasDatabaseName("ix_inventory_ppe_card_norm_rows_parent");
        });

        modelBuilder.Entity<InventoryPpeCardLineEventEntity>(entity =>
        {
            entity.ToTable("ppe_card_line_events", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.LineId).HasColumnName("line_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Line).WithMany(line => line.Events).HasForeignKey(row => row.LineId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.LineId, row.CreatedAt }).HasDatabaseName("ix_inventory_ppe_events_line_created");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_events_legacy_id");
        });

        ConfigureSimpleInventoryEntity<InventoryPpeIssueTemplateEntity>(modelBuilder, "ppe_issue_templates");
        ConfigureSimpleInventoryEntity<InventoryReturnReasonEntity>(modelBuilder, "return_reasons");
        ConfigureSimpleInventoryEntity<InventoryWriteOffReasonEntity>(modelBuilder, "write_off_reasons");

        modelBuilder.Entity<InventoryItemSetEntity>(entity =>
        {
            entity.ToTable("item_sets", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsArchived).HasColumnName("is_archived");
            entity.HasIndex(row => row.Name).IsUnique().HasDatabaseName("ux_inventory_item_sets_name");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_item_sets_legacy_id");
        });

        modelBuilder.Entity<InventoryItemSetItemEntity>(entity =>
        {
            entity.ToTable("item_set_items", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ItemSetId).HasColumnName("item_set_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.HasOne(row => row.ItemSet).WithMany(set => set.Items).HasForeignKey(row => row.ItemSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.ItemSetId, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_item_set_items_set_item");
        });

        modelBuilder.Entity<InventoryPositionNormEntity>(entity =>
        {
            entity.ToTable("position_norms", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(500).HasDefaultValue("");
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(240).HasDefaultValue("");
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(160).HasDefaultValue("");
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(80).HasDefaultValue("");
            entity.Property(row => row.IsSectionTitle).HasColumnName("is_section_title").HasDefaultValue(false);
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PositionName, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_position_norms_position_item");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_position_norms_legacy_id");
        });

        modelBuilder.Entity<InventoryPositionItemSetMapEntity>(entity =>
        {
            entity.ToTable("position_item_set_maps", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ItemSetId).HasColumnName("item_set_id");
            entity.HasOne(row => row.ItemSet).WithMany().HasForeignKey(row => row.ItemSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.PositionName, row.ItemSetId }).IsUnique().HasDatabaseName("ux_inventory_position_item_sets_position_set");
        });

        modelBuilder.Entity<InventorySystemLogEntity>(entity =>
        {
            entity.ToTable("system_log", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EntityType).HasColumnName("entity_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.EntityId).HasColumnName("entity_id");
            entity.Property(row => row.Action).HasColumnName("action").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Details).HasColumnName("details").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => new { row.EntityType, row.CreatedAt }).HasDatabaseName("ix_inventory_system_log_entity_created");
            entity.HasIndex(row => row.CreatedAt).HasDatabaseName("ix_inventory_system_log_created_at");
            entity.HasIndex(row => row.Action).HasDatabaseName("ix_inventory_system_log_action");
            entity.HasIndex(row => row.Actor).HasDatabaseName("ix_inventory_system_log_actor");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_system_log_legacy_id");
        });

        modelBuilder.Entity<InventoryExportJobEntity>(entity =>
        {
            entity.ToTable("export_jobs", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ReportId).HasColumnName("report_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Format).HasColumnName("format").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.DownloadName).HasColumnName("download_name").HasMaxLength(260).IsRequired();
            entity.Property(row => row.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => new { row.ReportId, row.CreatedAt }).HasDatabaseName("ix_inventory_export_jobs_report_created");
        });

        modelBuilder.Entity<InventoryLegacyImportRunEntity>(entity =>
        {
            entity.ToTable("legacy_import_runs", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.DryRun).HasColumnName("dry_run");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.CompletedAt).HasColumnName("completed_at");
            entity.Property(row => row.TablesScanned).HasColumnName("tables_scanned");
            entity.Property(row => row.RowsRead).HasColumnName("rows_read");
            entity.Property(row => row.RowsInserted).HasColumnName("rows_inserted");
            entity.Property(row => row.RowsUpdated).HasColumnName("rows_updated");
            entity.Property(row => row.RowsSkipped).HasColumnName("rows_skipped");
            entity.Property(row => row.Error).HasColumnName("error").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.StockChecksum).HasColumnName("stock_checksum").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.TablesJson).HasColumnName("tables_json").HasColumnType("jsonb").IsRequired();
            entity.HasIndex(row => row.CreatedAt).HasDatabaseName("ix_inventory_legacy_import_runs_created");
        });

        modelBuilder.Entity<InventoryEmployeeLegacyLinkEntity>(entity =>
        {
            entity.ToTable("employee_legacy_links", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.SourceKey).HasColumnName("source_key").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.SourceKey, row.LegacyId }).IsUnique().HasDatabaseName("ux_inventory_employee_legacy_links_source_legacy");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_inventory_employee_legacy_links_employee");
        });

        modelBuilder.Entity<InventoryUserLegacyLinkEntity>(entity =>
        {
            entity.ToTable("user_legacy_links", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.UserId).HasColumnName("user_id");
            entity.Property(row => row.SourceKey).HasColumnName("source_key").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.User).WithMany().HasForeignKey(row => row.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.SourceKey, row.LegacyId }).IsUnique().HasDatabaseName("ux_inventory_user_legacy_links_source_legacy");
            entity.HasIndex(row => row.UserId).HasDatabaseName("ix_inventory_user_legacy_links_user");
        });
    }

    private static void ConfigureEmu(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmuWorkSectionEntity>(entity =>
        {
            entity.ToTable("emu_work_sections");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_work_sections_code");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_work_sections_active");
        });

        modelBuilder.Entity<EmuWaitReasonEntity>(entity =>
        {
            entity.ToTable("emu_wait_reasons");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_wait_reasons_code");
        });

        modelBuilder.Entity<EmuNotCompletedReasonEntity>(entity =>
        {
            entity.ToTable("emu_not_completed_reasons");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_not_completed_reasons_code");
        });

        modelBuilder.Entity<EmuWorkTemplateEntity>(entity =>
        {
            entity.ToTable("emu_work_templates");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(180).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_work_templates_active");
        });

        modelBuilder.Entity<EmuFavoriteEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_favorite_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => row.EmployeeId).IsUnique().HasDatabaseName("ux_emu_favorite_employees_employee");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_favorite_employees_active");
        });

        modelBuilder.Entity<EmuShiftTemplateEntity>(entity =>
        {
            entity.ToTable("emu_shift_templates");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.StartTime).HasColumnName("start_time");
            entity.Property(row => row.EndTime).HasColumnName("end_time");
            entity.Property(row => row.LunchStartTime).HasColumnName("lunch_start_time");
            entity.Property(row => row.LunchEndTime).HasColumnName("lunch_end_time");
            entity.Property(row => row.CrossesMidnight).HasColumnName("crosses_midnight");
            entity.Property(row => row.IsActive).HasColumnName("is_active");
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => row.Code).IsUnique().HasDatabaseName("ux_emu_shift_templates_code");
            entity.HasIndex(row => row.IsActive).HasDatabaseName("ix_emu_shift_templates_active");
        });

        modelBuilder.Entity<EmuEmployeeShiftEntity>(entity =>
        {
            entity.ToTable("emu_employee_shifts");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.ShiftDate).HasColumnName("shift_date");
            entity.Property(row => row.TemplateId).HasColumnName("template_id");
            entity.Property(row => row.ShiftType).HasColumnName("shift_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.PlannedStartAt).HasColumnName("planned_start_at");
            entity.Property(row => row.PlannedEndAt).HasColumnName("planned_end_at");
            entity.Property(row => row.ActualStartAt).HasColumnName("actual_start_at");
            entity.Property(row => row.ActualEndAt).HasColumnName("actual_end_at");
            entity.Property(row => row.LunchStartAt).HasColumnName("lunch_start_at");
            entity.Property(row => row.LunchEndAt).HasColumnName("lunch_end_at");
            entity.Property(row => row.LunchTaken).HasColumnName("lunch_taken");
            entity.Property(row => row.LunchOverridden).HasColumnName("lunch_overridden");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.Reason).HasColumnName("reason").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.AdjustedByUserId).HasColumnName("adjusted_by_user_id");
            entity.Property(row => row.AdjustedByName).HasColumnName("adjusted_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.AdjustedAt).HasColumnName("adjusted_at");
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Template).WithMany().HasForeignKey(row => row.TemplateId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.AdjustedByUser).WithMany().HasForeignKey(row => row.AdjustedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ShiftDate }).IsUnique().HasDatabaseName("ux_emu_employee_shifts_employee_date");
            entity.HasIndex(row => row.ShiftDate).HasDatabaseName("ix_emu_employee_shifts_date");
            entity.HasIndex(row => row.Source).HasDatabaseName("ix_emu_employee_shifts_source");
        });

        modelBuilder.Entity<EmuWorkPlanTaskEntity>(entity =>
        {
            entity.ToTable("emu_work_plan_tasks");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Description).HasColumnName("description").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.PlannedDate).HasColumnName("planned_date");
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ApprovalStatus).HasColumnName("approval_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Priority).HasColumnName("priority").HasMaxLength(40).IsRequired();
            entity.Property(row => row.IsRecurring).HasColumnName("is_recurring");
            entity.Property(row => row.RecurrenceRule).HasColumnName("recurrence_rule").HasMaxLength(200).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ApprovedByUserId).HasColumnName("approved_by_user_id");
            entity.Property(row => row.ApprovedAt).HasColumnName("approved_at");
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ApprovedByUser).WithMany().HasForeignKey(row => row.ApprovedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PlannedDate).HasDatabaseName("ix_emu_plan_tasks_planned_date");
            entity.HasIndex(row => row.ApprovalStatus).HasDatabaseName("ix_emu_plan_tasks_approval_status");
        });

        modelBuilder.Entity<EmuWorkPlanTaskEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_plan_task_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.HasOne(row => row.PlanTask).WithMany(task => task.Employees).HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PlanTaskId, row.EmployeeId }).IsUnique().HasDatabaseName("ux_emu_plan_task_employees_task_employee");
        });

        modelBuilder.Entity<EmuWorkSessionEntity>(entity =>
        {
            entity.ToTable("emu_work_sessions");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkNumber).HasColumnName("work_number").HasMaxLength(40).IsRequired();
            entity.Property(row => row.WorkDate).HasColumnName("work_date");
            entity.Property(row => row.SectionId).HasColumnName("section_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.TaskDescription).HasColumnName("task_description").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ResultStatus).HasColumnName("result_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ResultComment).HasColumnName("result_comment").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.NotCompletedReasonId).HasColumnName("not_completed_reason_id");
            entity.Property(row => row.ArrivedAt).HasColumnName("arrived_at");
            entity.Property(row => row.CompletedAt).HasColumnName("completed_at");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.Property(row => row.DeletedAt).HasColumnName("deleted_at");
            entity.Property(row => row.DeletedByUserId).HasColumnName("deleted_by_user_id");
            entity.Property(row => row.DeleteReason).HasColumnName("delete_reason").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.WorkMinutes).HasColumnName("work_minutes");
            entity.Property(row => row.WaitingMinutes).HasColumnName("waiting_minutes");
            entity.Property(row => row.OtherWorkMinutes).HasColumnName("other_work_minutes");
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.Property(row => row.IsCarriedOver).HasColumnName("is_carried_over");
            entity.HasOne(row => row.Section).WithMany().HasForeignKey(row => row.SectionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.NotCompletedReason).WithMany().HasForeignKey(row => row.NotCompletedReasonId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.DeletedByUser).WithMany().HasForeignKey(row => row.DeletedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.WorkNumber).IsUnique().HasDatabaseName("ux_emu_work_sessions_number");
            entity.HasIndex(row => row.WorkDate).HasDatabaseName("ix_emu_work_sessions_work_date");
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_emu_work_sessions_status");
            entity.HasIndex(row => row.Source).HasDatabaseName("ix_emu_work_sessions_source");
            entity.HasIndex(row => row.DeletedAt).HasDatabaseName("ix_emu_work_sessions_deleted_at");
        });

        modelBuilder.Entity<EmuWorkSessionEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_session_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.FullNameSnapshot).HasColumnName("full_name_snapshot").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PositionSnapshot).HasColumnName("position_snapshot").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ArrivedAt).HasColumnName("arrived_at");
            entity.Property(row => row.FinishedAt).HasColumnName("finished_at");
            entity.Property(row => row.WorkMinutes).HasColumnName("work_minutes");
            entity.Property(row => row.WaitingMinutes).HasColumnName("waiting_minutes");
            entity.Property(row => row.OtherWorkMinutes).HasColumnName("other_work_minutes");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.Employees).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_emu_work_session_employees_employee_status");
        });

        modelBuilder.Entity<EmuWorkParticipationIntervalEntity>(entity =>
        {
            entity.ToTable("emu_work_participation_intervals");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.WorkSessionEmployeeId).HasColumnName("work_session_employee_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Reason).HasColumnName("reason").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.Property(row => row.CreatedByName).HasColumnName("created_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.WorkSessionEmployee).WithMany(row => row.ParticipationIntervals).HasForeignKey(row => row.WorkSessionEmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.WorkSessionId, row.StartedAt }).HasDatabaseName("ix_emu_participation_session_started");
            entity.HasIndex(row => new { row.EmployeeId, row.StartedAt }).HasDatabaseName("ix_emu_participation_employee_started");
            entity.HasIndex(row => new { row.WorkSessionEmployeeId, row.EndedAt }).HasDatabaseName("ix_emu_participation_participant_ended");
        });

        modelBuilder.Entity<EmuWorkPauseEntity>(entity =>
        {
            entity.ToTable("emu_work_pauses");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.WaitReasonId).HasColumnName("wait_reason_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1400).IsRequired();
            entity.Property(row => row.IsOtherWork).HasColumnName("is_other_work");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.Pauses).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.WaitReason).WithMany().HasForeignKey(row => row.WaitReasonId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.WorkSessionId, row.StartedAt }).HasDatabaseName("ix_emu_work_pauses_session_started");
        });

        modelBuilder.Entity<EmuWorkPauseEmployeeEntity>(entity =>
        {
            entity.ToTable("emu_work_pause_employees");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PauseId).HasColumnName("pause_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.HasOne(row => row.Pause).WithMany(pause => pause.Employees).HasForeignKey(row => row.PauseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PauseId, row.EmployeeId }).IsUnique().HasDatabaseName("ux_emu_work_pause_employees_pause_employee");
        });

        modelBuilder.Entity<EmuWorkSessionCarryOverEntity>(entity =>
        {
            entity.ToTable("emu_work_session_carry_overs");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.FromDate).HasColumnName("from_date");
            entity.Property(row => row.ToDate).HasColumnName("to_date");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.WorkSessionId, row.ToDate }).IsUnique().HasDatabaseName("ux_emu_work_carry_overs_session_date");
        });

        modelBuilder.Entity<EmuWorkAuditEventEntity>(entity =>
        {
            entity.ToTable("emu_work_audit_events");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(120).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(2400).IsRequired();
            entity.Property(row => row.ActorUserId).HasColumnName("actor_user_id");
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(220).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.WorkSession).WithMany(session => session.AuditEvents).HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.ActorUser).WithMany().HasForeignKey(row => row.ActorUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.WorkSessionId, row.CreatedAt }).HasDatabaseName("ix_emu_audit_session_created");
            entity.HasIndex(row => new { row.PlanTaskId, row.CreatedAt }).HasDatabaseName("ix_emu_audit_plan_created");
        });

        modelBuilder.Entity<EmuDecisionEntity>(entity =>
        {
            entity.ToTable("emu_decisions");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.DecisionType).HasColumnName("decision_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Severity).HasColumnName("severity").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.ShiftDate).HasColumnName("shift_date");
            entity.Property(row => row.DetectedAt).HasColumnName("detected_at");
            entity.Property(row => row.ResolvedAt).HasColumnName("resolved_at");
            entity.Property(row => row.ResolvedByUserId).HasColumnName("resolved_by_user_id");
            entity.Property(row => row.ResolvedByName).HasColumnName("resolved_by_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.Resolution).HasColumnName("resolution").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1600).IsRequired();
            entity.Property(row => row.RowVersion).HasColumnName("row_version");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ResolvedByUser).WithMany().HasForeignKey(row => row.ResolvedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.DedupeKey).IsUnique().HasDatabaseName("ux_emu_decisions_dedupe_key");
            entity.HasIndex(row => new { row.Status, row.Severity }).HasDatabaseName("ix_emu_decisions_status_severity");
            entity.HasIndex(row => new { row.EmployeeId, row.ShiftDate }).HasDatabaseName("ix_emu_decisions_employee_shift");
            entity.HasIndex(row => row.WorkSessionId).HasDatabaseName("ix_emu_decisions_work_session");
        });

        modelBuilder.Entity<EmuNotificationEntity>(entity =>
        {
            entity.ToTable("emu_notifications");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.WorkSessionId).HasColumnName("work_session_id");
            entity.Property(row => row.PlanTaskId).HasColumnName("plan_task_id");
            entity.Property(row => row.Title).HasColumnName("title").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.NotificationType).HasColumnName("notification_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Severity).HasColumnName("severity").HasMaxLength(40).IsRequired();
            entity.Property(row => row.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(180).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ResolvedAt).HasColumnName("resolved_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.WorkSession).WithMany().HasForeignKey(row => row.WorkSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.PlanTask).WithMany().HasForeignKey(row => row.PlanTaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_emu_notifications_status");
            entity.HasIndex(row => row.DedupeKey).IsUnique().HasDatabaseName("ux_emu_notifications_dedupe_key");
        });
    }

    private static void ConfigureSimpleInventoryEntity<TEntity>(ModelBuilder modelBuilder, string tableName)
        where TEntity : class
    {
        modelBuilder.Entity<TEntity>(entity =>
        {
            entity.ToTable(tableName, "inventory");
            entity.HasKey("Id");
            entity.Property<Guid>("Id").HasColumnName("id");
            entity.Property<int?>("LegacyId").HasColumnName("legacy_id");
            entity.Property<string>("Name").HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property<bool>("IsArchived").HasColumnName("is_archived");
            entity.HasIndex("Name").IsUnique().HasDatabaseName($"ux_inventory_{tableName}_name");
            entity.HasIndex("LegacyId").HasDatabaseName($"ix_inventory_{tableName}_legacy_id");
        });
    }

    private static void ConfigurePerco(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PercoIntegrationSettingsEntity>(entity =>
        {
            entity.ToTable("perco_integration_settings");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.IsEnabled).HasColumnName("is_enabled");
            entity.Property(row => row.AuthMode).HasColumnName("auth_mode").HasMaxLength(40).IsRequired();
            entity.Property(row => row.BaseUrl).HasColumnName("base_url").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Username).HasColumnName("username").HasMaxLength(160).IsRequired();
            entity.Property(row => row.PasswordEncrypted).HasColumnName("password_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.TokenEncrypted).HasColumnName("token_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.SessionTokenEncrypted).HasColumnName("session_token_encrypted").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.SessionTokenExpiresAt).HasColumnName("session_token_expires_at");
            entity.Property(row => row.Timezone).HasColumnName("timezone").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeesSyncMinutes).HasColumnName("employees_sync_minutes");
            entity.Property(row => row.EventsSyncMinutes).HasColumnName("events_sync_minutes");
            entity.Property(row => row.ShiftStartToleranceMinutes).HasColumnName("shift_start_tolerance_minutes");
            entity.Property(row => row.ShiftEndToleranceMinutes).HasColumnName("shift_end_tolerance_minutes");
            entity.Property(row => row.DevPath).HasColumnName("dev_path").HasMaxLength(200).IsRequired();
            entity.Property(row => row.EmployeesEndpoint).HasColumnName("employees_endpoint").HasMaxLength(300).IsRequired();
            entity.Property(row => row.EventsEndpoint).HasColumnName("events_endpoint").HasMaxLength(300).IsRequired();
            entity.Property(row => row.LastDiscoverySummary).HasColumnName("last_discovery_summary").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.LastConnectionCheckAt).HasColumnName("last_connection_check_at");
            entity.Property(row => row.LastConnectionStatus).HasColumnName("last_connection_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastConnectionError).HasColumnName("last_connection_error").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.LastApiSecretCheckAt).HasColumnName("last_api_secret_check_at");
            entity.Property(row => row.LastApiSecretStatus).HasColumnName("last_api_secret_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastApiSecretError).HasColumnName("last_api_secret_error").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.LastWorkerSecretCheckAt).HasColumnName("last_worker_secret_check_at");
            entity.Property(row => row.LastWorkerSecretStatus).HasColumnName("last_worker_secret_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastWorkerSecretError).HasColumnName("last_worker_secret_error").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<PercoIntegrationLogEntity>(entity =>
        {
            entity.ToTable("perco_integration_logs");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.Operation).HasColumnName("operation").HasMaxLength(80).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Message).HasColumnName("message").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Details).HasColumnName("details").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.FinishedAt).HasColumnName("finished_at");
            entity.Property(row => row.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.HasOne(row => row.CreatedByUser).WithMany().HasForeignKey(row => row.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.Operation).HasDatabaseName("ix_perco_logs_operation");
            entity.HasIndex(row => row.StartedAt).HasDatabaseName("ix_perco_logs_started");
            entity.HasIndex(row => row.Status).HasDatabaseName("ix_perco_logs_status");
        });

        modelBuilder.Entity<PercoSyncStateEntity>(entity =>
        {
            entity.ToTable("perco_sync_state");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.SyncType).HasColumnName("sync_type").HasMaxLength(40).IsRequired();
            entity.Property(row => row.LastSuccessAt).HasColumnName("last_success_at");
            entity.Property(row => row.LastCursor).HasColumnName("last_cursor").HasMaxLength(1000).IsRequired();
            entity.Property(row => row.LastError).HasColumnName("last_error").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(row => row.SyncType).IsUnique().HasDatabaseName("ux_perco_sync_state_type");
        });

        modelBuilder.Entity<PercoEmployeeLinkEntity>(entity =>
        {
            entity.ToTable("perco_employee_links");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PercoEmployeeId).HasColumnName("perco_employee_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.FullName).HasColumnName("full_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.PersonnelNo).HasColumnName("personnel_no").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CardNumber).HasColumnName("card_number").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Department).HasColumnName("department").HasMaxLength(220).IsRequired();
            entity.Property(row => row.MatchedByUserId).HasColumnName("matched_by_user_id");
            entity.Property(row => row.MatchedAt).HasColumnName("matched_at");
            entity.Property(row => row.MatchStatus).HasColumnName("match_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.MatchedByUser).WithMany().HasForeignKey(row => row.MatchedByUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PercoEmployeeId).IsUnique().HasDatabaseName("ux_perco_employee_links_perco_id");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_perco_employee_links_employee");
            entity.HasIndex(row => row.MatchStatus).HasDatabaseName("ix_perco_employee_links_status");
        });

        modelBuilder.Entity<PercoAccessEventEntity>(entity =>
        {
            entity.ToTable("perco_access_events");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PercoEventId).HasColumnName("perco_event_id").HasMaxLength(160).IsRequired();
            entity.Property(row => row.PercoEmployeeId).HasColumnName("perco_employee_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.DeviceId).HasColumnName("device_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.DeviceName).HasColumnName("device_name").HasMaxLength(220).IsRequired();
            entity.Property(row => row.Direction).HasColumnName("direction").HasMaxLength(40).IsRequired();
            entity.Property(row => row.EventAt).HasColumnName("event_at");
            entity.Property(row => row.RawPayload).HasColumnName("raw_payload").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => row.PercoEventId).IsUnique().HasDatabaseName("ux_perco_access_events_perco_event_id");
            entity.HasIndex(row => row.EventAt).HasDatabaseName("ix_perco_access_events_event_at");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_perco_access_events_employee");
        });

        modelBuilder.Entity<EmployeePresenceIntervalEntity>(entity =>
        {
            entity.ToTable("employee_presence_intervals");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.OpenedByEventId).HasColumnName("opened_by_event_id");
            entity.Property(row => row.ClosedByEventId).HasColumnName("closed_by_event_id");
            entity.Property(row => row.StartedAt).HasColumnName("started_at");
            entity.Property(row => row.EndedAt).HasColumnName("ended_at");
            entity.Property(row => row.DurationMinutes).HasColumnName("duration_minutes");
            entity.Property(row => row.Source).HasColumnName("source").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.OpenedByEvent).WithMany().HasForeignKey(row => row.OpenedByEventId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ClosedByEvent).WithMany().HasForeignKey(row => row.ClosedByEventId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.StartedAt }).HasDatabaseName("ix_presence_intervals_employee_started");
            entity.HasIndex(row => row.EndedAt).HasDatabaseName("ix_presence_intervals_ended");
        });
    }
}
