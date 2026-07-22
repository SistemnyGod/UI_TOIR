using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class PercoEventPolicyTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-date")]
    public void InvalidPercoTimestampIsRejected(string? value)
    {
        var parsed = EfPercoIntegrationService.TryParsePercoDate(value, "UTC", out var timestamp);

        Assert.False(parsed);
        Assert.Equal(default, timestamp);
    }

    [Fact]
    public void ValidPercoTimestampUsesConfiguredTimezone()
    {
        var parsed = EfPercoIntegrationService.TryParsePercoDate("2026-07-22 08:15:30", "UTC", out var timestamp);

        Assert.True(parsed);
        Assert.Equal(new DateTimeOffset(2026, 7, 22, 8, 15, 30, TimeSpan.Zero), timestamp);
    }
    [Fact]
    public void StoredTechnicalIndicationIsDetected()
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(new { event_name = "Индикация прохода" });

        Assert.True(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent(payload));
    }

    [Fact]
    public void RealOrMalformedStoredEventIsNotFiltered()
    {
        var realEvent = System.Text.Json.JsonSerializer.Serialize(new { event_name = "Проход по идентификатору" });
        var nonStringEvent = System.Text.Json.JsonSerializer.Serialize(new { event_name = 1 });

        Assert.False(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent(null));
        Assert.False(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent("not-json"));
        Assert.False(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent("[]"));
        Assert.False(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent(nonStringEvent));
        Assert.False(EfPercoIntegrationService.IsStoredTechnicalIndicationEvent(realEvent));
    }
}
