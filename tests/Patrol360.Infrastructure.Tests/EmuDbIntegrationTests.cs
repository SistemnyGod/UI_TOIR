using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class EmuDbIntegrationTests
{
    private static readonly Guid IvanovEmployeeId = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid PetrovEmployeeId = Guid.Parse("aaaaaaaa-2222-2222-2222-222222222222");
    private static readonly Guid SidorovEmployeeId = Guid.Parse("aaaaaaaa-3333-3333-3333-333333333333");

    [DbIntegrationFact]
    public async Task WorkLifecycleDetectsConflictsAndKeepsAudit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.Single(section => section.Name == "Прочее");
        var waitReason = settings.WaitReasons.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-20);

        var first = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId, PetrovEmployeeId],
                "Проверка насоса"),
            null,
            "operator"));

        Assert.True(first.Succeeded);
        Assert.NotNull(first.Value);
        Assert.Equal(2, first.Value!.Employees.Count);
        Assert.True(first.Value.WorkMinutes >= 38);
        Assert.Equal(0, first.Value.WaitingMinutes);
        Assert.Equal(0, first.Value.OtherWorkMinutes);
        Assert.All(first.Value.Employees, employee => Assert.True(employee.WorkMinutes >= 19));

        var conflict = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                DateTimeOffset.UtcNow,
                [IvanovEmployeeId],
                "Повторное назначение"),
            null,
            "operator"));

        Assert.False(conflict.Succeeded);
        Assert.Contains("employeeIds", conflict.Errors.Keys);

        var paused = UseWork(provider, work => work.PauseWorkSession(
            first.Value.Id,
            new EmuPauseWorkSessionDto([IvanovEmployeeId], waitReason.Id, DateTimeOffset.UtcNow.AddMinutes(-5), "Отправлен на срочную работу", true, first.Value.RowVersion),
            null,
            "operator"));

        Assert.True(paused.Succeeded);
        Assert.NotNull(paused.Value);

        var staleResume = UseWork(provider, work => work.ResumeWorkSession(
            first.Value.Id,
            new EmuResumeWorkSessionDto([IvanovEmployeeId], DateTimeOffset.UtcNow, "Старая версия", first.Value.RowVersion),
            null,
            "operator"));

        Assert.False(staleResume.Succeeded);
        Assert.Contains("rowVersion", staleResume.Errors.Keys);

        var allowedSecond = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                DateTimeOffset.UtcNow,
                [IvanovEmployeeId],
                "Срочная диагностика"),
            null,
            "operator"));

        Assert.True(allowedSecond.Succeeded);
        Assert.NotNull(allowedSecond.Value);

        var missingResult = UseWork(provider, work => work.CompleteWorkSession(
            allowedSecond.Value!.Id,
            new EmuCompleteWorkSessionDto(null, DateTimeOffset.UtcNow, "Выполнено", "", null, allowedSecond.Value.RowVersion),
            null,
            "operator"));

        Assert.False(missingResult.Succeeded);
        Assert.Contains("resultComment", missingResult.Errors.Keys);

        var completedBeforeArrival = UseWork(provider, work => work.CompleteWorkSession(
            allowedSecond.Value.Id,
            new EmuCompleteWorkSessionDto(null, allowedSecond.Value.ArrivedAt.AddMinutes(-1), "Выполнено", "Некорректное время", null, allowedSecond.Value.RowVersion),
            null,
            "operator"));

        Assert.False(completedBeforeArrival.Succeeded);
        Assert.Contains("completedAt", completedBeforeArrival.Errors.Keys);

        var completed = UseWork(provider, work => work.CompleteWorkSession(
            allowedSecond.Value.Id,
            new EmuCompleteWorkSessionDto(null, DateTimeOffset.UtcNow, "Выполнено", "Работа выполнена", null, allowedSecond.Value.RowVersion),
            null,
            "operator"));

        Assert.True(completed.Succeeded);
        Assert.NotNull(completed.Value!.CompletedAt);

        var resumed = UseWork(provider, work => work.ResumeWorkSession(
            first.Value.Id,
            new EmuResumeWorkSessionDto([IvanovEmployeeId], DateTimeOffset.UtcNow, "Сотрудник вернулся", paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.True(resumed.Succeeded);
        Assert.Contains(resumed.Value!.Employees, employee => employee.EmployeeId == IvanovEmployeeId && employee.Status == "Работает");

        var missingCorrectionComment = UseWork(provider, work => work.UpdateWorkSession(
            first.Value.Id,
            new EmuUpdateWorkSessionDto(
                section.Id,
                "Проверка насоса после корректировки",
                resumed.Value.RowVersion,
                "",
                workDate,
                arrivedAt.AddMinutes(-5),
                [IvanovEmployeeId, PetrovEmployeeId]),
            null,
            "operator"));

        Assert.False(missingCorrectionComment.Succeeded);
        Assert.Contains("comment", missingCorrectionComment.Errors.Keys);

        var edited = UseWork(provider, work => work.UpdateWorkSession(
            first.Value.Id,
            new EmuUpdateWorkSessionDto(
                section.Id,
                "Проверка насоса после корректировки",
                resumed.Value.RowVersion,
                "Ручная корректировка времени",
                workDate,
                arrivedAt.AddMinutes(-5),
                [IvanovEmployeeId, PetrovEmployeeId]),
            null,
            "operator"));

        Assert.True(edited.Succeeded);
        Assert.Equal("Проверка насоса после корректировки", edited.Value!.TaskDescription);
        Assert.Equal(arrivedAt.AddMinutes(-5), edited.Value.ArrivedAt);

        var deleteWithoutReason = UseWork(provider, work => work.DeleteWorkSession(
            first.Value.Id,
            new EmuDeleteWorkSessionDto("", edited.Value.RowVersion),
            null,
            "manager"));

        Assert.False(deleteWithoutReason.Succeeded);
        Assert.Contains("reason", deleteWithoutReason.Errors.Keys);

        var deleted = UseWork(provider, work => work.DeleteWorkSession(
            first.Value.Id,
            new EmuDeleteWorkSessionDto("Дубликат записи", edited.Value.RowVersion),
            null,
            "manager"));

        Assert.True(deleted.Succeeded);
        Assert.NotNull(deleted.Value!.DeletedAt);

        var changesAfterDelete = UseWork(provider, work => work.GetWorkSessionChanges(edited.Value.ArrivedAt.AddDays(-1)));
        Assert.Contains(first.Value.Id, changesAfterDelete.DeletedSessionIds);
        Assert.DoesNotContain(changesAfterDelete.ChangedSessions, session => session.Id == first.Value.Id);

        var audit = UseWork(provider, work => work.GetWorkSessionAudit(first.Value.Id));
        Assert.Contains(audit.Rows, row => row.EventType == "created");
        Assert.Contains(audit.Rows, row => row.EventType == "other_work");
        Assert.Contains(audit.Rows, row => row.EventType == "resumed");
        Assert.Contains(audit.Rows, row => row.EventType == "arrived_at_changed" && row.Comment.Contains("Серверное время операции", StringComparison.Ordinal));
        Assert.Contains(audit.Rows, row => row.EventType == "deleted");

        var completedAudit = UseWork(provider, work => work.GetWorkSessionAudit(allowedSecond.Value.Id));
        Assert.Contains(completedAudit.Rows, row => row.EventType == "completed_at_changed" && row.Comment.Contains("введенное время", StringComparison.Ordinal));
    }

    [DbIntegrationFact]
    public async Task CarryOverMovesForgottenActiveWork()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var section = UseCatalog(provider, catalog => catalog.GetSettings()).Sections.Single(section => section.Name == "Прочее");
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var yesterday = today.AddDays(-1);
        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                yesterday,
                section.Id,
                DateTimeOffset.UtcNow.AddHours(-8),
                [SidorovEmployeeId],
                "Незавершенная работа"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        var moved = UseMaintenance(provider, maintenance => maintenance.CarryOverForgottenWork(DateTimeOffset.UtcNow.Date.AddMinutes(6)));

        Assert.Equal(1, moved);

        var reloaded = UseWork(provider, work => work.GetWorkSession(created.Value!.Id));
        Assert.True(reloaded.Succeeded);
        Assert.Equal(today, reloaded.Value!.WorkDate);
        Assert.True(reloaded.Value.IsCarriedOver);

        var audit = UseWork(provider, work => work.GetWorkSessionAudit(created.Value!.Id));
        Assert.Contains(audit.Rows, row => row.EventType == "carried_over");
    }

    [DbIntegrationFact]
    public async Task PlanTasksSupportSingleAndWeekApproval()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var weekStart = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var first = UsePlan(provider, plan => plan.CreatePlanTask(
            new EmuUpsertPlanTaskDto("Проверка КТП", "", weekStart, null, [IvanovEmployeeId], "Высокий", false, ""),
            null,
            "manager"));
        var second = UsePlan(provider, plan => plan.CreatePlanTask(
            new EmuUpsertPlanTaskDto("Осмотр линии", "", weekStart.AddDays(1), null, [PetrovEmployeeId], "Обычный", true, "weekly"),
            null,
            "manager"));

        Assert.True(first.Succeeded);
        Assert.True(second.Succeeded);
        var firstTask = first.Value!;
        var secondTask = second.Value!;
        Assert.Equal("Прочее", firstTask.SectionName);

        var section = UseCatalog(provider, catalog => catalog.GetSettings()).Sections.Single(section => section.Name == "Прочее");
        var blockedWorkFromPlan = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                weekStart,
                section.Id,
                DateTimeOffset.UtcNow,
                [IvanovEmployeeId],
                "Проверка КТП",
                firstTask.Id),
            null,
            "operator"));

        Assert.False(blockedWorkFromPlan.Succeeded);
        Assert.Contains("planTaskId", blockedWorkFromPlan.Errors.Keys);

        var approvedOne = UsePlan(provider, plan => plan.ApprovePlanTask(
            firstTask.Id,
            new EmuApprovePlanTaskDto(true, "Согласовано", firstTask.RowVersion),
            null,
            "manager"));

        Assert.True(approvedOne.Succeeded);
        Assert.Equal("Согласовано", approvedOne.Value!.ApprovalStatus);

        var staleApproval = UsePlan(provider, plan => plan.ApprovePlanTask(
            firstTask.Id,
            new EmuApprovePlanTaskDto(true, "Повторное согласование", firstTask.RowVersion),
            null,
            "manager"));

        Assert.False(staleApproval.Succeeded);
        Assert.Contains("rowVersion", staleApproval.Errors.Keys);

        var workFromApprovedPlan = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                weekStart,
                section.Id,
                DateTimeOffset.UtcNow,
                [IvanovEmployeeId],
                "Проверка КТП",
                firstTask.Id),
            null,
            "operator"));

        Assert.True(workFromApprovedPlan.Succeeded);

        var rejected = UsePlan(provider, plan => plan.ApprovePlanTask(
            secondTask.Id,
            new EmuApprovePlanTaskDto(false, "Нет ресурсов", secondTask.RowVersion),
            null,
            "manager"));

        Assert.True(rejected.Succeeded);
        Assert.Equal("Отклонено", rejected.Value!.ApprovalStatus);
        Assert.True(HasPlanAuditEvent(provider, secondTask.Id, "plan_rejected"));

        var approvedWeek = UsePlan(provider, plan => plan.ApproveWeek(new EmuApproveWeekDto(weekStart, "Неделя согласована"), null, "manager"));

        Assert.True(approvedWeek.Succeeded);
        Assert.Contains(approvedWeek.Value!, task => task.Id == secondTask.Id);
        Assert.All(approvedWeek.Value!, task => Assert.Equal("Согласовано", task.ApprovalStatus));
    }

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
                ["Patrol360:SeedDemoData"] = "true",
            })
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddPatrolInfrastructure(configuration);

        return services.BuildServiceProvider();
    }

    private static T UseCatalog<T>(ServiceProvider provider, Func<IEmuCatalogService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmuCatalogService>());
    }

    private static T UseWork<T>(ServiceProvider provider, Func<IEmuWorkService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmuWorkService>());
    }

    private static T UsePlan<T>(ServiceProvider provider, Func<IEmuPlanService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmuPlanService>());
    }

    private static T UseMaintenance<T>(ServiceProvider provider, Func<IEmuMaintenanceService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmuMaintenanceService>());
    }

    private static bool HasPlanAuditEvent(ServiceProvider provider, Guid planTaskId, string eventType)
    {
        using var scope = provider.CreateScope();
        var infrastructureAssembly = typeof(Patrol360.Infrastructure.DependencyInjection).Assembly;
        var contextType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Patrol360DbContext")
            ?? throw new InvalidOperationException("Patrol360DbContext type was not found.");
        var auditType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Entities.EmuWorkAuditEventEntity")
            ?? throw new InvalidOperationException("EmuWorkAuditEventEntity type was not found.");
        var dbContext = scope.ServiceProvider.GetRequiredService(contextType);
        var setMethod = typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)?.MakeGenericMethod(auditType)
            ?? throw new InvalidOperationException("DbContext.Set<TEntity>() method was not found.");
        var rows = (IEnumerable<object>)setMethod.Invoke(dbContext, null)!;
        var planTaskIdProperty = auditType.GetProperty("PlanTaskId") ?? throw new InvalidOperationException("PlanTaskId property was not found.");
        var eventTypeProperty = auditType.GetProperty("EventType") ?? throw new InvalidOperationException("EventType property was not found.");
        return rows.Any(row =>
            planTaskIdProperty.GetValue(row) is Guid value &&
            value == planTaskId &&
            string.Equals(eventTypeProperty.GetValue(row) as string, eventType, StringComparison.Ordinal));
    }
}
