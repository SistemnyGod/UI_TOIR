namespace Patrol360.Application;

public interface IPatrolTimeZone
{
    TimeZoneInfo Zone { get; }

    DateOnly Today { get; }

    DateTimeOffset ToUtc(DateOnly date, TimeOnly time);

    DateTimeOffset StartOfDayUtc(DateOnly date);

    DateTimeOffset StartOfNextDayUtc(DateOnly date);

    DateOnly GetDate(DateTimeOffset instant);

    TimeOnly GetTime(DateTimeOffset instant);
}
