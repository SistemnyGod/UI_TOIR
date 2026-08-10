using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class InventoryPpeNormCandidateOrderingTests
{
    [Fact]
    public void ConfirmedMappingComesBeforeAnOrdinaryCandidate()
    {
        var ordinaryCandidate = Candidate("Каска защитная", "candidate");
        var confirmedMapping = Candidate("Ботинки защитные", "confirmed_mapping");

        var ordered = EfInventoryWorkflowService.OrderPpeNormCandidates([ordinaryCandidate, confirmedMapping]);

        Assert.Equal(confirmedMapping.NormRowId, ordered[0].NormRowId);
        Assert.Equal("confirmed_mapping", ordered[0].Status);
    }

    [Fact]
    public void AvailableEntitlementSubtractsPreviouslyIssuedQuantity()
    {
        var result = EfInventoryWorkflowService.CalculatePpeEntitlement(
            normQuantity: 6,
            alreadyIssuedQuantity: 4,
            periodFrom: new DateOnly(2026, 1, 1),
            periodTo: new DateOnly(2026, 12, 31));

        Assert.Equal(6, result.NormQuantity);
        Assert.Equal(4, result.AlreadyIssuedQuantity);
        Assert.Equal(2, result.AvailableQuantity);
        Assert.Equal("resolved", result.Status);
    }

    [Fact]
    public void UnrelatedNormRemainsIncompatibleWhenEntitlementNeedsManualControl()
    {
        var status = EfInventoryWorkflowService.ResolvePpeNormCandidateStatus(
            hasMapping: false,
            textSuggested: false,
            entitlementStatus: "manual_control_required",
            availableQuantity: 1,
            requestedQuantity: 1);

        Assert.Equal("incompatible", status);
    }

    [Fact]
    public void RelatedNormCanRequireManualControl()
    {
        var status = EfInventoryWorkflowService.ResolvePpeNormCandidateStatus(
            hasMapping: false,
            textSuggested: true,
            entitlementStatus: "manual_control_required",
            availableQuantity: 1,
            requestedQuantity: 1);

        Assert.Equal("manual_control_required", status);
    }

    [Fact]
    public void WinterBootsMatchWinterFootwearNorm()
    {
        var result = EfInventoryWorkflowService.EvaluatePpeNormTextCompatibility(
            "Ботинки кожаные зимние ВЛО, шерстяной мех",
            "Средства защиты ног. Сапоги или ботинки утепленные для пониженных температур");

        Assert.True(result.IsCompatible);
        Assert.Contains(result.Reasons, reason => reason.Contains("обувь", StringComparison.Ordinal));
        Assert.Contains(result.Reasons, reason => reason.Contains("зимняя", StringComparison.Ordinal));
    }

    [Fact]
    public void WinterBootsDoNotMatchSummerSuit()
    {
        var result = EfInventoryWorkflowService.EvaluatePpeNormTextCompatibility(
            "Ботинки кожаные зимние ВЛО, шерстяной мех",
            "Костюм летний для защиты от производственных загрязнений");

        Assert.False(result.IsCompatible);
    }

    [Theory]
    [InlineData("Зам. нач. ЭМУ", "Заместитель начальника ЭМУ")]
    [InlineData("Электромонтер по обслуживанию электроустановок", "Электромонтер обслуживанию электроустановок")]
    public void PositionMatchingHandlesSafeAbbreviationsAndServiceWords(string employeePosition, string normPosition)
    {
        Assert.True(EfInventoryWorkflowService.PositionNamesMatch(employeePosition, normPosition));
    }

    private static InventoryPpeNormCandidateDto Candidate(string name, string status) => new(
        Guid.NewGuid(),
        Guid.NewGuid(),
        3,
        name,
        "п. 1",
        1,
        "1 шт.",
        "1 год",
        12,
        0,
        1,
        null,
        status == "confirmed_mapping" ? 2 : 0,
        status,
        ["Причина"],
        []);
}
