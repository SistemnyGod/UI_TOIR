using Patrol360.Application;

namespace Patrol360.Infrastructure;

internal sealed class PatrolTimeZone(TimeZoneInfo zone) : IPatrolTimeZone
{
    public TimeZoneInfo Zone { get; } = zone;

    public DateOnly Today => GetDate(DateTimeOffset.UtcNow);

    public DateTimeOffset ToUtc(DateOnly date, TimeOnly time)
    {
        var local = DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified);
        if (Zone.IsInvalidTime(local))
        {
            throw new ArgumentException($"Local patrol time {local:O} does not exist in time zone '{Zone.Id}'.");
        }

        var offset = Zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    public DateTimeOffset StartOfDayUtc(DateOnly date) => ToUtc(date, TimeOnly.MinValue);

    public DateTimeOffset StartOfNextDayUtc(DateOnly date) => StartOfDayUtc(date.AddDays(1));

    public DateOnly GetDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    public TimeOnly GetTime(DateTimeOffset instant) =>
        TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);
}
