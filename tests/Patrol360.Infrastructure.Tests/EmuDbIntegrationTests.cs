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
        Assert.All(first.Value.Employees, employee =>
        {
            var interval = Assert.Single(employee.Intervals);
            Assert.Equal(first.Value.Id, interval.WorkSessionId);
            Assert.Equal(employee.Id, interval.WorkSessionEmployeeId);
            Assert.Null(interval.EndedAt);
        });

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
        var pausedIvanov = paused.Value!.Employees.Single(employee => employee.EmployeeId == IvanovEmployeeId);
        Assert.Equal(2, pausedIvanov.Intervals.Count);
        Assert.NotNull(pausedIvanov.Intervals[0].EndedAt);
        Assert.Null(pausedIvanov.Intervals[1].EndedAt);
        Assert.Equal("На паузе", pausedIvanov.Intervals[1].Status);

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

        var resumedIvanov = resumed.Value.Employees.Single(employee => employee.EmployeeId == IvanovEmployeeId);
        Assert.Equal(3, resumedIvanov.Intervals.Count);
        Assert.NotNull(resumedIvanov.Intervals[1].EndedAt);
        Assert.Null(resumedIvanov.Intervals[2].EndedAt);

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

        var manualCorrections = UseWork(provider, work => work.GetWorkSessions(new EmuWorkSessionQueryDto(ManualCorrectionsOnly: true, IncludeDeleted: true)));
        Assert.Contains(manualCorrections.Rows, row => row.Id == first.Value.Id);
        Assert.Contains(manualCorrections.Rows, row => row.Id == allowedSecond.Value.Id);

        var waitReasonRows = UseWork(provider, work => work.GetWorkSessions(new EmuWorkSessionQueryDto(WaitReasonId: waitReason.Id, IncludeDeleted: true)));
        Assert.Contains(waitReasonRows.Rows, row => row.Id == first.Value.Id);

        var problemRows = UseWork(provider, work => work.GetWorkSessions(new EmuWorkSessionQueryDto(ProblemOnly: true, IncludeDeleted: true)));
        Assert.Contains(problemRows.Rows, row => row.Id == first.Value.Id);
        Assert.Contains(problemRows.Rows, row => row.Id == allowedSecond.Value.Id);
    }

    [DbIntegrationFact]
    public async Task WorkSessionCanAddEmployeeWithOwnParticipationStart()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var section = UseCatalog(provider, catalog => catalog.GetSettings()).Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-30);
        var joinedAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "Initial task"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        var added = UseWork(provider, work => work.AddWorkSessionEmployee(
            created.Value!.Id,
            new EmuAddWorkSessionEmployeeDto(PetrovEmployeeId, joinedAt, "Added later", created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(added.Succeeded);
        var petrov = added.Value!.Employees.Single(employee => employee.EmployeeId == PetrovEmployeeId);
        Assert.Equal(joinedAt.ToUniversalTime(), petrov.ArrivedAt);
        var interval = Assert.Single(petrov.Intervals);
        Assert.True((interval.StartedAt - joinedAt.ToUniversalTime()).Duration() < TimeSpan.FromMilliseconds(1));
        Assert.Null(interval.EndedAt);

        var duplicate = UseWork(provider, work => work.AddWorkSessionEmployee(
            added.Value.Id,
            new EmuAddWorkSessionEmployeeDto(PetrovEmployeeId, DateTimeOffset.UtcNow, "Duplicate", added.Value.RowVersion),
            null,
            "operator"));

        Assert.False(duplicate.Succeeded);
        Assert.Contains("employeeId", duplicate.Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task WorkSessionCarryOverKeepsNumberAndWritesAudit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var section = UseCatalog(provider, catalog => catalog.GetSettings()).Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-1);
        var toDate = workDate.AddDays(1);
        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                DateTimeOffset.UtcNow.AddHours(-2),
                [IvanovEmployeeId],
                "Carry over test"),
            null,
            "operator"));

        Assert.True(created.Succeeded);
        var originalNumber = created.Value!.WorkNumber;

        var carried = UseWork(provider, work => work.CarryOverWorkSession(
            created.Value.Id,
            new EmuCarryOverWorkSessionDto(toDate, "End of shift carry-over", created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(carried.Succeeded);
        Assert.Equal(originalNumber, carried.Value!.WorkNumber);
        Assert.Equal(toDate, carried.Value.WorkDate);
        Assert.True(carried.Value.IsCarriedOver);
        Assert.Null(carried.Value.CompletedAt);

        var stale = UseWork(provider, work => work.CarryOverWorkSession(
            created.Value.Id,
            new EmuCarryOverWorkSessionDto(toDate.AddDays(1), "Stale row version", created.Value.RowVersion),
            null,
            "operator"));

        Assert.False(stale.Succeeded);
        Assert.Contains("rowVersion", stale.Errors.Keys);

        var audit = UseWork(provider, work => work.GetWorkSessionAudit(created.Value.Id));
        Assert.Contains(audit.Rows, row =>
            row.EventType == "carried_over" &&
            row.FromStatus == workDate.ToString("yyyy-MM-dd") &&
            row.ToStatus == toDate.ToString("yyyy-MM-dd") &&
            row.Comment.Contains("End of shift", StringComparison.Ordinal));

        var problemRows = UseWork(provider, work => work.GetWorkSessions(new EmuWorkSessionQueryDto(ProblemOnly: true)));
        Assert.Contains(problemRows.Rows, row => row.Id == created.Value.Id && row.IsCarriedOver);
    }

    [DbIntegrationFact]
    public async Task WorkSessionEmployeeActionsPersistIntervalsStatusesAndAudit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var waitReason = settings.WaitReasons.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-40);
        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId, PetrovEmployeeId],
                "Individual employee actions"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        var paused = UseWork(provider, work => work.PauseWorkSession(
            created.Value!.Id,
            new EmuPauseWorkSessionDto([IvanovEmployeeId], waitReason.Id, arrivedAt.AddMinutes(10), "Individual pause", false, created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(paused.Succeeded);
        var pausedIvanov = paused.Value!.Employees.Single(employee => employee.EmployeeId == IvanovEmployeeId);
        Assert.Equal("На паузе", pausedIvanov.ParticipationStatus);
        Assert.Equal("Individual pause", pausedIvanov.CurrentPauseReason);

        var resumed = UseWork(provider, work => work.ResumeWorkSession(
            created.Value!.Id,
            new EmuResumeWorkSessionDto([IvanovEmployeeId], arrivedAt.AddMinutes(20), "Returned from pause", paused.Value.RowVersion),
            null,
            "operator"));

        Assert.True(resumed.Succeeded);
        var resumedIvanov = resumed.Value!.Employees.Single(employee => employee.EmployeeId == IvanovEmployeeId);
        Assert.Equal("Работает", resumedIvanov.ParticipationStatus);
        Assert.Equal(3, resumedIvanov.Intervals.Count);

        var finished = UseWork(provider, work => work.FinishWorkSessionEmployee(
            created.Value!.Id,
            IvanovEmployeeId,
            new EmuFinishWorkSessionEmployeeDto(arrivedAt.AddMinutes(30), "Частично выполнено", "Employee moved to another activity", resumed.Value.RowVersion),
            null,
            "operator"));

        Assert.True(finished.Succeeded);
        var finishedIvanov = finished.Value!.Employees.Single(employee => employee.EmployeeId == IvanovEmployeeId);
        Assert.Equal("Частично выполнено", finishedIvanov.Status);
        Assert.Equal("Частично выполнено", finishedIvanov.ParticipationStatus);
        Assert.NotNull(finishedIvanov.FinishedAt);
        Assert.All(finishedIvanov.Intervals, interval => Assert.NotNull(interval.EndedAt));

        var mistaken = UseWork(provider, work => work.MarkWorkSessionEmployeeMistaken(
            created.Value!.Id,
            PetrovEmployeeId,
            new EmuMarkMistakenWorkSessionEmployeeDto("Added by mistake", finished.Value.RowVersion),
            null,
            "operator"));

        Assert.True(mistaken.Succeeded);
        var mistakenPetrov = mistaken.Value!.Employees.Single(employee => employee.EmployeeId == PetrovEmployeeId);
        Assert.Equal("Добавлен ошибочно", mistakenPetrov.Status);
        Assert.Equal(0, mistakenPetrov.PersonalWorkMinutes);
        Assert.Equal(0, mistakenPetrov.PersonalPauseMinutes);
        Assert.All(mistakenPetrov.Intervals, interval => Assert.NotNull(interval.EndedAt));

        var audit = UseWork(provider, work => work.GetWorkSessionAudit(created.Value!.Id));
        Assert.Contains(audit.Rows, row => row.EventType == "employee_finished");
        Assert.Contains(audit.Rows, row => row.EventType == "employee_marked_mistaken");
    }

    [DbIntegrationFact]
    public async Task EmployeeShiftTemplatesAndManualCorrectionPersistAudit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var templates = UseShift(provider, shifts => shifts.GetShiftTemplates());
        Assert.Contains(templates, template => template.Code == "day");
        Assert.Contains(templates, template => template.Code == "day11");
        Assert.Contains(templates, template => template.Code == "night" && template.CrossesMidnight);

        var shiftDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var defaultShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        Assert.Equal("default", defaultShift.Source);
        Assert.Equal("day", defaultShift.ShiftType);
        Assert.Equal(TimeSpan.FromHours(9), defaultShift.PlannedEndAt - defaultShift.PlannedStartAt);
        Assert.Equal(TimeSpan.FromHours(1), defaultShift.LunchEndAt - defaultShift.LunchStartAt);

        var correctedDay11 = UseShift(provider, shifts => shifts.UpdateEmployeeShift(
            defaultShift.Id,
            new EmuUpdateEmployeeShiftDto(
                IvanovEmployeeId,
                shiftDate,
                "day11",
                null,
                null,
                null,
                null,
                true,
                false,
                "Manual day11 correction",
                "Overtime shift",
                defaultShift.RowVersion),
            null,
            "manager"));

        Assert.True(correctedDay11.Succeeded);
        Assert.Equal("manual", correctedDay11.Value!.Source);
        Assert.Equal("day11", correctedDay11.Value.ShiftType);
        Assert.Equal(TimeSpan.FromHours(12), correctedDay11.Value.PlannedEndAt - correctedDay11.Value.PlannedStartAt);

        var correctedNight = UseShift(provider, shifts => shifts.UpdateEmployeeShift(
            correctedDay11.Value.Id,
            new EmuUpdateEmployeeShiftDto(
                IvanovEmployeeId,
                shiftDate,
                "night",
                null,
                null,
                null,
                null,
                true,
                false,
                "Manual night correction",
                "Night shift replacement",
                correctedDay11.Value.RowVersion),
            null,
            "manager"));

        Assert.True(correctedNight.Succeeded);
        Assert.Equal("night", correctedNight.Value!.ShiftType);
        Assert.Equal(shiftDate, correctedNight.Value.ShiftDate);
        Assert.Equal(TimeSpan.FromHours(12), correctedNight.Value.PlannedEndAt - correctedNight.Value.PlannedStartAt);
        Assert.True(correctedNight.Value.PlannedEndAt > correctedNight.Value.PlannedStartAt);
        Assert.True(HasAuditEvent(provider, "shift_adjusted", "Night shift replacement"));
    }

    [DbIntegrationFact]
    public async Task EmployeeShiftUsesPercoPresenceUntilManualCorrection()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var shiftDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var earlyDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        InsertPresenceInterval(provider, IvanovEmployeeId, earlyDefault.PlannedStartAt.AddMinutes(-45), null);

        var earlyPresenceShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        Assert.Equal("perco", earlyPresenceShift.Source);
        Assert.Equal(earlyDefault.PlannedStartAt, earlyPresenceShift.ActualStartAt);
        Assert.Equal(earlyDefault.PlannedEndAt, earlyPresenceShift.ActualEndAt);

        var lunchDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, SidorovEmployeeId)).Single();
        var lunchExit = lunchDefault.LunchStartAt.AddMinutes(10);
        var lunchReturn = lunchDefault.LunchEndAt.AddMinutes(5);
        InsertPresenceInterval(provider, SidorovEmployeeId, lunchDefault.PlannedStartAt, lunchExit);

        var lunchExitShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, SidorovEmployeeId)).Single();
        Assert.Equal("perco", lunchExitShift.Source);
        Assert.False(lunchExitShift.LunchTaken);
        Assert.Equal(lunchDefault.PlannedStartAt, lunchExitShift.ActualStartAt);
        Assert.Equal(lunchExit, lunchExitShift.ActualEndAt);

        InsertPresenceInterval(provider, SidorovEmployeeId, lunchReturn, null);
        var lunchReturnedShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, SidorovEmployeeId)).Single();
        Assert.Equal(lunchDefault.PlannedStartAt, lunchReturnedShift.ActualStartAt);
        Assert.Equal(lunchDefault.PlannedEndAt, lunchReturnedShift.ActualEndAt);

        var delayedLunchDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        var delayedLunchExit = delayedLunchDefault.LunchEndAt.AddMinutes(30);
        InsertPresenceInterval(provider, IvanovEmployeeId, delayedLunchDefault.PlannedStartAt, delayedLunchExit);

        var delayedLunchShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        Assert.Equal("perco", delayedLunchShift.Source);
        Assert.Equal(delayedLunchDefault.PlannedStartAt, delayedLunchShift.ActualStartAt);
        Assert.Equal(delayedLunchDefault.PlannedEndAt, delayedLunchShift.ActualEndAt);

        var lateDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, PetrovEmployeeId)).Single();
        var lateStart = lateDefault.PlannedStartAt.AddMinutes(45);
        var earlyEnd = lateDefault.PlannedEndAt.AddMinutes(-30);
        InsertPresenceInterval(provider, PetrovEmployeeId, lateStart, earlyEnd);

        var latePresenceShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, PetrovEmployeeId)).Single();
        Assert.Equal("perco", latePresenceShift.Source);
        Assert.Equal(lateStart, latePresenceShift.ActualStartAt);
        Assert.Equal(earlyEnd, latePresenceShift.ActualEndAt);

        var manualStart = lateDefault.PlannedStartAt.AddMinutes(10);
        var manualShift = UseShift(provider, shifts => shifts.UpdateEmployeeShift(
            lateDefault.Id,
            new EmuUpdateEmployeeShiftDto(
                PetrovEmployeeId,
                shiftDate,
                "day",
                manualStart,
                null,
                null,
                null,
                true,
                false,
                "Manual correction wins over PERCo",
                "Manual source test",
                lateDefault.RowVersion),
            null,
            "manager"));

        Assert.True(manualShift.Succeeded);
        var afterManual = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, PetrovEmployeeId)).Single();
        Assert.Equal("manual", afterManual.Source);
        Assert.Equal(manualStart, afterManual.ActualStartAt);
        Assert.NotEqual(lateStart, afterManual.ActualStartAt);
    }

    [DbIntegrationFact]
    public async Task EmployeeShiftIgnoresStaleOpenPercoPresenceFromPreviousShift()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var shiftDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var previousShiftDate = shiftDate.AddDays(-1);
        var previousDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(previousShiftDate, IvanovEmployeeId)).Single();
        InsertPresenceInterval(provider, IvanovEmployeeId, previousDefault.PlannedStartAt, null);

        var currentDefault = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();

        Assert.Equal("default", currentDefault.Source);
        Assert.Equal(currentDefault.PlannedStartAt, currentDefault.ActualStartAt);
        Assert.Equal(currentDefault.PlannedEndAt, currentDefault.ActualEndAt);
    }

    [DbIntegrationFact]
    public async Task ManualPresenceIntervalCloseSurvivesPercoPresenceRebuild()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var enteredAt = DateTimeOffset.UtcNow.AddHours(-10);
        var manualExitAt = enteredAt.AddHours(8);
        InsertPresenceInterval(provider, IvanovEmployeeId, enteredAt, null);
        var openInterval = ReadPresenceIntervals(database.ConnectionString, IvanovEmployeeId).Single();

        var closed = UsePerco(provider, perco => perco.ClosePresenceIntervalAsync(
            openInterval.Id,
            new ClosePercoPresenceIntervalDto(manualExitAt, "PERCo не вернул выход, закрыто оператором"),
            null).GetAwaiter().GetResult());

        Assert.True(closed.Success);

        var afterClose = ReadPresenceIntervals(database.ConnectionString, IvanovEmployeeId).Single();
        Assert.Equal(manualExitAt.ToUnixTimeMilliseconds(), afterClose.EndedAt?.ToUnixTimeMilliseconds());
        Assert.Equal("PERCO_MANUAL", afterClose.Source);

        InvokePresenceRebuild(provider);

        var afterRebuild = ReadPresenceIntervals(database.ConnectionString, IvanovEmployeeId).Single();
        Assert.Equal(manualExitAt.ToUnixTimeMilliseconds(), afterRebuild.EndedAt?.ToUnixTimeMilliseconds());
        Assert.Equal("PERCO_MANUAL", afterRebuild.Source);
    }

    [DbIntegrationFact]
    public async Task PercoPresenceRebuildKeepsLunchExitAndReturnAsOneShiftPresence()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var shiftDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var defaultShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();
        var enteredAt = defaultShift.PlannedStartAt;
        var lunchExitAt = defaultShift.LunchStartAt.AddMinutes(10);
        var lunchReturnAt = defaultShift.LunchEndAt.AddMinutes(5);
        var finalExitAt = defaultShift.PlannedEndAt;

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "IN", enteredAt);
        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", lunchExitAt);

        InvokePresenceRebuild(provider);

        var lunchExitDiagnostics = UsePerco(provider, perco => perco.GetDiagnosticsAsync(100).GetAwaiter().GetResult());
        Assert.Contains(lunchExitDiagnostics.RecentEvents, row =>
            row.Direction == "OUT" &&
            row.EventAt == lunchExitAt &&
            row.ShiftMarker == "Выход на обед, не окончание смены");
        Assert.Contains(lunchExitDiagnostics.PresenceIntervals, row =>
            row.EmployeeId == IvanovEmployeeId &&
            row.EndedAt == lunchExitAt &&
            row.State == "Вышел на обед");

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "IN", lunchReturnAt);

        InvokePresenceRebuild(provider);

        var openLunchIntervals = ReadPresenceIntervals(database.ConnectionString, IvanovEmployeeId);
        Assert.Equal(2, openLunchIntervals.Count);
        Assert.Equal(enteredAt, openLunchIntervals[0].StartedAt);
        Assert.Equal(lunchExitAt, openLunchIntervals[0].EndedAt);
        Assert.Equal(lunchReturnAt, openLunchIntervals[1].StartedAt);
        Assert.Null(openLunchIntervals[1].EndedAt);

        var lunchReturnDiagnostics = UsePerco(provider, perco => perco.GetDiagnosticsAsync(100).GetAwaiter().GetResult());
        Assert.Contains(lunchReturnDiagnostics.RecentEvents, row =>
            row.Direction == "IN" &&
            row.EventAt == lunchReturnAt &&
            row.ShiftMarker == "Возврат с обеда, смена продолжается");
        Assert.Contains(lunchReturnDiagnostics.PresenceIntervals, row =>
            row.EmployeeId == IvanovEmployeeId &&
            row.EndedAt == lunchExitAt &&
            row.State == "Обеденный выход, смена продолжается");

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", finalExitAt);
        InvokePresenceRebuild(provider);

        var closedIntervals = ReadPresenceIntervals(database.ConnectionString, IvanovEmployeeId);
        Assert.Equal(2, closedIntervals.Count);
        Assert.Equal(lunchExitAt, closedIntervals[0].EndedAt);
        Assert.Equal(lunchReturnAt, closedIntervals[1].StartedAt);
        Assert.Equal(finalExitAt, closedIntervals[1].EndedAt);
    }

    [DbIntegrationFact]
    public async Task EmployeeShiftSummaryCountsWorkPauseFreeLunchBeforeShiftAndOvertime()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var waitReason = settings.WaitReasons.First();
        var now = DateTimeOffset.UtcNow;
        var shiftStart = now.AddHours(-6);
        var shiftEnd = now.AddHours(-1);
        var lunchStart = shiftStart.AddHours(3);
        var lunchEnd = lunchStart.AddHours(1);
        var shiftDate = DateOnly.FromDateTime(shiftStart.UtcDateTime.Date);
        var defaultShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();

        var adjustedShift = UseShift(provider, shifts => shifts.UpdateEmployeeShift(
            defaultShift.Id,
            new EmuUpdateEmployeeShiftDto(
                IvanovEmployeeId,
                shiftDate,
                "day",
                shiftStart,
                shiftEnd,
                lunchStart,
                lunchEnd,
                true,
                true,
                "Synthetic shift for summary test",
                "Summary test",
                defaultShift.RowVersion),
            null,
            "manager"));

        Assert.True(adjustedShift.Succeeded);

        var beforeShift = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                shiftDate,
                section.Id,
                shiftStart.AddMinutes(-20),
                [IvanovEmployeeId],
                "Before shift work"),
            null,
            "operator"));

        Assert.True(beforeShift.Succeeded);
        var beforeCompleted = UseWork(provider, work => work.CompleteWorkSession(
            beforeShift.Value!.Id,
            new EmuCompleteWorkSessionDto(null, shiftStart.AddMinutes(-10), "Выполнено", "Before shift finished", null, beforeShift.Value.RowVersion),
            null,
            "operator"));

        Assert.True(beforeCompleted.Succeeded);

        var main = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                shiftDate,
                section.Id,
                shiftStart.AddMinutes(30),
                [IvanovEmployeeId],
                "Shift summary main work"),
            null,
            "operator"));

        Assert.True(main.Succeeded);
        var paused = UseWork(provider, work => work.PauseWorkSession(
            main.Value!.Id,
            new EmuPauseWorkSessionDto([IvanovEmployeeId], waitReason.Id, shiftStart.AddMinutes(60), "Waiting for material", false, main.Value.RowVersion),
            null,
            "operator"));

        Assert.True(paused.Succeeded);
        var resumed = UseWork(provider, work => work.ResumeWorkSession(
            main.Value!.Id,
            new EmuResumeWorkSessionDto([IvanovEmployeeId], shiftStart.AddMinutes(90), "Material returned", paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.True(resumed.Succeeded);
        var completed = UseWork(provider, work => work.CompleteWorkSession(
            main.Value!.Id,
            new EmuCompleteWorkSessionDto(null, shiftStart.AddMinutes(120), "Выполнено", "Main work finished", null, resumed.Value!.RowVersion),
            null,
            "operator"));

        Assert.True(completed.Succeeded);

        var overtime = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                shiftDate,
                section.Id,
                shiftEnd.AddMinutes(10),
                [IvanovEmployeeId],
                "Overtime work"),
            null,
            "operator"));

        Assert.True(overtime.Succeeded);
        var overtimeCompleted = UseWork(provider, work => work.CompleteWorkSession(
            overtime.Value!.Id,
            new EmuCompleteWorkSessionDto(null, shiftEnd.AddMinutes(20), "Выполнено", "Overtime finished", null, overtime.Value.RowVersion),
            null,
            "operator"));

        Assert.True(overtimeCompleted.Succeeded);

        var summary = UseShift(provider, shifts => shifts.GetEmployeeShiftSummary(IvanovEmployeeId, shiftDate));
        Assert.True(summary.Succeeded);
        Assert.Equal(60, summary.Value!.WorkMinutes);
        Assert.Equal(30, summary.Value.PauseMinutes);
        Assert.Equal(150, summary.Value.FreeMinutes);
        Assert.Equal(10, summary.Value.BeforeShiftWorkMinutes);
        Assert.Equal(0, summary.Value.OvertimeMinutes);
        Assert.Equal(0, summary.Value.QuestionableOvertimeMinutes);
        Assert.Contains(summary.Value.Intervals, interval => interval.Type == "lunch" && interval.Minutes == 60);
        Assert.Contains(summary.Value.Intervals, interval => interval.Type == "free");
        Assert.Contains(summary.Value.Intervals, interval => interval.Type == "pause" && interval.Reason == "Waiting for material");
    }

    [DbIntegrationFact]
    public async Task EmployeeShiftSummaryCreatesAndResolvesLunchOverlapDecision()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var now = DateTimeOffset.UtcNow;
        var shiftStart = now.AddHours(-5);
        var shiftEnd = now.AddHours(-1);
        var lunchStart = shiftStart.AddHours(2);
        var lunchEnd = lunchStart.AddHours(1);
        var shiftDate = DateOnly.FromDateTime(shiftStart.UtcDateTime.Date);
        var defaultShift = UseShift(provider, shifts => shifts.GetEmployeeShifts(shiftDate, IvanovEmployeeId)).Single();

        var adjustedShift = UseShift(provider, shifts => shifts.UpdateEmployeeShift(
            defaultShift.Id,
            new EmuUpdateEmployeeShiftDto(
                IvanovEmployeeId,
                shiftDate,
                "day",
                shiftStart,
                shiftEnd,
                lunchStart,
                lunchEnd,
                true,
                true,
                "Lunch overlap decision test",
                "Decision test",
                defaultShift.RowVersion),
            null,
            "manager"));

        Assert.True(adjustedShift.Succeeded);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                shiftDate,
                section.Id,
                lunchStart.AddMinutes(-30),
                [IvanovEmployeeId],
                "Lunch overlap work"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        var completed = UseWork(provider, work => work.CompleteWorkSession(
            created.Value!.Id,
            new EmuCompleteWorkSessionDto(null, lunchStart.AddMinutes(30), "Выполнено", "Worked through lunch window", null, created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(completed.Succeeded);

        var summary = UseShift(provider, shifts => shifts.GetEmployeeShiftSummary(IvanovEmployeeId, shiftDate));
        Assert.True(summary.Succeeded);
        var decision = Assert.Single(summary.Value!.Decisions, row => row.DecisionType == "lunch_overlap");
        Assert.Equal("new", decision.Status);
        Assert.Equal(30, decision.OverlapMinutes);
        Assert.Equal(60, summary.Value.WorkMinutes);

        var repeatedSummary = UseShift(provider, shifts => shifts.GetEmployeeShiftSummary(IvanovEmployeeId, shiftDate));
        Assert.Single(repeatedSummary.Value!.Decisions, row => row.DecisionType == "lunch_overlap");

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        Assert.True(refreshed >= 1);
        Assert.True(HasEmuNotification(provider, "decision", "new"));

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            decision.Id,
            new EmuResolveDecisionDto("exclude_lunch", "Обед не входил в рабочее время", decision.RowVersion),
            null,
            "manager"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("exclude_lunch", resolved.Value.Resolution);

        var correctedSummary = UseShift(provider, shifts => shifts.GetEmployeeShiftSummary(IvanovEmployeeId, shiftDate));
        Assert.Equal(30, correctedSummary.Value!.WorkMinutes);
        Assert.Contains(correctedSummary.Value.Intervals, interval => interval.Type == "lunch-excluded");
        Assert.True(HasEmuNotification(provider, "decision", "resolved"));
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsCreatesDecisionForEmployeeConflict()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-15);

        var first = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "Conflict decision first work"),
            null,
            "operator"));

        Assert.True(first.Succeeded);

        var second = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt.AddMinutes(1),
                [PetrovEmployeeId],
                "Conflict decision second work"),
            null,
            "operator"));

        Assert.True(second.Succeeded);

        ForceWorkSessionEmployee(provider, second.Value!.Id, IvanovEmployeeId, "Иванов Иван Иванович");

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        Assert.True(refreshed >= 1);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var decision = Assert.Single(decisions, row => row.DecisionType == "employee_conflict");
        Assert.Equal("danger", decision.Severity);
        Assert.NotNull(decision.WorkSessionId);
        Assert.Equal(0, decision.OverlapMinutes);
        Assert.True(HasEmuNotification(provider, "decision", "new"));

        UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        var repeated = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var repeatedDecision = Assert.Single(repeated, row => row.DecisionType == "employee_conflict");

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            repeatedDecision.Id,
            new EmuResolveDecisionDto("fixed_manually", "Конфликт проверен оператором", repeatedDecision.RowVersion),
            null,
            "operator"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("fixed_manually", resolved.Value.Resolution);
        Assert.True(HasEmuNotification(provider, "decision", "resolved"));
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsCreatesDecisionForPercoExitDuringActiveWork()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-20);
        var exitAt = DateTimeOffset.UtcNow.AddMinutes(-5);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "PERCo exit decision work"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", exitAt);

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        Assert.True(refreshed >= 1);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var decision = Assert.Single(decisions, row => row.DecisionType == "perco_exit_during_work");
        Assert.Equal("danger", decision.Severity);
        Assert.Equal(created.Value!.Id, decision.WorkSessionId);
        Assert.Equal(0, decision.OverlapMinutes);
        Assert.True(HasEmuNotification(provider, "decision", "new"));

        UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        var repeated = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var repeatedDecision = Assert.Single(repeated, row => row.DecisionType == "perco_exit_during_work");

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            repeatedDecision.Id,
            new EmuResolveDecisionDto("handled_manually", "Оператор поставил сотрудника на паузу", repeatedDecision.RowVersion),
            null,
            "operator"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("handled_manually", resolved.Value.Resolution);
        Assert.True(HasEmuNotification(provider, "decision", "resolved"));
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsCreatesDecisionForWorkWithoutPercoPresence()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var presenceStart = DateTimeOffset.UtcNow.AddMinutes(-90);
        var presenceEnd = DateTimeOffset.UtcNow.AddMinutes(-30);
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-10);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "PERCo missing presence decision work"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", presenceEnd);
        InsertPresenceInterval(provider, IvanovEmployeeId, presenceStart, presenceEnd);

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        Assert.True(refreshed >= 1);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var decision = Assert.Single(decisions, row => row.DecisionType == "perco_missing_presence_for_work");
        Assert.Equal("warning", decision.Severity);
        Assert.Equal(created.Value!.Id, decision.WorkSessionId);

        UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow));
        var repeated = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var repeatedDecision = Assert.Single(repeated, row => row.DecisionType == "perco_missing_presence_for_work");

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            repeatedDecision.Id,
            new EmuResolveDecisionDto("false_alarm", "PERCo-событие не относится к этой работе", repeatedDecision.RowVersion),
            null,
            "operator"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("false_alarm", resolved.Value.Resolution);
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsCreatesDecisionForPercoLunchExitDuringActiveWork()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var lunchStart = new DateTimeOffset(workDate.ToDateTime(new TimeOnly(12, 0)), TimeSpan.FromHours(5)).ToUniversalTime();
        var lunchExitAt = lunchStart.AddMinutes(10);
        var arrivedAt = lunchStart.AddMinutes(-10);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "PERCo lunch exit decision work"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", lunchExitAt);
        InsertPresenceInterval(provider, IvanovEmployeeId, arrivedAt.AddMinutes(-5), null);

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(lunchStart.AddHours(2)));
        Assert.True(refreshed >= 1);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var decision = Assert.Single(decisions, row => row.DecisionType == "perco_lunch_exit_during_work");
        Assert.Contains(decision.Severity, new[] { "warning", "danger" });
        Assert.Equal(created.Value!.Id, decision.WorkSessionId);
        Assert.True(decision.OverlapMinutes > 0);
        Assert.NotNull(decision.LunchStartAt);
        Assert.NotNull(decision.LunchEndAt);
        Assert.DoesNotContain(decisions, row => row.DecisionType == "perco_exit_during_work");

        UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(lunchStart.AddHours(2).AddMinutes(1)));
        var repeated = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var repeatedDecision = Assert.Single(repeated, row => row.DecisionType == "perco_lunch_exit_during_work");

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            repeatedDecision.Id,
            new EmuResolveDecisionDto("exclude_lunch", "Сотрудник выходил на обед по PERCo", repeatedDecision.RowVersion),
            null,
            "operator"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("exclude_lunch", resolved.Value.Resolution);
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsTreatsPercoLunchExitAndReturnAsLunchBreak()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var shift = UseShift(provider, shifts => shifts.GetEmployeeShifts(workDate, IvanovEmployeeId)).Single();
        var lunchExitAt = shift.LunchStartAt.AddMinutes(10);
        var lunchReturnAt = shift.LunchEndAt.AddMinutes(5);
        var arrivedAt = shift.LunchStartAt.AddMinutes(-10);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "PERCo lunch return should keep shift active"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", lunchExitAt);
        InsertPercoAccessEvent(provider, IvanovEmployeeId, "IN", lunchReturnAt);
        InsertPresenceInterval(provider, IvanovEmployeeId, arrivedAt.AddMinutes(-5), lunchExitAt);
        InsertPresenceInterval(provider, IvanovEmployeeId, lunchReturnAt, null);

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(shift.LunchEndAt.AddHours(2)));
        Assert.True(refreshed >= 0);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        Assert.DoesNotContain(decisions, row => row.DecisionType == "perco_lunch_exit_during_work");
        Assert.DoesNotContain(decisions, row => row.DecisionType == "perco_exit_during_work");
        Assert.DoesNotContain(decisions, row => row.DecisionType == "lunch_overlap");

        var summary = UseShift(provider, shifts => shifts.GetEmployeeShiftSummary(IvanovEmployeeId, workDate));
        Assert.True(summary.Succeeded, string.Join("; ", summary.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Contains(summary.Value!.Intervals, row => row.Type == "lunch-perco" && row.Minutes > 0);
        Assert.Equal(shift.PlannedEndAt, summary.Value.Shift.ActualEndAt);
    }

    [DbIntegrationFact]
    public async Task RefreshNotificationsCreatesDecisionForPercoAbsenceAfterShift()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.First();
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var shiftStart = new DateTimeOffset(workDate.ToDateTime(new TimeOnly(8, 0)), TimeSpan.FromHours(5)).ToUniversalTime();
        var shiftEnd = new DateTimeOffset(workDate.ToDateTime(new TimeOnly(17, 0)), TimeSpan.FromHours(5)).ToUniversalTime();
        var arrivedAt = shiftEnd.AddMinutes(-20);
        var presenceEnd = shiftEnd.AddMinutes(-5);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [IvanovEmployeeId],
                "PERCo absence after shift decision work"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        InsertPercoAccessEvent(provider, IvanovEmployeeId, "OUT", presenceEnd);
        InsertPresenceInterval(provider, IvanovEmployeeId, shiftStart, presenceEnd);

        var refreshed = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(shiftEnd.AddMinutes(45)));
        Assert.True(refreshed >= 1);

        var decisions = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var decision = Assert.Single(decisions, row => row.DecisionType == "perco_absent_after_shift");
        Assert.DoesNotContain(decisions, row => row.DecisionType == "perco_missing_presence_for_work");
        Assert.Equal("danger", decision.Severity);
        Assert.Equal(created.Value!.Id, decision.WorkSessionId);

        UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(shiftEnd.AddMinutes(46)));
        var repeated = UseShift(provider, shifts => shifts.GetDecisions(new EmuDecisionQueryDto("new", null, IvanovEmployeeId)));
        var repeatedDecision = Assert.Single(repeated, row => row.DecisionType == "perco_absent_after_shift");

        var resolved = UseShift(provider, shifts => shifts.ResolveDecision(
            repeatedDecision.Id,
            new EmuResolveDecisionDto("handled_manually", "Оператор перенес работу и поставил сотрудника на паузу", repeatedDecision.RowVersion),
            null,
            "operator"));

        Assert.True(resolved.Succeeded, string.Join("; ", resolved.Errors.Select(row => $"{row.Key}={string.Join(",", row.Value)}")));
        Assert.Equal("resolved", resolved.Value!.Status);
        Assert.Equal("handled_manually", resolved.Value.Resolution);
    }

    [DbIntegrationFact]
    public async Task WorkLifecycleRejectsInvalidManualOperationTimes()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var settings = UseCatalog(provider, catalog => catalog.GetSettings());
        var section = settings.Sections.Single(section => section.Name == "Прочее");
        var waitReason = settings.WaitReasons.First();
        var arrivedAt = DateTimeOffset.UtcNow.AddMinutes(-30);
        var workDate = DateOnly.FromDateTime(DateTime.UtcNow.Date);

        var created = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                workDate,
                section.Id,
                arrivedAt,
                [SidorovEmployeeId],
                "Проверка ручного времени"),
            null,
            "operator"));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Value);

        var pauseBeforeArrival = UseWork(provider, work => work.PauseWorkSession(
            created.Value!.Id,
            new EmuPauseWorkSessionDto([SidorovEmployeeId], waitReason.Id, arrivedAt.AddMinutes(-1), "Раньше прихода", false, created.Value.RowVersion),
            null,
            "operator"));

        Assert.False(pauseBeforeArrival.Succeeded);
        Assert.Contains("startedAt", pauseBeforeArrival.Errors.Keys);

        var pauseTooFarInFuture = UseWork(provider, work => work.PauseWorkSession(
            created.Value!.Id,
            new EmuPauseWorkSessionDto([SidorovEmployeeId], waitReason.Id, DateTimeOffset.UtcNow.AddMinutes(5), "Будущее время", false, created.Value.RowVersion),
            null,
            "operator"));

        Assert.False(pauseTooFarInFuture.Succeeded);
        Assert.Contains("startedAt", pauseTooFarInFuture.Errors.Keys);

        var paused = UseWork(provider, work => work.PauseWorkSession(
            created.Value.Id,
            new EmuPauseWorkSessionDto([SidorovEmployeeId], waitReason.Id, arrivedAt.AddMinutes(10), "Ожидание допуска", false, created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(paused.Succeeded);
        Assert.NotNull(paused.Value);

        var resumeBeforePause = UseWork(provider, work => work.ResumeWorkSession(
            created.Value.Id,
            new EmuResumeWorkSessionDto([SidorovEmployeeId], arrivedAt.AddMinutes(5), "Раньше паузы", paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.False(resumeBeforePause.Succeeded);
        Assert.Contains("resumedAt", resumeBeforePause.Errors.Keys);

        var resumeTooFarInFuture = UseWork(provider, work => work.ResumeWorkSession(
            created.Value.Id,
            new EmuResumeWorkSessionDto([SidorovEmployeeId], DateTimeOffset.UtcNow.AddMinutes(5), "Будущее время", paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.False(resumeTooFarInFuture.Succeeded);
        Assert.Contains("resumedAt", resumeTooFarInFuture.Errors.Keys);

        var completeBeforePause = UseWork(provider, work => work.CompleteWorkSession(
            created.Value.Id,
            new EmuCompleteWorkSessionDto(null, arrivedAt.AddMinutes(5), "Выполнено", "Раньше паузы", null, paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.False(completeBeforePause.Succeeded);
        Assert.Contains("completedAt", completeBeforePause.Errors.Keys);

        var completeWithOpenPause = UseWork(provider, work => work.CompleteWorkSession(
            created.Value.Id,
            new EmuCompleteWorkSessionDto(null, arrivedAt.AddMinutes(12), "Выполнено", "Пауза еще открыта", null, paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.False(completeWithOpenPause.Succeeded);
        Assert.Contains("employeeIds", completeWithOpenPause.Errors.Keys);

        var resumed = UseWork(provider, work => work.ResumeWorkSession(
            created.Value.Id,
            new EmuResumeWorkSessionDto([SidorovEmployeeId], arrivedAt.AddMinutes(15), "Вернулся", paused.Value!.RowVersion),
            null,
            "operator"));

        Assert.True(resumed.Succeeded);
        Assert.NotNull(resumed.Value);

        var completeTooFarInFuture = UseWork(provider, work => work.CompleteWorkSession(
            created.Value.Id,
            new EmuCompleteWorkSessionDto(null, DateTimeOffset.UtcNow.AddMinutes(5), "Выполнено", "Будущее время", null, resumed.Value!.RowVersion),
            null,
            "operator"));

        Assert.False(completeTooFarInFuture.Succeeded);
        Assert.Contains("completedAt", completeTooFarInFuture.Errors.Keys);

        var completed = UseWork(provider, work => work.CompleteWorkSession(
            created.Value.Id,
            new EmuCompleteWorkSessionDto(null, arrivedAt.AddMinutes(20), "Выполнено", "Работа завершена", null, resumed.Value!.RowVersion),
            null,
            "operator"));

        Assert.True(completed.Succeeded);
        Assert.NotNull(completed.Value!.CompletedAt);
        Assert.Equal("Завершено", completed.Value.OperationalStatus);

        var pauseAfterCompletion = UseWork(provider, work => work.PauseWorkSession(
            created.Value.Id,
            new EmuPauseWorkSessionDto([SidorovEmployeeId], waitReason.Id, arrivedAt.AddMinutes(25), "После завершения", false, completed.Value.RowVersion),
            null,
            "operator"));

        Assert.False(pauseAfterCompletion.Succeeded);
        Assert.Contains("id", pauseAfterCompletion.Errors.Keys);

        var resumeAfterCompletion = UseWork(provider, work => work.ResumeWorkSession(
            created.Value.Id,
            new EmuResumeWorkSessionDto([SidorovEmployeeId], arrivedAt.AddMinutes(25), "После завершения", completed.Value.RowVersion),
            null,
            "operator"));

        Assert.False(resumeAfterCompletion.Succeeded);
        Assert.Contains("id", resumeAfterCompletion.Errors.Keys);

        var completeAfterCompletion = UseWork(provider, work => work.CompleteWorkSession(
            created.Value.Id,
            new EmuCompleteWorkSessionDto(null, arrivedAt.AddMinutes(25), "Выполнено", "Повторно", null, completed.Value.RowVersion),
            null,
            "operator"));

        Assert.False(completeAfterCompletion.Succeeded);
        Assert.Contains("id", completeAfterCompletion.Errors.Keys);
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
    public async Task MaintenanceCreatesAndResolvesEmuNotifications()
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
                DateTimeOffset.UtcNow.AddHours(-3),
                [SidorovEmployeeId],
                "Забытое уведомление ЭМУ"),
            null,
            "operator"));

        Assert.True(created.Succeeded);

        var firstRefresh = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow.Date.AddHours(8)));
        Assert.True(firstRefresh > 0);
        Assert.True(HasEmuNotification(provider, "forgotten_work", "new"));

        var secondRefresh = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow.Date.AddHours(8).AddMinutes(1)));
        Assert.Equal(0, secondRefresh);

        var completed = UseWork(provider, work => work.CompleteWorkSession(
            created.Value!.Id,
            new EmuCompleteWorkSessionDto(null, DateTimeOffset.UtcNow, "Выполнено", "Работа закрыта", null, created.Value.RowVersion),
            null,
            "operator"));

        Assert.True(completed.Succeeded);

        var resolvedRefresh = UseMaintenance(provider, maintenance => maintenance.RefreshNotifications(DateTimeOffset.UtcNow.Date.AddHours(8).AddMinutes(2)));
        Assert.True(resolvedRefresh > 0);
        Assert.True(HasEmuNotification(provider, "forgotten_work", "resolved"));
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

        var rescheduled = UsePlan(provider, plan => plan.ReschedulePlanTask(
            firstTask.Id,
            new EmuReschedulePlanTaskDto(weekStart.AddDays(2), "Перенос по графику смены", firstTask.RowVersion),
            null,
            "manager"));

        Assert.True(rescheduled.Succeeded);
        Assert.Equal(weekStart.AddDays(2), rescheduled.Value!.PlannedDate);
        Assert.True(HasPlanAuditEvent(provider, firstTask.Id, "plan_rescheduled"));
        firstTask = rescheduled.Value;

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
        Assert.Equal(firstTask.Id, workFromApprovedPlan.Value!.PlanTaskId);

        var duplicateWorkFromPlan = UseWork(provider, work => work.CreateWorkSession(
            new EmuCreateWorkSessionDto(
                weekStart,
                section.Id,
                DateTimeOffset.UtcNow,
                [PetrovEmployeeId],
                "Повторный запуск плана",
                firstTask.Id),
            null,
            "operator"));

        Assert.False(duplicateWorkFromPlan.Succeeded);
        Assert.Contains("planTaskId", duplicateWorkFromPlan.Errors.Keys);

        var completedFromPlan = UseWork(provider, work => work.CompleteWorkSession(
            workFromApprovedPlan.Value.Id,
            new EmuCompleteWorkSessionDto(null, DateTimeOffset.UtcNow, "Выполнено", "Плановая работа выполнена", null, workFromApprovedPlan.Value.RowVersion),
            null,
            "operator"));

        Assert.True(completedFromPlan.Succeeded);
        Assert.True(HasPlanAuditEvent(provider, firstTask.Id, "plan_completed_from_work"));

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

    private static T UseShift<T>(ServiceProvider provider, Func<IEmuShiftService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmuShiftService>());
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

    private static bool HasEmuNotification(ServiceProvider provider, string notificationType, string status)
    {
        using var scope = provider.CreateScope();
        var infrastructureAssembly = typeof(Patrol360.Infrastructure.DependencyInjection).Assembly;
        var contextType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Patrol360DbContext")
            ?? throw new InvalidOperationException("Patrol360DbContext type was not found.");
        var notificationEntityType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Entities.EmuNotificationEntity")
            ?? throw new InvalidOperationException("EmuNotificationEntity type was not found.");
        var dbContext = scope.ServiceProvider.GetRequiredService(contextType);
        var setMethod = typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)?.MakeGenericMethod(notificationEntityType)
            ?? throw new InvalidOperationException("DbContext.Set<TEntity>() method was not found.");
        var rows = (IEnumerable<object>)setMethod.Invoke(dbContext, null)!;
        var notificationTypeProperty = notificationEntityType.GetProperty("NotificationType") ?? throw new InvalidOperationException("NotificationType property was not found.");
        var statusProperty = notificationEntityType.GetProperty("Status") ?? throw new InvalidOperationException("Status property was not found.");
        return rows.Any(row =>
            string.Equals(notificationTypeProperty.GetValue(row) as string, notificationType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(statusProperty.GetValue(row) as string, status, StringComparison.OrdinalIgnoreCase));
    }

    private static void ForceWorkSessionEmployee(ServiceProvider provider, Guid workSessionId, Guid employeeId, string fullName)
    {
        using var scope = provider.CreateScope();
        var infrastructureAssembly = typeof(Patrol360.Infrastructure.DependencyInjection).Assembly;
        var contextType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Patrol360DbContext")
            ?? throw new InvalidOperationException("Patrol360DbContext type was not found.");
        var dbContext = (DbContext)scope.ServiceProvider.GetRequiredService(contextType);
        dbContext.Database.ExecuteSqlRaw(
            "UPDATE emu_work_session_employees SET employee_id = {0}, full_name_snapshot = {1} WHERE work_session_id = {2}",
            employeeId,
            fullName,
            workSessionId);
    }

    private static void InvokePresenceRebuild(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IPercoIntegrationService>();
        var method = service.GetType().GetMethod(
            "RebuildPresenceIntervalsForNewEventsAsync",
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("PERCo presence rebuild method was not found.");
        var task = (Task?)method.Invoke(service, [CancellationToken.None])
            ?? throw new InvalidOperationException("PERCo presence rebuild method did not return a task.");
        task.GetAwaiter().GetResult();
    }

    private static T UsePerco<T>(ServiceProvider provider, Func<IPercoIntegrationService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPercoIntegrationService>());
    }

    private static List<PresenceIntervalProbe> ReadPresenceIntervals(string connectionString, Guid employeeId)
    {
        using var connection = new Npgsql.NpgsqlConnection(connectionString);
        connection.Open();
        using var command = new Npgsql.NpgsqlCommand(
            """
            SELECT id, started_at, ended_at, source
            FROM employee_presence_intervals
            WHERE employee_id = @employee_id
            ORDER BY started_at
            """,
            connection);
        command.Parameters.AddWithValue("employee_id", employeeId);
        using var reader = command.ExecuteReader();
        var rows = new List<PresenceIntervalProbe>();
        while (reader.Read())
        {
            rows.Add(new PresenceIntervalProbe(
                reader.GetFieldValue<Guid>(0),
                reader.GetFieldValue<DateTimeOffset>(1),
                reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2),
                reader.GetString(3)));
        }

        return rows;
    }

    private static void InsertPercoAccessEvent(ServiceProvider provider, Guid employeeId, string direction, DateTimeOffset eventAt)
    {
        using var scope = provider.CreateScope();
        var infrastructureAssembly = typeof(Patrol360.Infrastructure.DependencyInjection).Assembly;
        var contextType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Patrol360DbContext")
            ?? throw new InvalidOperationException("Patrol360DbContext type was not found.");
        var dbContext = (DbContext)scope.ServiceProvider.GetRequiredService(contextType);
        dbContext.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS perco_access_events (
                id uuid NOT NULL PRIMARY KEY,
                perco_event_id text NOT NULL DEFAULT '',
                perco_employee_id text NOT NULL DEFAULT '',
                employee_id uuid NULL,
                device_id text NOT NULL DEFAULT '',
                device_name text NOT NULL DEFAULT '',
                direction text NOT NULL DEFAULT 'UNKNOWN',
                event_at timestamp with time zone NOT NULL,
                raw_payload jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                created_at timestamp with time zone NOT NULL
            )
            """);
        dbContext.Database.ExecuteSqlRaw(
            """
            INSERT INTO perco_access_events (
                id,
                perco_event_id,
                perco_employee_id,
                employee_id,
                device_id,
                device_name,
                direction,
                event_at,
                raw_payload,
                created_at)
            VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}::jsonb, {9})
            """,
            Guid.NewGuid(),
            $"test-{Guid.NewGuid():N}",
            employeeId.ToString("N"),
            employeeId,
            "test-turnstile",
            "Тестовый турникет",
            direction,
            eventAt,
            "{}",
            DateTimeOffset.UtcNow);
    }

    private static void InsertPresenceInterval(ServiceProvider provider, Guid employeeId, DateTimeOffset startedAt, DateTimeOffset? endedAt)
    {
        using var scope = provider.CreateScope();
        var infrastructureAssembly = typeof(Patrol360.Infrastructure.DependencyInjection).Assembly;
        var contextType = infrastructureAssembly.GetType("Patrol360.Infrastructure.Persistence.Patrol360DbContext")
            ?? throw new InvalidOperationException("Patrol360DbContext type was not found.");
        var dbContext = (DbContext)scope.ServiceProvider.GetRequiredService(contextType);
        dbContext.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS employee_presence_intervals (
                id uuid NOT NULL PRIMARY KEY,
                employee_id uuid NOT NULL,
                opened_by_event_id uuid NULL,
                closed_by_event_id uuid NULL,
                started_at timestamp with time zone NOT NULL,
                ended_at timestamp with time zone NULL,
                duration_minutes integer NOT NULL DEFAULT 0,
                source text NOT NULL DEFAULT 'PERCO',
                created_at timestamp with time zone NOT NULL
            )
            """);
        dbContext.Database.ExecuteSqlRaw(
            """
            INSERT INTO employee_presence_intervals (
                id,
                employee_id,
                started_at,
                ended_at,
                duration_minutes,
                source,
                created_at)
            VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6})
            """,
            Guid.NewGuid(),
            employeeId,
            startedAt,
            endedAt,
            endedAt is null ? 0 : Math.Max(0, (int)Math.Round((endedAt.Value - startedAt).TotalMinutes)),
            "PERCO",
            DateTimeOffset.UtcNow);
    }

    private static bool HasAuditEvent(ServiceProvider provider, string eventType, string commentContains)
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
        var eventTypeProperty = auditType.GetProperty("EventType") ?? throw new InvalidOperationException("EventType property was not found.");
        var commentProperty = auditType.GetProperty("Comment") ?? throw new InvalidOperationException("Comment property was not found.");
        return rows.Any(row =>
            string.Equals(eventTypeProperty.GetValue(row) as string, eventType, StringComparison.OrdinalIgnoreCase) &&
            (commentProperty.GetValue(row) as string)?.Contains(commentContains, StringComparison.OrdinalIgnoreCase) == true);
    }

    private sealed record PresenceIntervalProbe(Guid Id, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, string Source);
}
