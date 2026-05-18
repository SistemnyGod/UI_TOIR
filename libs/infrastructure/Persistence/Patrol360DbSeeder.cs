using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class Patrol360DbSeeder(Patrol360DbContext dbContext)
{
    private static readonly Guid PerimeterRouteId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid FuelDepotRouteId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid WarehouseRouteId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static readonly Guid IvanovEmployeeId = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid PetrovEmployeeId = Guid.Parse("aaaaaaaa-2222-2222-2222-222222222222");
    private static readonly Guid SidorovEmployeeId = Guid.Parse("aaaaaaaa-3333-3333-3333-333333333333");

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await dbContext.Routes.AnyAsync(cancellationToken))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;

        dbContext.Routes.AddRange(CreateRoutes(now));
        dbContext.Employees.AddRange(CreateEmployees(now));
        dbContext.PatrolRequests.AddRange(CreatePatrolRequests(now));
        dbContext.Assignments.AddRange(CreateAssignments(now));

        await dbContext.SaveChangesAsync(cancellationToken);
    }

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
            Shift = "День",
            Status = "В пути",
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
            Shift = "День",
            Status = "Ожидает",
            PlannedAt = now.AddMinutes(20),
            ProgressPercent = 12
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
}
