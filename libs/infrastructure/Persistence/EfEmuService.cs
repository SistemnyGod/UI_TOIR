using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService(Patrol360DbContext dbContext) :
    IEmuCatalogService,
    IEmuWorkService,
    IEmuShiftService,
    IEmuPlanService,
    IEmuMaintenanceService
{
    private const string StatusInWork = "В работе";
    private const string StatusWaiting = "В ожидании";
    private const string StatusCompleted = "Завершено";
    private const string StatusDone = "Завершил";
    private const string StatusDeleted = "Удалено";
    private const string EmployeeWorking = "Работает";
    private const string EmployeeWaiting = "В ожидании";
    private const string EmployeeOtherWork = "На другой работе";
    private const string EmployeeDone = "Завершил";
    private const string EmployeePartial = "Частично выполнено";
    private const string EmployeeMistaken = "Добавлен ошибочно";
    private const string ParticipationPaused = "На паузе";
    private const string PlanStatusPlanned = "Запланировано";
    private const string PlanStatusInWork = "В работе";
    private const string PlanStatusDone = "Выполнено";
    private const string PlanApprovalApproved = "Согласовано";
    private static readonly TimeSpan MaxFutureManualOperationSkew = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan LongWaitingThreshold = TimeSpan.FromMinutes(60);
    private static readonly TimeSpan ManualCorrectionWindow = TimeSpan.FromHours(24);
    private static readonly TimeSpan DecisionEscalationThreshold = TimeSpan.FromMinutes(30);
    private static readonly string[] ManualCorrectionEventTypes = ["arrived_at_changed", "completed_at_changed", "work_date_changed"];
    private static readonly string[] ManagedNotificationTypes = ["long_waiting", "forgotten_work", "employee_conflict", "overdue_plan", "manual_corrections", "decision"];
    private const int WorkNumberLockKey = 360360;
    private static readonly TimeZoneInfo BusinessTimeZone = ResolveBusinessTimeZone();
}
