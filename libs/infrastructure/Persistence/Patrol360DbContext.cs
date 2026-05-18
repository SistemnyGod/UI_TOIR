using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class Patrol360DbContext(DbContextOptions<Patrol360DbContext> options) : DbContext(options)
{
    public DbSet<RouteEntity> Routes => Set<RouteEntity>();

    public DbSet<RoutePointEntity> RoutePoints => Set<RoutePointEntity>();

    public DbSet<EmployeeEntity> Employees => Set<EmployeeEntity>();

    public DbSet<PatrolRequestEntity> PatrolRequests => Set<PatrolRequestEntity>();

    public DbSet<AssignmentEntity> Assignments => Set<AssignmentEntity>();

    public DbSet<MobileAccountEntity> MobileAccounts => Set<MobileAccountEntity>();

    public DbSet<MobileAccountAuditEventEntity> MobileAccountAuditEvents => Set<MobileAccountAuditEventEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureRoutes(modelBuilder);
        ConfigureRoutePoints(modelBuilder);
        ConfigureEmployees(modelBuilder);
        ConfigurePatrolRequests(modelBuilder);
        ConfigureAssignments(modelBuilder);
        ConfigureMobileAccounts(modelBuilder);
        ConfigureMobileAccountAuditEvents(modelBuilder);
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
            entity.Property(route => route.VersionNo).HasColumnName("version_no");
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

            entity.HasIndex(point => point.NfcCode).HasDatabaseName("ix_route_points_nfc_code");
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
            entity.Property(employee => employee.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
            entity.Property(employee => employee.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(employee => employee.HasMobileAccount).HasColumnName("has_mobile_account");
            entity.Property(employee => employee.LastSeenAt).HasColumnName("last_seen_at");

            entity.HasIndex(employee => employee.PersonnelNo)
                .IsUnique()
                .HasDatabaseName("ux_employees_personnel_no");

            entity.HasIndex(employee => employee.Status).HasDatabaseName("ix_employees_status");
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
            entity.Property(request => request.ScheduledDate).HasColumnName("scheduled_date");
            entity.Property(request => request.ScheduledTime).HasColumnName("scheduled_time");
            entity.Property(request => request.NotifyEmployee).HasColumnName("notify_employee");
            entity.Property(request => request.NotificationText).HasColumnName("notification_text").HasMaxLength(1000).IsRequired();
            entity.Property(request => request.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
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

            entity.HasIndex(request => request.Number)
                .IsUnique()
                .HasDatabaseName("ux_patrol_requests_number");

            entity.HasIndex(request => request.Status).HasDatabaseName("ix_patrol_requests_status");
            entity.HasIndex(request => request.ScheduledDate).HasDatabaseName("ix_patrol_requests_scheduled_date");
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
            entity.Property(assignment => assignment.EmployeeId).HasColumnName("employee_id");
            entity.Property(assignment => assignment.Shift).HasColumnName("shift").HasMaxLength(40).IsRequired();
            entity.Property(assignment => assignment.Status).HasColumnName("status").HasMaxLength(60).IsRequired();
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

            entity.HasOne(assignment => assignment.Employee)
                .WithMany(employee => employee.Assignments)
                .HasForeignKey(assignment => assignment.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(assignment => new { assignment.EmployeeId, assignment.Status })
                .HasDatabaseName("ix_assignments_employee_status");

            entity.HasIndex(assignment => assignment.RouteId).HasDatabaseName("ix_assignments_route_id");
            entity.HasIndex(assignment => assignment.PlannedAt).HasDatabaseName("ix_assignments_planned_at");
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
            entity.Property(auditEvent => auditEvent.CreatedAt).HasColumnName("created_at");

            entity.HasIndex(auditEvent => new { auditEvent.MobileAccountId, auditEvent.CreatedAt })
                .HasDatabaseName("ix_mobile_account_audit_account_created");
            entity.HasIndex(auditEvent => auditEvent.Action)
                .HasDatabaseName("ix_mobile_account_audit_action");
        });
    }
}
