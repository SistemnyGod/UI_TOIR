using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class PatrolStatusCodeMapperTests
{
    [Theory]
    [InlineData("Назначена", "assigned")]
    [InlineData("Ожидает принятия", "waiting")]
    [InlineData("В пути", "in_progress")]
    [InlineData("Завершено", "completed")]
    [InlineData("cancelled", "cancelled")]
    [InlineData("Требует решения диспетчера", "dispatcher_review")]
    public void AssignmentLegacyAndAliasesMapToCanonicalCodes(string legacy, string expected) =>
        Assert.Equal(expected, PatrolStatusCodeMapper.ToAssignmentCode(legacy));

    [Theory]
    [InlineData("Новая", "new")]
    [InlineData("Отправлена", "dispatched")]
    [InlineData("Назначена", "assigned")]
    [InlineData("Завершена", "completed")]
    public void RequestLegacyMapsToCanonicalCodes(string legacy, string expected) =>
        Assert.Equal(expected, PatrolStatusCodeMapper.ToRequestCode(legacy));

    [Theory]
    [InlineData("Подтверждено", "confirmed")]
    [InlineData("ok", "confirmed")]
    [InlineData("Замечание", "issue")]
    [InlineData("Просрочено", "overdue")]
    public void ResultLegacyAndAliasesMapToCanonicalCodes(string legacy, string expected) =>
        Assert.Equal(expected, PatrolStatusCodeMapper.ToResultCode(legacy));

    [Fact]
    public void CanonicalCodesMapBackToStableV1LegacyValues()
    {
        Assert.Equal("В пути", PatrolStatusCodeMapper.ToAssignmentLegacy("in_progress"));
        Assert.Equal("Отправлена", PatrolStatusCodeMapper.ToRequestLegacy("dispatched"));
        Assert.Equal("Замечание", PatrolStatusCodeMapper.ToResultLegacy("issue"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("future_custom_status")]
    public void UnknownValuesRemainNullableForSafeAdditiveMigration(string? value)
    {
        Assert.Null(PatrolStatusCodeMapper.ToAssignmentCode(value));
        Assert.Null(PatrolStatusCodeMapper.ToRequestCode(value));
        Assert.Null(PatrolStatusCodeMapper.ToResultCode(value));
    }
}
