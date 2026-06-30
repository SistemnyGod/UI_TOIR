using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class Patrol360DbSeeder(Patrol360DbContext dbContext, IConfiguration configuration)
{
    private static readonly Guid PerimeterRouteId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid FuelDepotRouteId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid WarehouseRouteId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid PerimeterMainGatePointId = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");
    private static readonly Guid PerimeterTp4PointId = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly Guid WarehouseGatePointId = Guid.Parse("dddddddd-0000-0000-0000-000000000001");

    private static readonly Guid IvanovEmployeeId = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid PetrovEmployeeId = Guid.Parse("aaaaaaaa-2222-2222-2222-222222222222");
    private static readonly Guid SidorovEmployeeId = Guid.Parse("aaaaaaaa-3333-3333-3333-333333333333");
    private static readonly Guid[] DemoRouteIds = [PerimeterRouteId, FuelDepotRouteId, WarehouseRouteId];
    private static readonly Guid[] DemoEmployeeIds = [IvanovEmployeeId, PetrovEmployeeId, SidorovEmployeeId];
    private static readonly Guid[] DemoRequestIds =
    [
        Guid.Parse("99999999-0000-0000-0000-000000000001"),
        Guid.Parse("99999999-0000-0000-0000-000000000002"),
        Guid.Parse("99999999-0000-0000-0000-000000000003")
    ];
    private static readonly Guid[] DemoAssignmentIds =
    [
        Guid.Parse("eeeeeeee-0000-0000-0000-000000000001"),
        Guid.Parse("eeeeeeee-0000-0000-0000-000000000002")
    ];
    private static readonly Guid[] DemoResultIds =
    [
        Guid.Parse("77777777-0000-0000-0000-000000000001"),
        Guid.Parse("77777777-0000-0000-0000-000000000002"),
        Guid.Parse("77777777-0000-0000-0000-000000000003")
    ];
    private static readonly Guid AdminUserId = Guid.Parse("aaaaaaaa-9999-9999-9999-999999999999");
    private static readonly Guid AdminRoleId = Guid.Parse("bbbbbbbb-9999-9999-9999-999999999999");
    private static readonly Guid OperatorRoleId = Guid.Parse("bbbbbbbb-8888-8888-8888-888888888888");
    private static readonly Guid AuditorRoleId = Guid.Parse("bbbbbbbb-7777-7777-7777-777777777777");
    private static readonly Guid ManagerRoleId = Guid.Parse("bbbbbbbb-6666-6666-6666-666666666666");
    private static readonly Guid InventoryAccountantRoleId = Guid.Parse("bbbbbbbb-5555-5555-5555-555555555555");
    private static readonly Guid InventoryWarehouseOperatorRoleId = Guid.Parse("bbbbbbbb-4444-4444-4444-444444444444");
    private static readonly Guid EmuOperatorRoleId = Guid.Parse("bbbbbbbb-3333-3333-3333-333333333333");

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var seedDemoData = string.Equals(
            configuration["Patrol360:SeedDemoData"],
            "true",
            StringComparison.OrdinalIgnoreCase);
        var removeLegacyDemoOperationalData = string.Equals(
            configuration["Patrol360:RemoveLegacyDemoOperationalData"],
            "true",
            StringComparison.OrdinalIgnoreCase);

        if (seedDemoData)
        {
            if (!await dbContext.Routes.AnyAsync(cancellationToken))
            {
                dbContext.Routes.AddRange(CreateRoutes(now));
                dbContext.Employees.AddRange(CreateEmployees(now));
                dbContext.PatrolRequests.AddRange(CreatePatrolRequests(now));
                dbContext.Assignments.AddRange(CreateAssignments(now));
            }

            if (!await dbContext.PatrolResults.AnyAsync(cancellationToken))
            {
                dbContext.PatrolResults.AddRange(CreatePatrolResults(now));
            }
        }
        else if (removeLegacyDemoOperationalData)
        {
            await RemoveLegacyDemoOperationalDataAsync(cancellationToken);
        }

        if (!await dbContext.SiteUsers.AnyAsync(cancellationToken))
        {
            SeedAuth(now);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await NormalizeAuthSeedLabelsAsync(cancellationToken);
        await NormalizeTechnicalEmployeeRowsAsync(cancellationToken);
        await EnsureAccountingEmployeeSeedDataAsync(now, cancellationToken);
        await EnsureEmuSeedDataAsync(now, cancellationToken);
        await EnsureInventorySeedDataAsync(now, cancellationToken);
        await EnsurePercoSeedDataAsync(cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task RemoveLegacyDemoOperationalDataAsync(CancellationToken cancellationToken)
    {
        await dbContext.PatrolResultAttachments
            .Where(attachment => DemoResultIds.Contains(attachment.PatrolResultId))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.PatrolResultIssues
            .Where(issue => DemoResultIds.Contains(issue.PatrolResultId))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.PatrolResults
            .Where(result => DemoResultIds.Contains(result.Id))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Assignments
            .Where(assignment => DemoAssignmentIds.Contains(assignment.Id))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.PatrolRequests
            .Where(request => DemoRequestIds.Contains(request.Id))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.MobileAccountEmployeeBindings
            .Where(binding => DemoEmployeeIds.Contains(binding.EmployeeId))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Employees
            .Where(employee =>
                DemoEmployeeIds.Contains(employee.Id)
                && !dbContext.Assignments.Any(assignment => assignment.EmployeeId == employee.Id))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.RoutePoints
            .Where(point =>
                DemoRouteIds.Contains(point.RouteId)
                && !dbContext.Assignments.Any(assignment => assignment.RouteId == point.RouteId))
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Routes
            .Where(route =>
                DemoRouteIds.Contains(route.Id)
                && !dbContext.Assignments.Any(assignment => assignment.RouteId == route.Id))
            .ExecuteDeleteAsync(cancellationToken);
    }

    private async Task NormalizeAuthSeedLabelsAsync(CancellationToken cancellationToken)
    {
        var roleNames = new Dictionary<Guid, string>
        {
            [AdminRoleId] = "Администратор",
            [OperatorRoleId] = "Оператор",
            [AuditorRoleId] = "Аудитор",
            [ManagerRoleId] = "Руководитель",
            [EmuOperatorRoleId] = "Оператор ЭМУ"
        };

        foreach (var (id, name) in roleNames)
        {
            var role = await dbContext.Roles.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);
            if (role is not null)
            {
                role.Name = name;
            }
        }

        var permissionNames = CreateCleanPermissionNames();
        foreach (var (id, name) in permissionNames)
        {
            var permission = await dbContext.Permissions.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);
            if (permission is not null)
            {
                permission.Name = name;
            }
        }

        var adminUser = await dbContext.SiteUsers.FirstOrDefaultAsync(row => row.Id == AdminUserId, cancellationToken);
        if (adminUser is not null)
        {
            adminUser.DisplayName = "Администратор";
        }
    }

    private async Task NormalizeTechnicalEmployeeRowsAsync(CancellationToken cancellationToken)
    {
        var legacyIds = await dbContext.InventoryEmployeeLegacyLinks
            .AsNoTracking()
            .ToDictionaryAsync(link => link.EmployeeId, link => link.LegacyId, cancellationToken);

        var employees = await dbContext.Employees
            .Where(employee =>
                employee.FullName.StartsWith("Legacy employee ")
                || employee.FullName.StartsWith("PPE E2E ")
                || employee.FullName.StartsWith("SMOKE CHECK ")
                || employee.PersonnelNo.StartsWith("legacy-"))
            .ToListAsync(cancellationToken);

        foreach (var employee in employees)
        {
            var displayNo = legacyIds.TryGetValue(employee.Id, out var legacyId)
                ? legacyId.ToString()
                : ExtractLegacyNumber(employee.PersonnelNo) ?? employee.Id.ToString("N")[..8];

            employee.FullName = $"Сотрудник учета №{displayNo}";
            if (employee.PersonnelNo.StartsWith("legacy-", StringComparison.OrdinalIgnoreCase))
            {
                employee.PersonnelNo = $"УЧ-{displayNo}";
            }

            employee.Position = string.IsNullOrWhiteSpace(employee.Position) ? "Сотрудник учета" : employee.Position;
            employee.Department = string.IsNullOrWhiteSpace(employee.Department) ? "Бухгалтерия" : employee.Department;
            employee.Shift = string.IsNullOrWhiteSpace(employee.Shift) ? "День" : employee.Shift;
            if (string.IsNullOrWhiteSpace(employee.Status) || employee.Status.Equals("active", StringComparison.OrdinalIgnoreCase))
            {
                employee.Status = "Активен";
            }
        }
    }

    private async Task EnsureAccountingEmployeeSeedDataAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var seeds = LoadAccountingEmployeeSeeds();
        if (seeds.Count == 0)
        {
            AddAccountingEmployeeReferenceIfMissing("group", "Атом", now);
            AddAccountingEmployeeReferenceIfMissing("group", "Атом Экология", now);
            return;
        }

        foreach (var value in seeds.Select(seed => seed.Position).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            AddAccountingEmployeeReferenceIfMissing("position", value, now);
        }

        foreach (var value in seeds.Select(seed => seed.Department).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            AddAccountingEmployeeReferenceIfMissing("department", value, now);
        }

        AddAccountingEmployeeReferenceIfMissing("group", "Атом", now);
        AddAccountingEmployeeReferenceIfMissing("group", "Атом Экология", now);
        foreach (var value in seeds.Select(seed => seed.EmployeeGroup).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            AddAccountingEmployeeReferenceIfMissing("group", value, now);
        }

        var existingEmployees = await dbContext.Employees.ToListAsync(cancellationToken);
        var existingByPersonnelNo = existingEmployees
            .ToDictionary(employee => employee.PersonnelNo, StringComparer.OrdinalIgnoreCase);
        var existingByFullName = existingEmployees
            .Where(employee => !string.IsNullOrWhiteSpace(employee.FullName))
            .GroupBy(employee => NormalizeEmployeeFullName(employee.FullName), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var existingIds = existingByPersonnelNo.Values.Select(employee => employee.Id).ToHashSet();

        foreach (var seed in seeds)
        {
            var personnelNo = seed.PersonnelNo.Trim();
            if (personnelNo.Length == 0)
            {
                continue;
            }

            if (existingByPersonnelNo.TryGetValue(personnelNo, out var existing))
            {
                if (string.IsNullOrWhiteSpace(existing.FullName))
                {
                    existing.FullName = seed.FullName;
                }

                if (string.IsNullOrWhiteSpace(existing.Position))
                {
                    existing.Position = seed.Position;
                }

                if (string.IsNullOrWhiteSpace(existing.Department))
                {
                    existing.Department = seed.Department;
                }

                if (string.IsNullOrWhiteSpace(existing.EmployeeGroup))
                {
                    existing.EmployeeGroup = seed.EmployeeGroup;
                }

                existing.HiredAt ??= seed.HiredAt;
                existing.BirthDate ??= seed.BirthDate;
                var existingFullNameKey = NormalizeEmployeeFullName(existing.FullName);
                if (existingFullNameKey.Length > 0)
                {
                    existingByFullName.TryAdd(existingFullNameKey, existing);
                }
                continue;
            }

            var fullNameKey = NormalizeEmployeeFullName(seed.FullName);
            if (fullNameKey.Length > 0 && existingByFullName.TryGetValue(fullNameKey, out existing))
            {
                if (string.IsNullOrWhiteSpace(existing.Position))
                {
                    existing.Position = seed.Position;
                }

                if (string.IsNullOrWhiteSpace(existing.Department))
                {
                    existing.Department = seed.Department;
                }

                if (string.IsNullOrWhiteSpace(existing.EmployeeGroup))
                {
                    existing.EmployeeGroup = seed.EmployeeGroup;
                }

                existing.HiredAt ??= seed.HiredAt;
                existing.BirthDate ??= seed.BirthDate;
                existingByPersonnelNo.TryAdd(personnelNo, existing);
                continue;
            }

            var employeeId = existingIds.Contains(seed.Id) ? Guid.NewGuid() : seed.Id;
            existingIds.Add(employeeId);
            var employee = new EmployeeEntity
            {
                Id = employeeId,
                FullName = seed.FullName,
                PersonnelNo = personnelNo,
                Position = seed.Position,
                Department = seed.Department,
                EmployeeGroup = seed.EmployeeGroup,
                HiredAt = seed.HiredAt,
                BirthDate = seed.BirthDate,
                Status = "Активен",
                Shift = "День",
                HasMobileAccount = false,
                LastSeenAt = now
            };

            dbContext.Employees.Add(employee);
            existingByPersonnelNo[personnelNo] = employee;
            if (fullNameKey.Length > 0)
            {
                existingByFullName[fullNameKey] = employee;
            }
        }
    }

    private static string NormalizeEmployeeFullName(string value)
    {
        var parts = value.Trim().Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts).ToLowerInvariant();
    }

    private static IReadOnlyList<AccountingEmployeeSeed> LoadAccountingEmployeeSeeds()
    {
        var candidatePaths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Persistence", "SeedData", "accounting-employees.json"),
            Path.Combine(AppContext.BaseDirectory, "SeedData", "accounting-employees.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "libs", "infrastructure", "Persistence", "SeedData", "accounting-employees.json")
        };
        var path = candidatePaths.FirstOrDefault(File.Exists);
        if (path is null)
        {
            return [];
        }

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<AccountingEmployeeSeed>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? [];
    }

    private void AddAccountingEmployeeReferenceIfMissing(string kind, string name, DateTimeOffset now)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
        {
            return;
        }

        var existsInLocal = dbContext.AccountingEmployeeReferences.Local.Any(reference =>
            reference.Kind == kind && reference.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase));
        if (existsInLocal || dbContext.AccountingEmployeeReferences.Any(reference => reference.Kind == kind && reference.Name.ToLower() == normalized.ToLower()))
        {
            return;
        }

        dbContext.AccountingEmployeeReferences.Add(new AccountingEmployeeReferenceEntity
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            Name = normalized,
            CreatedAt = now
        });
    }

    private async Task EnsureEmuSeedDataAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var expectedPermissions = CreatePermissions().Concat(CreateEmuPermissions()).ToArray();
        var existingPermissionCodes = await dbContext.Permissions
            .Select(permission => permission.Code)
            .ToListAsync(cancellationToken);

        foreach (var permission in expectedPermissions.Where(permission => !existingPermissionCodes.Contains(permission.Code, StringComparer.OrdinalIgnoreCase)))
        {
            dbContext.Permissions.Add(permission);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        await EnsureRoleExistsAsync(EmuOperatorRoleId, "emu_operator", "Оператор ЭМУ", now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        var permissions = await dbContext.Permissions.ToListAsync(cancellationToken);
        await EnsureRolePermissionsAsync(AdminRoleId, permissions.Select(permission => permission.Code).ToArray(), cancellationToken);
        await EnsureRolePermissionsAsync(ManagerRoleId, [
            "routes.read",
            "employees.read",
            "requests.read",
            "assignments.read",
            "emu.view",
            "emu.work-accounting.view",
            "emu.dashboard.view",
            "emu.history.view",
            "emu.work.create",
            "emu.work.update",
            "emu.work.pause",
            "emu.work.complete",
            "emu.work.delete",
            "emu.completed.delete",
            "emu.directories.manage",
            "emu.favorite-employees.manage",
            "emu.plan.view",
            "emu.plan.manage",
            "emu.plan.approve",
            "emu.plan.override-approval",
            "emu.plan.recurrence.manage",
            "emu.reports.view",
            "emu.reports.export",
            "emu.time.override",
            "emu.audit.view",
            "emu.shift.adjust",
            "emu.decision.resolve"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(OperatorRoleId, [
            "routes.read",
            "employees.read",
            "requests.read",
            "assignments.read",
            "emu.view",
            "emu.work-accounting.view",
            "emu.dashboard.view",
            "emu.work.create",
            "emu.work.update",
            "emu.work.pause",
            "emu.work.complete",
            "emu.favorite-employees.manage",
            "emu.plan.view",
            "emu.plan.manage",
            "emu.plan.recurrence.manage",
            "emu.time.override",
            "emu.audit.view",
            "emu.shift.adjust",
            "emu.decision.resolve"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(AuditorRoleId, [
            "routes.read",
            "employees.read",
            "requests.read",
            "assignments.read",
            "emu.view",
            "emu.work-accounting.view",
            "emu.history.view",
            "emu.reports.view",
            "emu.reports.export",
            "emu.audit.view"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(EmuOperatorRoleId, [
            "emu.view",
            "emu.work-accounting.view",
            "emu.work.create",
            "emu.work.update",
            "emu.work.pause",
            "emu.work.complete",
            "emu.favorite-employees.manage",
            "emu.shift.adjust",
            "emu.decision.resolve"
        ], cancellationToken);

        if (!await dbContext.EmuWorkSections.AnyAsync(row => row.Code == "prochee", cancellationToken))
        {
            dbContext.EmuWorkSections.Add(new EmuWorkSectionEntity
            {
                Id = Guid.Parse("22222222-0000-0000-0000-000000000001"),
                Name = "Прочее",
                Code = "prochee",
                Description = "Работы без привязки к участку",
                SortOrder = 0,
                CreatedAt = now
            });
        }

        AddWaitReasonIfMissing("net-oborudovaniya", "Нет оборудования", 10, now);
        AddWaitReasonIfMissing("net-materialov", "Нет материалов", 20, now);
        AddWaitReasonIfMissing("drugie-raboty", "Отправлены на другие работы", 30, now);
        AddWaitReasonIfMissing("polomka", "Поломка", 40, now);
        AddWaitReasonIfMissing("prochee", "Прочее", 50, now);

        AddNotCompletedReasonIfMissing("net-oborudovaniya", "Нет оборудования", 10, now);
        AddNotCompletedReasonIfMissing("net-materialov", "Нет материалов", 20, now);
        AddNotCompletedReasonIfMissing("ne-uspeli", "Не успели", 30, now);
        AddNotCompletedReasonIfMissing("drugie-raboty", "Отправлены на другие работы", 40, now);
        AddNotCompletedReasonIfMissing("otmeneno-rukovoditelem", "Отменено руководителем", 50, now);
        AddNotCompletedReasonIfMissing("pereneseno", "Перенесено", 60, now);
        AddNotCompletedReasonIfMissing("polomka", "Поломка", 70, now);
        AddNotCompletedReasonIfMissing("prochee", "Прочее", 80, now);
        SeedEmuShiftTemplates(now);
    }


    private async Task EnsureInventorySeedDataAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var expectedPermissions = CreateInventoryPermissions();
        var existingPermissionCodes = await dbContext.Permissions
            .Select(permission => permission.Code)
            .ToListAsync(cancellationToken);

        foreach (var permission in expectedPermissions.Where(permission => !existingPermissionCodes.Contains(permission.Code, StringComparer.OrdinalIgnoreCase)))
        {
            dbContext.Permissions.Add(permission);
        }

        await EnsureRoleExistsAsync(InventoryAccountantRoleId, "inventory_accountant", "Бухгалтер Inventory", now, cancellationToken);
        await EnsureRoleExistsAsync(InventoryWarehouseOperatorRoleId, "inventory_warehouse_operator", "Оператор склада Inventory", now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        var allPermissionCodes = await dbContext.Permissions
            .Select(permission => permission.Code)
            .ToListAsync(cancellationToken);
        var inventoryAll = CreateInventoryPermissions().Select(permission => permission.Code).ToArray();

        await EnsureRolePermissionsAsync(AdminRoleId, allPermissionCodes, cancellationToken);
        await EnsureRolePermissionsAsync(ManagerRoleId, inventoryAll, cancellationToken);
        await EnsureRolePermissionsAsync(InventoryAccountantRoleId, [
            "inventory.view",
            "inventory.stock.view",
            "inventory.issue.manage",
            "inventory.custody.manage",
            "inventory.ppe.manage",
            "inventory.reports.view",
            "inventory.reports.export",
            "inventory.audit.view"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(InventoryWarehouseOperatorRoleId, [
            "inventory.view",
            "inventory.stock.view",
            "inventory.issue.manage"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(OperatorRoleId, [
            "inventory.view",
            "inventory.stock.view",
            "inventory.issue.manage"
        ], cancellationToken);
        await EnsureRolePermissionsAsync(AuditorRoleId, [
            "inventory.view",
            "inventory.reports.view",
            "inventory.reports.export",
            "inventory.audit.view"
        ], cancellationToken);

        AddAccountingEmployeeReferenceIfMissing("group", "Атом", now);
        AddAccountingEmployeeReferenceIfMissing("group", "Атом Экология", now);
    }

    private async Task EnsureRoleExistsAsync(Guid id, string code, string name, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var role = await dbContext.Roles.FirstOrDefaultAsync(row => row.Id == id || row.Code == code, cancellationToken);
        if (role is not null)
        {
            role.Code = code;
            role.Name = name;
            return;
        }

        dbContext.Roles.Add(new RoleEntity
        {
            Id = id,
            Code = code,
            Name = name
        });
    }

    private async Task EnsurePercoSeedDataAsync(CancellationToken cancellationToken)
    {
        var expectedPermissions = CreatePercoPermissions();
        var existingPermissionCodes = await dbContext.Permissions
            .Select(permission => permission.Code)
            .ToListAsync(cancellationToken);

        foreach (var permission in expectedPermissions.Where(permission => !existingPermissionCodes.Contains(permission.Code, StringComparer.OrdinalIgnoreCase)))
        {
            dbContext.Permissions.Add(permission);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var allPermissionCodes = await dbContext.Permissions
            .Select(permission => permission.Code)
            .ToListAsync(cancellationToken);
        await EnsureRolePermissionsAsync(AdminRoleId, allPermissionCodes, cancellationToken);
    }

    private async Task EnsureRolePermissionsAsync(Guid roleId, IReadOnlyList<string> permissionCodes, CancellationToken cancellationToken)
    {
        var role = await dbContext.Roles.FirstOrDefaultAsync(row => row.Id == roleId, cancellationToken)
            ?? await dbContext.Roles.FirstOrDefaultAsync(row => row.Code == RoleCodeForSeedId(roleId), cancellationToken);
        if (role is null)
        {
            return;
        }

        var permissionIds = await dbContext.Permissions
            .Where(permission => permissionCodes.Contains(permission.Code))
            .Select(permission => permission.Id)
            .ToListAsync(cancellationToken);
        var existingPermissionIds = await dbContext.RolePermissions
            .Where(row => row.RoleId == role.Id)
            .Select(row => row.PermissionId)
            .ToListAsync(cancellationToken);

        foreach (var permissionId in permissionIds.Where(permissionId => !existingPermissionIds.Contains(permissionId)))
        {
            dbContext.RolePermissions.Add(new RolePermissionEntity
            {
                RoleId = role.Id,
                PermissionId = permissionId
            });
        }
    }

    private static string RoleCodeForSeedId(Guid roleId) =>
        roleId == AdminRoleId ? "admin"
        : roleId == OperatorRoleId ? "operator"
        : roleId == AuditorRoleId ? "auditor"
        : roleId == ManagerRoleId ? "manager"
        : roleId == InventoryAccountantRoleId ? "inventory_accountant"
        : roleId == InventoryWarehouseOperatorRoleId ? "inventory_warehouse_operator"
        : roleId == EmuOperatorRoleId ? "emu_operator"
        : string.Empty;

    private void AddWaitReasonIfMissing(string code, string name, int sortOrder, DateTimeOffset now)
    {
        if (dbContext.EmuWaitReasons.Local.Any(row => row.Code == code) || dbContext.EmuWaitReasons.Any(row => row.Code == code))
        {
            return;
        }

        dbContext.EmuWaitReasons.Add(new EmuWaitReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        });
    }

    private void AddNotCompletedReasonIfMissing(string code, string name, int sortOrder, DateTimeOffset now)
    {
        if (dbContext.EmuNotCompletedReasons.Local.Any(row => row.Code == code) || dbContext.EmuNotCompletedReasons.Any(row => row.Code == code))
        {
            return;
        }

        dbContext.EmuNotCompletedReasons.Add(new EmuNotCompletedReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        });
    }

    private void SeedEmuShiftTemplates(DateTimeOffset now)
    {
        AddShiftTemplateIfMissing("day", "Day shift", "day", "08:00", "17:00", "12:00", "13:00", false, 10, now);
        AddShiftTemplateIfMissing("day11", "11-hour shift", "day11", "08:00", "20:00", "12:00", "13:00", false, 20, now);
        AddShiftTemplateIfMissing("night", "Night shift", "night", "20:00", "08:00", "00:00", "01:00", true, 30, now);
    }

    private void AddShiftTemplateIfMissing(
        string code,
        string name,
        string shiftType,
        string start,
        string end,
        string lunchStart,
        string lunchEnd,
        bool crossesMidnight,
        int sortOrder,
        DateTimeOffset now)
    {
        if (dbContext.EmuShiftTemplates.Local.Any(row => row.Code == code) || dbContext.EmuShiftTemplates.Any(row => row.Code == code))
        {
            return;
        }

        dbContext.EmuShiftTemplates.Add(new EmuShiftTemplateEntity
        {
            Id = Guid.NewGuid(),
            Code = code,
            Name = name,
            ShiftType = shiftType,
            StartTime = TimeOnly.Parse(start),
            EndTime = TimeOnly.Parse(end),
            LunchStartTime = TimeOnly.Parse(lunchStart),
            LunchEndTime = TimeOnly.Parse(lunchEnd),
            CrossesMidnight = crossesMidnight,
            SortOrder = sortOrder,
            CreatedAt = now
        });
    }

    private static string? ExtractLegacyNumber(string value)
    {
        const string Prefix = "legacy-";
        return value.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)
            ? value[Prefix.Length..]
            : null;
    }

    private void SeedAuth(DateTimeOffset now)
    {
        var permissions = CreatePermissions();
        var adminRole = new RoleEntity
        {
            Id = AdminRoleId,
            Code = "admin",
            Name = "Администратор",
            Permissions = permissions.Select(permission => new RolePermissionEntity
            {
                RoleId = AdminRoleId,
                PermissionId = permission.Id,
                Permission = permission
            }).ToList()
        };
        var operatorRole = CreateRole(
            OperatorRoleId,
            "operator",
            "Оператор",
            permissions,
            [
                "dashboard.read",
                "routes.read",
                "employees.read",
                "requests.read",
                "assignments.read",
                "requests.write",
                "assignments.write",
                "mobile_accounts.write",
                "results.read",
                "emu.view",
                "emu.work.create",
                "emu.work.update",
                "emu.work.pause",
                "emu.work.complete",
                "emu.favorite-employees.manage",
                "emu.plan.view",
                "emu.plan.manage",
                "emu.plan.recurrence.manage",
                "emu.time.override",
                "emu.audit.view"
            ]);
        var auditorRole = CreateRole(
            AuditorRoleId,
            "auditor",
            "Аудитор",
            permissions,
            ["dashboard.read", "routes.read", "employees.read", "requests.read", "assignments.read", "results.read", "emu.view", "emu.reports.view", "emu.audit.view"]);
        var managerRole = CreateRole(
            ManagerRoleId,
            "manager",
            "Руководитель",
            permissions,
            [
                "dashboard.read",
                "routes.read",
                "employees.read",
                "requests.read",
                "assignments.read",
                "routes.write",
                "employees.write",
                "requests.write",
                "assignments.write",
                "schedule.write",
                "results.read",
                "emu.view",
                "emu.work.create",
                "emu.work.update",
                "emu.work.pause",
                "emu.work.complete",
                "emu.work.delete",
                "emu.directories.manage",
                "emu.favorite-employees.manage",
                "emu.plan.view",
                "emu.plan.manage",
                "emu.plan.approve",
                "emu.plan.override-approval",
                "emu.plan.recurrence.manage",
                "emu.reports.view",
                "emu.time.override",
                "emu.audit.view"
            ]);

        var adminUser = new SiteUserEntity
        {
            Id = AdminUserId,
            Login = "admin",
            NormalizedLogin = EfAuthSessionService.NormalizeLogin("admin"),
            DisplayName = "Администратор",
            Status = "active",
            CreatedAt = now
        };
        adminUser.PasswordHash = new PasswordHasher<SiteUserEntity>().HashPassword(adminUser, "Patrol360!");
        adminUser.Roles.Add(new SiteUserRoleEntity
        {
            SiteUserId = adminUser.Id,
            RoleId = adminRole.Id,
            Role = adminRole
        });

        dbContext.Permissions.AddRange(permissions);
        dbContext.Roles.AddRange(adminRole, operatorRole, auditorRole, managerRole);
        dbContext.SiteUsers.Add(adminUser);
    }

    private static RoleEntity CreateRole(
        Guid id,
        string code,
        string name,
        IReadOnlyList<PermissionEntity> permissions,
        IReadOnlyList<string> permissionCodes) =>
        new()
        {
            Id = id,
            Code = code,
            Name = name,
            Permissions = permissions
                .Where(permission => permissionCodes.Contains(permission.Code, StringComparer.OrdinalIgnoreCase))
                .Select(permission => new RolePermissionEntity
                {
                    RoleId = id,
                    PermissionId = permission.Id,
                    Permission = permission
                })
                .ToList()
        };

    private static PermissionEntity[] CreatePermissions() =>
    [
        CreatePermission("11111111-9999-9999-9999-999999999901", "dashboard.read", "Просмотр дашборда"),
        CreatePermission("11111111-9999-9999-9999-999999999902", "routes.write", "Управление маршрутами"),
        CreatePermission("11111111-9999-9999-9999-999999999903", "employees.write", "Управление сотрудниками"),
        CreatePermission("11111111-9999-9999-9999-999999999904", "requests.write", "Управление заявками"),
        CreatePermission("11111111-9999-9999-9999-999999999905", "assignments.write", "Управление назначениями"),
        CreatePermission("11111111-9999-9999-9999-999999999906", "mobile_accounts.write", "Управление мобильными аккаунтами"),
        CreatePermission("11111111-9999-9999-9999-999999999907", "site_users.write", "Управление пользователями сайта"),
        CreatePermission("11111111-9999-9999-9999-999999999908", "schedule.write", "Управление плановым обходом"),
        CreatePermission("11111111-9999-9999-9999-999999999909", "results.read", "Просмотр результатов обходов"),
        CreatePermission("11111111-9999-9999-9999-999999999910", "routes.read", "Просмотр маршрутов"),
        CreatePermission("11111111-9999-9999-9999-999999999911", "employees.read", "Просмотр сотрудников"),
        CreatePermission("11111111-9999-9999-9999-999999999912", "requests.read", "Просмотр заявок на обход"),
        CreatePermission("11111111-9999-9999-9999-999999999913", "assignments.read", "Просмотр назначений")
    ];

    private static IReadOnlyDictionary<Guid, string> CreateCleanPermissionNames() =>
        new Dictionary<Guid, string>
        {
            [Guid.Parse("11111111-9999-9999-9999-999999999901")] = "Просмотр дашборда",
            [Guid.Parse("11111111-9999-9999-9999-999999999902")] = "Управление маршрутами",
            [Guid.Parse("11111111-9999-9999-9999-999999999903")] = "Управление сотрудниками",
            [Guid.Parse("11111111-9999-9999-9999-999999999904")] = "Управление заявками",
            [Guid.Parse("11111111-9999-9999-9999-999999999905")] = "Управление назначениями",
            [Guid.Parse("11111111-9999-9999-9999-999999999906")] = "Управление мобильными аккаунтами",
            [Guid.Parse("11111111-9999-9999-9999-999999999907")] = "Управление пользователями сайта",
            [Guid.Parse("11111111-9999-9999-9999-999999999908")] = "Управление плановым обходом",
            [Guid.Parse("11111111-9999-9999-9999-999999999909")] = "Просмотр результатов обходов",
            [Guid.Parse("11111111-9999-9999-9999-999999999910")] = "Просмотр маршрутов",
            [Guid.Parse("11111111-9999-9999-9999-999999999911")] = "Просмотр сотрудников",
            [Guid.Parse("11111111-9999-9999-9999-999999999912")] = "Просмотр заявок на обход",
            [Guid.Parse("11111111-9999-9999-9999-999999999913")] = "Просмотр назначений"
        };

    private static PermissionEntity[] CreateEmuPermissions() =>
    [
        CreatePermission("11111111-9999-9999-9999-999999999920", "emu.view", "Просмотр ЭМУ"),
        CreatePermission("11111111-9999-9999-9999-999999999921", "emu.work.create", "ЭМУ: создание работ"),
        CreatePermission("11111111-9999-9999-9999-999999999922", "emu.work.update", "ЭМУ: изменение работ"),
        CreatePermission("11111111-9999-9999-9999-999999999923", "emu.work.pause", "ЭМУ: пауза и продолжение работ"),
        CreatePermission("11111111-9999-9999-9999-999999999924", "emu.work.complete", "ЭМУ: завершение работ"),
        CreatePermission("11111111-9999-9999-9999-999999999925", "emu.work.delete", "ЭМУ: удаление работ"),
        CreatePermission("11111111-9999-9999-9999-999999999926", "emu.directories.manage", "ЭМУ: управление справочниками"),
        CreatePermission("11111111-9999-9999-9999-999999999927", "emu.favorite-employees.manage", "ЭМУ: избранные сотрудники"),
        CreatePermission("11111111-9999-9999-9999-999999999928", "emu.plan.view", "ЭМУ: просмотр плана"),
        CreatePermission("11111111-9999-9999-9999-999999999929", "emu.plan.manage", "ЭМУ: управление планом"),
        CreatePermission("11111111-9999-9999-9999-999999999930", "emu.plan.approve", "ЭМУ: согласование плана"),
        CreatePermission("11111111-9999-9999-9999-999999999931", "emu.plan.override-approval", "ЭМУ: обход согласования"),
        CreatePermission("11111111-9999-9999-9999-999999999932", "emu.plan.recurrence.manage", "ЭМУ: повторяющиеся задачи"),
        CreatePermission("11111111-9999-9999-9999-999999999933", "emu.reports.view", "ЭМУ: отчеты и история"),
        CreatePermission("11111111-9999-9999-9999-999999999934", "emu.time.override", "ЭМУ: ручное изменение времени"),
        CreatePermission("11111111-9999-9999-9999-999999999935", "emu.audit.view", "ЭМУ: просмотр аудита"),
        CreatePermission("11111111-9999-9999-9999-999999999936", "emu.work-accounting.view", "ЭМУ: доступ к учету работ"),
        CreatePermission("11111111-9999-9999-9999-999999999937", "emu.dashboard.view", "ЭМУ: доступ к дашборду"),
        CreatePermission("11111111-9999-9999-9999-999999999938", "emu.history.view", "ЭМУ: доступ к истории выполненных работ"),
        CreatePermission("11111111-9999-9999-9999-999999999939", "emu.completed.delete", "ЭМУ: удаление выполненных работ"),
        CreatePermission("11111111-9999-9999-9999-999999999940", "emu.reports.export", "ЭМУ: экспорт истории и отчетов"),
        CreatePermission("11111111-9999-9999-9999-999999999941", "emu.shift.adjust", "EMU: shift adjust"),
        CreatePermission("11111111-9999-9999-9999-999999999942", "emu.decision.resolve", "EMU: resolve decisions"),
        CreatePermission("11111111-9999-9999-9999-999999999943", "emu.scope.all", "ЭМУ: доступ ко всем участкам")
    ];

    private static PermissionEntity[] CreateInventoryPermissions() =>
    [
        CreatePermission("11111111-9999-9999-9999-999999999950", "inventory.view", "Inventory: просмотр"),
        CreatePermission("11111111-9999-9999-9999-999999999951", "inventory.items.manage", "Inventory: управление номенклатурой и остатками"),
        CreatePermission("11111111-9999-9999-9999-999999999961", "inventory.stock.view", "Inventory: просмотр остатков и движений"),
        CreatePermission("11111111-9999-9999-9999-999999999952", "inventory.issue.manage", "Inventory: выдача, возврат и списание"),
        CreatePermission("11111111-9999-9999-9999-999999999953", "inventory.custody.manage", "Inventory: под запись"),
        CreatePermission("11111111-9999-9999-9999-999999999954", "inventory.ppe.manage", "Inventory: СИЗ"),
        CreatePermission("11111111-9999-9999-9999-999999999955", "inventory.reports.view", "Inventory: просмотр отчетов"),
        CreatePermission("11111111-9999-9999-9999-999999999956", "inventory.reports.export", "Inventory: экспорт отчетов и печатных форм"),
        CreatePermission("11111111-9999-9999-9999-999999999957", "inventory.settings.manage", "Inventory: настройки и справочники"),
        CreatePermission("11111111-9999-9999-9999-999999999958", "inventory.import", "Inventory: импорт данных"),
        CreatePermission("11111111-9999-9999-9999-999999999959", "inventory.audit.view", "Inventory: аудит и история"),
        CreatePermission("11111111-9999-9999-9999-999999999960", "inventory.users.manage", "Inventory: управление правами")
    ];

    private static PermissionEntity[] CreatePercoPermissions() =>
    [
        CreatePermission("11111111-9999-9999-9999-999999999970", "integrations.perco.view", "PERCo-Web: просмотр"),
        CreatePermission("11111111-9999-9999-9999-999999999971", "integrations.perco.manage", "PERCo-Web: настройки подключения"),
        CreatePermission("11111111-9999-9999-9999-999999999972", "integrations.perco.sync", "PERCo-Web: синхронизация"),
        CreatePermission("11111111-9999-9999-9999-999999999973", "integrations.perco.match", "PERCo-Web: сопоставление сотрудников"),
        CreatePermission("11111111-9999-9999-9999-999999999974", "integrations.perco.logs.view", "PERCo-Web: журнал ошибок")
    ];

    private static PermissionEntity CreatePermission(string id, string code, string name) =>
        new()
        {
            Id = Guid.Parse(id),
            Code = code,
            Name = name
        };

    private static RouteEntity[] CreateRoutes(DateTimeOffset now) =>
    [
        new RouteEntity
        {
            Id = PerimeterRouteId,
            Name = "Периметр 1",
            Description = "Внешний обход территории и контроль въездных зон.",
            Territory = "Промзона Север",
            Status = "Активен",
            Duration = "00:45",
            Distance = "2,8 км",
            Periodicity = "По заявке",
            VersionNo = 1,
            CreatedAt = now.AddDays(-10),
            Points =
            [
                CreatePoint("bbbbbbbb-0000-0000-0000-000000000001", PerimeterRouteId, 1, "КПП главный", "NFC-001", true),
                CreatePoint("bbbbbbbb-0000-0000-0000-000000000002", PerimeterRouteId, 2, "ТП-4", "NFC-014", true),
                CreatePoint("bbbbbbbb-0000-0000-0000-000000000003", PerimeterRouteId, 3, "Склад реагентов", "NFC-018", true),
                CreatePoint("bbbbbbbb-0000-0000-0000-000000000004", PerimeterRouteId, 4, "Выход Север", "NFC-021", false)
            ]
        },
        new RouteEntity
        {
            Id = FuelDepotRouteId,
            Name = "Склад ГСМ",
            Description = "Проверка ворот, насосной, склада и состояния периметра ГСМ.",
            Territory = "Промзона Север",
            Status = "Активен",
            Duration = "00:35",
            Distance = "1,6 км",
            Periodicity = "По заявке",
            VersionNo = 1,
            CreatedAt = now.AddDays(-8),
            Points =
            [
                CreatePoint("cccccccc-0000-0000-0000-000000000001", FuelDepotRouteId, 1, "Ворота", "NFC-014", true),
                CreatePoint("cccccccc-0000-0000-0000-000000000002", FuelDepotRouteId, 2, "Насосная", "NFC-033", true),
                CreatePoint("cccccccc-0000-0000-0000-000000000003", FuelDepotRouteId, 3, "Склад", "NFC-041", true)
            ]
        },
        new RouteEntity
        {
            Id = WarehouseRouteId,
            Name = "Складской периметр",
            Description = "Обход складской площадки, ворот, ограждений и контрольных точек.",
            Territory = "Промзона Север",
            Status = "Активен",
            Duration = "00:35",
            Distance = "2,4 км",
            Periodicity = "По заявке",
            VersionNo = 2,
            CreatedAt = now.AddDays(-5),
            Points =
            [
                CreatePoint("dddddddd-0000-0000-0000-000000000001", WarehouseRouteId, 1, "КПП-1", "NFC-101", true),
                CreatePoint("dddddddd-0000-0000-0000-000000000002", WarehouseRouteId, 2, "Проходная B", "NFC-102", true),
                CreatePoint("dddddddd-0000-0000-0000-000000000003", WarehouseRouteId, 3, "КПП-2", "NFC-103", true),
                CreatePoint("dddddddd-0000-0000-0000-000000000004", WarehouseRouteId, 4, "Склад ГСМ", "NFC-014", true)
            ]
        }
    ];

    private static EmployeeEntity[] CreateEmployees(DateTimeOffset now) =>
    [
        new EmployeeEntity
        {
            Id = IvanovEmployeeId,
            FullName = "Иванов Петр Сергеевич",
            PersonnelNo = "10-024",
            Position = "Оператор обхода",
            Department = "Складской периметр",
            Status = "Активен",
            Shift = "День",
            HasMobileAccount = true,
            LastSeenAt = now.AddMinutes(-3)
        },
        new EmployeeEntity
        {
            Id = PetrovEmployeeId,
            FullName = "Петров Иван Александрович",
            PersonnelNo = "10-031",
            Position = "Маршрутный обходчик",
            Department = "Промзона Север",
            Status = "На смене",
            Shift = "День",
            HasMobileAccount = true,
            LastSeenAt = now.AddMinutes(-7)
        },
        new EmployeeEntity
        {
            Id = SidorovEmployeeId,
            FullName = "Сидоров Михаил Викторович",
            PersonnelNo = "10-045",
            Position = "Маршрутный обходчик",
            Department = "Промзона Север",
            Status = "Офлайн",
            Shift = "Ночь",
            HasMobileAccount = false,
            LastSeenAt = now.AddHours(-2)
        }
    ];

    private static PatrolRequestEntity[] CreatePatrolRequests(DateTimeOffset now) =>
    [
        new PatrolRequestEntity
        {
            Id = Guid.Parse("99999999-0000-0000-0000-000000000001"),
            Number = "REQ-20260514-0001",
            EmployeeId = PetrovEmployeeId,
            EmployeeName = "Петров Иван Александрович",
            RouteId = WarehouseRouteId,
            RouteName = "Складской периметр",
            ScheduledDate = DateOnly.FromDateTime(DateTime.Today),
            ScheduledTime = new TimeOnly(10, 55),
            NotifyEmployee = true,
            NotificationText = "Необходимо пройти обход по заявке.",
            Status = "Отправлена",
            CreatedAt = now.AddMinutes(-30),
            Description = "Проверить ворота, ограждения и складскую зону."
        },
        new PatrolRequestEntity
        {
            Id = Guid.Parse("99999999-0000-0000-0000-000000000002"),
            Number = "REQ-20260514-0002",
            EmployeeId = IvanovEmployeeId,
            EmployeeName = "Иванов Петр Сергеевич",
            RouteId = PerimeterRouteId,
            RouteName = "Периметр 1",
            ScheduledDate = DateOnly.FromDateTime(DateTime.Today),
            ScheduledTime = new TimeOnly(11, 20),
            NotifyEmployee = true,
            NotificationText = "Назначен обход периметра.",
            Status = "Назначена",
            CreatedAt = now.AddMinutes(-20),
            Description = "Плановый контроль внешнего периметра."
        },
        new PatrolRequestEntity
        {
            Id = Guid.Parse("99999999-0000-0000-0000-000000000003"),
            Number = "REQ-20260514-0003",
            EmployeeId = SidorovEmployeeId,
            EmployeeName = "Сидоров Алексей Викторович",
            RouteId = FuelDepotRouteId,
            RouteName = "Топливный узел",
            ScheduledDate = DateOnly.FromDateTime(DateTime.Today),
            ScheduledTime = new TimeOnly(12, 10),
            NotifyEmployee = false,
            NotificationText = "Подготовьте обход топливного узла.",
            Status = "Новая",
            CreatedAt = now.AddMinutes(-10),
            Description = "Свободная заявка для ручного назначения через модуль назначений."
        }
    ];

    private static AssignmentEntity[] CreateAssignments(DateTimeOffset now) =>
    [
        new AssignmentEntity
        {
            Id = Guid.Parse("eeeeeeee-0000-0000-0000-000000000001"),
            PatrolRequestId = Guid.Parse("99999999-0000-0000-0000-000000000001"),
            EmployeeId = PetrovEmployeeId,
            RouteId = WarehouseRouteId,
            RouteVersionNo = 2,
            Shift = "День",
            Status = AssignmentStatusValues.InProgress,
            PlannedAt = now.AddMinutes(-30),
            StartedAt = now.AddMinutes(-24),
            ProgressPercent = 68
        },
        new AssignmentEntity
        {
            Id = Guid.Parse("eeeeeeee-0000-0000-0000-000000000002"),
            PatrolRequestId = Guid.Parse("99999999-0000-0000-0000-000000000002"),
            EmployeeId = IvanovEmployeeId,
            RouteId = PerimeterRouteId,
            RouteVersionNo = 1,
            Shift = "День",
            Status = AssignmentStatusValues.Waiting,
            PlannedAt = now.AddMinutes(20),
            ProgressPercent = 12
        }
    ];

    private static PatrolResultEntity[] CreatePatrolResults(DateTimeOffset now) =>
    [
        new PatrolResultEntity
        {
            Id = Guid.Parse("77777777-0000-0000-0000-000000000001"),
            AssignmentId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000001"),
            EmployeeId = PetrovEmployeeId,
            RouteId = WarehouseRouteId,
            RoutePointId = WarehouseGatePointId,
            Status = "Замечание",
            PointName = "КПП-1",
            EmployeeName = "Петров Иван Александрович",
            RouteName = "Складской периметр",
            Territory = "Промзона Север",
            Shift = "День",
            PlannedAt = now.AddHours(-3),
            ActualAt = now.AddHours(-2).AddMinutes(-42),
            Deviation = "+18 мин",
            Comment = "Обнаружено повреждение ограждения у КПП-1.",
            IssueType = "Повреждение периметра",
            Severity = "Высокая",
            Photos = 2,
            CreatedAt = now.AddHours(-2).AddMinutes(-40),
            Issues =
            {
                new PatrolResultIssueEntity
                {
                    Id = Guid.Parse("88888888-0000-0000-0000-000000000001"),
                    Type = "Повреждение периметра",
                    Severity = "Высокая",
                    Message = "Сотрудник зафиксировал повреждение ограждения и создал фотофиксацию.",
                    CreatedAt = now.AddHours(-2).AddMinutes(-40)
                }
            },
            Attachments =
            {
                new PatrolResultAttachmentEntity
                {
                    Id = Guid.Parse("88888888-1000-0000-0000-000000000001"),
                    FileName = "warehouse-gate-1.jpg",
                    ContentType = "image/jpeg",
                    SizeBytes = 382_144,
                    CreatedAt = now.AddHours(-2).AddMinutes(-39)
                },
                new PatrolResultAttachmentEntity
                {
                    Id = Guid.Parse("88888888-1000-0000-0000-000000000002"),
                    FileName = "warehouse-gate-2.jpg",
                    ContentType = "image/jpeg",
                    SizeBytes = 419_920,
                    CreatedAt = now.AddHours(-2).AddMinutes(-38)
                }
            }
        },
        new PatrolResultEntity
        {
            Id = Guid.Parse("77777777-0000-0000-0000-000000000002"),
            AssignmentId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000002"),
            EmployeeId = IvanovEmployeeId,
            RouteId = PerimeterRouteId,
            RoutePointId = PerimeterMainGatePointId,
            Status = "Подтверждено",
            PointName = "КПП главный",
            EmployeeName = "Иванов Петр Сергеевич",
            RouteName = "Периметр 1",
            Territory = "Промзона Север",
            Shift = "День",
            PlannedAt = now.AddHours(-1),
            ActualAt = now.AddHours(-1).AddMinutes(3),
            Deviation = "+3 мин",
            Comment = "Без замечаний",
            IssueType = "-",
            Severity = "-",
            Photos = 1,
            CreatedAt = now.AddHours(-1).AddMinutes(4),
            Attachments =
            {
                new PatrolResultAttachmentEntity
                {
                    Id = Guid.Parse("88888888-1000-0000-0000-000000000003"),
                    FileName = "main-gate-ok.jpg",
                    ContentType = "image/jpeg",
                    SizeBytes = 264_512,
                    CreatedAt = now.AddHours(-1).AddMinutes(4)
                }
            }
        },
        new PatrolResultEntity
        {
            Id = Guid.Parse("77777777-0000-0000-0000-000000000003"),
            EmployeeId = SidorovEmployeeId,
            RouteId = PerimeterRouteId,
            RoutePointId = PerimeterTp4PointId,
            Status = "Просрочено",
            PointName = "ТП-4",
            EmployeeName = "Сидоров Михаил Викторович",
            RouteName = "Периметр 1",
            Territory = "Промзона Север",
            Shift = "Ночь",
            PlannedAt = now.AddHours(-5),
            ActualAt = now.AddHours(-4).AddMinutes(-8),
            Deviation = "+52 мин",
            Comment = "Контрольная точка подтверждена с существенной задержкой.",
            IssueType = "Нарушение SLA",
            Severity = "Средняя",
            Photos = 0,
            CreatedAt = now.AddHours(-4).AddMinutes(-8),
            Issues =
            {
                new PatrolResultIssueEntity
                {
                    Id = Guid.Parse("88888888-0000-0000-0000-000000000002"),
                    Type = "Нарушение SLA",
                    Severity = "Средняя",
                    Message = "Фактическое подтверждение точки произошло позже допустимого окна.",
                    CreatedAt = now.AddHours(-4).AddMinutes(-8)
                }
            }
        }
    ];

    private static RoutePointEntity CreatePoint(
        string id,
        Guid routeId,
        int sequenceNo,
        string name,
        string? nfcCode,
        bool isRequired) =>
        new()
        {
            Id = Guid.Parse(id),
            RouteId = routeId,
            SequenceNo = sequenceNo,
            Name = name,
            Zone = "Контрольная зона",
            Type = nfcCode is null ? "Ручной контроль" : "NFC",
            Tag = nfcCode ?? "Ручной контроль",
            Interval = "00:10",
            ExpectedTime = "00:05",
            Status = isRequired ? "Активна" : "Черновик",
            NfcCode = nfcCode,
            IsRequired = isRequired,
            RequiresPhoto = isRequired
        };

    private sealed record AccountingEmployeeSeed(
        Guid Id,
        string FullName,
        string PersonnelNo,
        string Position,
        string Department,
        string EmployeeGroup,
        DateOnly? HiredAt,
        DateOnly? BirthDate);
}
