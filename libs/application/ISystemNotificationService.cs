using Patrol360.Contracts;

namespace Patrol360.Application;

public interface ISystemNotificationService
{
    IReadOnlyList<SystemNotificationDto> GetNotifications(SessionUserDto currentUser, int limit);
}
