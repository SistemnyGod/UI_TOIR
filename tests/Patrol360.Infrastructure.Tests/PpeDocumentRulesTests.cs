using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class PpeDocumentRulesTests
{
    private static readonly DateOnly Date = new(2026, 9, 8);
    private static readonly Guid NormId = Guid.NewGuid();
    private static readonly Guid Requirement = Guid.NewGuid();

    [Fact]
    public void RollingPeriodExcludesAnniversaryButIncludesSelectedDay()
    {
        var content = Content(Line(1));
        var result = PpeDocumentRules.Validate(content, [new(Requirement, Date.AddMonths(-12), 12), new(Requirement, Date, 2)], false, Date, false);
        Assert.Empty(result.Errors);
        Assert.Equal(2, result.Entitlements.Single().AlreadyIssuedQuantity);
        Assert.Equal(10, result.Entitlements.Single().AvailableQuantity);
    }

    [Fact]
    public void LeapDayUsesCalendarMonthBoundary()
    {
        var leapDay = new DateOnly(2024, 2, 29);
        var result = PpeDocumentRules.Validate(Content(Line(1) with { IssueDate = leapDay }),
            [new(Requirement, new(2023, 2, 28), 12), new(Requirement, new(2023, 3, 1), 2)], false, leapDay, false);
        Assert.Equal(new DateOnly(2023, 2, 28), result.Entitlements.Single().PeriodFromExclusive);
        Assert.Equal(2, result.Entitlements.Single().AlreadyIssuedQuantity);
    }

    [Fact]
    public void MultipleItemsUnderSameNormShareLimit()
    {
        var result = PpeDocumentRules.Validate(Content(Line(8), Line(5)), [], false, Date, false);
        Assert.Contains(result.Errors, x => x.Code == "exception_reason");
        Assert.Equal(4, result.Entitlements[1].AvailableQuantity);
    }

    [Fact]
    public void ReasonAllowsOverNormWithoutChangingNormQuantity()
    {
        var content = Content(Line(20) with { ExceptionReason = "Замена повреждённых СИЗ" });
        var result = PpeDocumentRules.Validate(content, [], false, Date, true);
        Assert.Empty(result.Errors);
        Assert.Contains(result.Warnings, x => x.Code == "over_norm");
        Assert.Equal(12, content.NormRows.Single().Quantity);
    }

    [Fact]
    public void UnknownHistoryIsNotDisplayedAsZero()
    {
        var result = PpeDocumentRules.Validate(Content(Line(1)), [], true, Date, false);
        Assert.Null(result.Entitlements.Single().AlreadyIssuedQuantity);
        Assert.Null(result.Entitlements.Single().AvailableQuantity);
        Assert.Contains(result.Errors, x => x.Code == "manual_confirmation");
    }

    [Fact]
    public void KnownUnrelatedHistoryDoesNotRequireManualConfirmation()
    {
        var unrelatedRequirement = Guid.NewGuid();

        var result = PpeDocumentRules.Validate(Content(Line(1)), [new(unrelatedRequirement, Date, 10)], false, Date, false);

        Assert.DoesNotContain(result.Errors, x => x.Code == "manual_confirmation");
        Assert.Equal(0, result.Entitlements.Single().AlreadyIssuedQuantity);
        Assert.Equal(12, result.Entitlements.Single().AvailableQuantity);
    }

    [Fact]
    public void ManualPeriodRequiresAcknowledgementAndReason()
    {
        var content = Content(Line(1)) with { NormRows = [Norm() with { PeriodMonths = null, IssuePeriodText = "до износа" }] };
        Assert.Contains(PpeDocumentRules.Validate(content, [], false, Date, true).Errors, x => x.Code == "manual_confirmation");
        content = content with { Lines = [Line(1) with { ManualControlConfirmed = true, ExceptionReason = "Проверено состояние СИЗ" }] };
        Assert.Empty(PpeDocumentRules.Validate(content, [], false, Date, true).Errors);
    }

    [Fact]
    public void FutureDateIsPrintableButNotConfirmable()
    {
        var content = Content(Line(1) with { IssueDate = Date.AddDays(1) });
        Assert.Empty(PpeDocumentRules.Validate(content, [], false, Date, false).Errors);
        Assert.Contains(PpeDocumentRules.Validate(content, [], false, Date, true).Errors, x => x.Code == "future_date");
    }

    [Fact]
    public void ConversionFactorParticipatesInEntitlement()
    {
        var result = PpeDocumentRules.Validate(Content(Line(8) with { NormUnitsPerItem = 2 }), [], false, Date, false);
        Assert.Contains(result.Errors, x => x.Code == "exception_reason");
    }

    [Fact]
    public void ExtremeQuantityReturnsValidationErrorInsteadOfOverflow()
    {
        var line = Line(1) with { Quantity = decimal.MaxValue, NormUnitsPerItem = 1000000m };
        Assert.Contains(PpeDocumentRules.Validate(Content(line), [], false, Date, false).Errors, x => x.Code == "quantity");
    }

    [Fact]
    public void MissingPriceIsNotZeroAndMoneyRoundsOncePerLine()
    {
        Assert.Null(PpeDocumentRules.LineTotal(1, null));
        Assert.Equal(101, PpeDocumentRules.LineTotal(0.5m, 201));
        Assert.Null(PpeDocumentRules.LineTotal(decimal.MaxValue, long.MaxValue));
        Assert.Null(PpeDocumentRules.Validate(Content(Line(1) with { UnitPriceMinor = null }), [], false, Date, false).TotalMinor);
    }

    private static PpeDocumentNormDto Norm() => new(NormId, null, "item", 0, "Перчатки", "п.1", 12, "пар", "12 пар", "12 пар на год", 12, null, Requirement, "");
    private static PpeDocumentLineDto Line(decimal quantity) => new(Guid.NewGuid(), NormId, Guid.NewGuid(), Date, quantity, 100,
        "", "", false, "Перчатки рабочие", "пар", "", 1, (long)(quantity * 100));
    private static PpeDocumentContentDto Content(params PpeDocumentLineDto[] lines) => new(
        new(Guid.NewGuid(), "Тестовый сотрудник", "TEST", "Участок", "Электромонтер", new()), Guid.NewGuid(), 1,
        "2026", "fixture", Date, "Бухгалтер", "Утверждённые нормы", [Norm()], lines);
}
